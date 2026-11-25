import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../dist/database/prisma.service.js'

export async function checkOrders(app) {
  const api = (await app.getUrl()) + '/api'
  async function request(method, path, token, expected, body) {
    const headers = { 'content-type': 'application/json' }
    if (token) headers.authorization = 'Bearer ' + token
    const response = await fetch(api + path, { method, headers, body: JSON.stringify(body) })
    assert.equal(response.status, expected, method + ' ' + path)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    if (expected !== 204) return response.json()
  }

  const { organisationId: alpha } = await request('POST', '/organisations', 'alice', 201, {
    name: 'Alpha Orders', requestId: randomUUID(),
  })
  const { organisationId: beta } = await request('POST', '/organisations', 'bob', 201, {
    name: 'Beta Orders', requestId: randomUUID(),
  })
  const a = '/organisations/' + alpha
  const b = '/organisations/' + beta
  const orders = a + '/orders'
  async function invite(path, admin, recipient, role) {
    const { userId } = await request('GET', '/me', recipient, 200)
    const { invitationId } = await request('POST', path + '/invitations', admin, 201, { recipientUserId: userId, role })
    await request('POST', '/invitations/' + invitationId + '/accept', recipient, 200)
    return userId
  }
  const bob = await invite(a, 'alice', 'bob', 'salesperson')
  const charlie = await invite(a, 'alice', 'charlie', 'salesperson')
  await invite(b, 'bob', 'charlie', 'manager')
  const customer = await request('POST', a + '/customers', 'alice', 201, { name: 'Order Customer' })
  const product = await request('POST', a + '/products', 'alice', 201, { sku: 'ALPHA', name: 'Sample', unitPrice: '0.05' })
  const second = await request('POST', a + '/products', 'alice', 201, { sku: 'SECOND', name: 'Second', unitPrice: '0.10' })
  const foreignCustomer = await request('POST', b + '/customers', 'bob', 201, { name: 'Foreign Customer' })
  const foreignProduct = await request('POST', b + '/products', 'bob', 201, { sku: 'BETA', name: 'Foreign', unitPrice: '2.00' })
  const input = {
    requestId: randomUUID(), customerId: customer.id, discountPercent: '10',
    lines: [{ productId: product.id, quantity: 1 }],
  }

  assert.deepEqual(await request('GET', orders + '/selectors', 'bob', 200), {
    customers: [customer], products: [product, second],
  })
  await request('GET', orders, 'alice', 403)
  await request('POST', orders, 'alice', 403, input)
  await request('GET', orders, undefined, 401)
  await request('POST', orders, 'bob', 404, { ...input, customerId: foreignCustomer.id })
  await request('POST', orders, 'bob', 404, { ...input, lines: [{ productId: foreignProduct.id, quantity: 1 }] })
  for (const quantity of [0, -1, 1.5, 2_147_483_648, '1']) {
    const error = await request('POST', orders, 'bob', 400, { ...input, lines: [{ productId: product.id, quantity }] })
    assert.match(error.message, /Line 1 quantity/)
  }
  for (const discountPercent of ['-1', '100.01', '10.001', 10]) {
    const error = await request('POST', orders, 'bob', 400, { ...input, discountPercent })
    assert.match(error.message, /Discount percent/)
  }
  await request('POST', orders, 'bob', 400, { ...input, lines: [] })
  assert.deepEqual(await request('GET', orders, 'bob', 200), { orders: [] })

  // The request key is checked under the same tenant lock as the write.
  const [approved, retry] = await Promise.all([
    request('POST', orders, 'bob', 201, input),
    request('POST', orders, 'bob', 201, { ...input, discountPercent: '10.00' }),
  ])
  assert.deepEqual(approved, retry)
  assert.equal(approved.status, 'approved')
  assert.equal(approved.approvalThresholdPercent, '10.00')
  assert.equal(approved.subtotal, '0.05')
  assert.equal(approved.total, '0.05') // 4.5 cents rounds up.
  assert.deepEqual(approved.history.map(({ kind, actorUserId, fromStatus, toStatus }) => (
    { kind, actorUserId, fromStatus, toStatus }
  )), [
    { kind: 'submitted', actorUserId: bob, fromStatus: null, toStatus: 'pending' },
    { kind: 'automatically_approved', actorUserId: null, fromStatus: 'pending', toStatus: 'approved' },
  ])
  await request('POST', orders, 'bob', 409, { ...input, discountPercent: '10.01' })
  const pending = await request('POST', orders, 'bob', 201, { ...input, requestId: randomUUID(), discountPercent: '10.01' })
  assert.equal(pending.status, 'pending')
  assert.equal(pending.total, '0.04')
  assert.deepEqual(pending.history.map(({ kind }) => kind), ['submitted'])
  const multi = await request('POST', orders, 'bob', 201, {
    ...input, requestId: randomUUID(), lines: [{ productId: second.id, quantity: 3 }, ...input.lines],
  })
  assert.equal(multi.subtotal, '0.35')
  assert.equal(multi.total, '0.32')
  assert.deepEqual(multi.lines.map(({ productId }) => productId), [second.id, product.id])

  await request('GET', orders + '/' + approved.id, 'charlie', 404)
  assert.deepEqual(await request('GET', orders, 'charlie', 200), { orders: [] })
  await request('GET', b + '/orders/' + approved.id, 'charlie', 404)
  await request('GET', orders + '?status=unknown', 'bob', 400)
  await request('PATCH', a + '/memberships/' + charlie, 'alice', 200, { role: 'manager' })
  await request('GET', orders + '/selectors', 'charlie', 403)
  await request('POST', orders, 'charlie', 403, input)
  assert.deepEqual(await request('GET', orders + '/' + approved.id, 'charlie', 200), approved)
  const { orders: all } = await request('GET', orders, 'charlie', 200)
  assert.deepEqual(new Set(all.map(({ id }) => id)), new Set([approved.id, pending.id, multi.id]))
  const { orders: queue } = await request('GET', orders + '?status=pending', 'charlie', 200)
  assert.deepEqual(queue.map(({ id }) => id), [pending.id])

  const database = app.get(PrismaService).client
  // Set the policy directly because the feature currently reads settings from PostgreSQL.
  const setThreshold = (organisationId, value) => database.organisation.update({
    where: { id: organisationId },
    data: { settings: { orderApprovalThresholdBasisPoints: value, otherSetting: true } },
  })
  await setThreshold(alpha, 1_001)
  const customInput = { ...input, requestId: randomUUID(), discountPercent: '10.01' }
  const custom = await request('POST', orders, 'bob', 201, customInput)
  assert.equal(custom.status, 'approved')
  assert.equal(custom.approvalThresholdPercent, '10.01')
  const aboveCustom = await request('POST', orders, 'bob', 201, {
    ...customInput, requestId: randomUUID(), discountPercent: '10.02',
  })
  assert.equal(aboveCustom.status, 'pending')
  assert.deepEqual(await request('GET', orders + '/' + pending.id, 'bob', 200), pending)
  await setThreshold(alpha, '1001')
  const newRequest = { ...customInput, requestId: randomUUID() }
  await request('POST', orders, 'bob', 500, newRequest)
  assert.deepEqual(await request('POST', orders, 'bob', 201, customInput), custom)
  await setThreshold(alpha, 0)
  const zeroThreshold = await request('POST', orders, 'bob', 201, newRequest)
  assert.equal(zeroThreshold.status, 'pending')
  assert.equal(zeroThreshold.approvalThresholdPercent, '0.00')

  await request('PUT', a + '/products/' + product.id, 'alice', 200, { ...product, unitPrice: '14.00' })
  await request('PUT', a + '/customers/' + customer.id, 'alice', 200, { name: 'Renamed' })
  assert.deepEqual(await request('GET', orders + '/' + approved.id, 'bob', 200), approved)
  await request('DELETE', a + '/products/' + product.id, 'alice', 204)
  await request('DELETE', a + '/customers/' + customer.id, 'alice', 204)
  assert.deepEqual(await request('POST', orders, 'bob', 201, input), approved)
  await request('DELETE', a + '/memberships/' + bob, 'alice', 204)
  await request('POST', orders, 'bob', 404, input)
  await request('GET', orders + '/' + approved.id, 'bob', 404)
}
