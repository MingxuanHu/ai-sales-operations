import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../dist/database/prisma.service.js'

export async function checkDemos(app) {
  const db = app.get(PrismaService).client
  const base = (await app.getUrl()) + '/api'
  const get = (path, token) => fetch(base + path, { headers: { authorization: 'Bearer ' + token } })
  const create = (requestId) => fetch(base + '/organisations/demo', {
    method: 'POST', headers: { authorization: 'Bearer legacy', 'content-type': 'application/json' },
    body: JSON.stringify({ requestId }),
  })
  // Seed the identity as it would exist before deployment, with a separate working organisation.
  const { userId } = await db.externalIdentity.create({ data: { subject: 'synthetic-legacy', user: { create: {} } } })
  const regular = await db.organisation.create({
    data: {
      name: 'Existing business', createdByUserId: userId, creationRequestId: randomUUID(),
      memberships: { create: { userId, role: 'admin' } },
      customers: { create: { name: 'Existing customer' } },
    },
    include: { customers: true, products: true, orders: true },
  })
  const profile = async (token) => {
    const response = await get('/me', token)
    assert.equal(response.status, 200)
    return response.json()
  }
  assert.deepEqual((await profile('legacy')).memberships, [
    { organisationId: regular.id, name: regular.name, role: 'admin', isDemo: false },
  ])
  assert.equal((await create(regular.creationRequestId)).status, 409)
  assert.equal((await create('invalid')).status, 400)

  const key = randomUUID()
  // NOT VALID skips past rows but still rejects the final fixture insert during the transaction.
  await db.$executeRaw`ALTER TABLE order_events ADD CONSTRAINT fail_demo_history CHECK (false) NOT VALID`
  try {
    assert.equal((await create(key)).status, 500)
    assert.equal((await get('/me', 'new-user')).status, 500)
    assert.equal(await db.externalIdentity.count({ where: { subject: 'synthetic-new-user' } }), 0)
    assert.equal(await db.organisation.count({ where: { createdByUserId: userId } }), 1)
    assert.equal((await profile('legacy')).memberships.length, 1)
  } finally {
    await db.$executeRaw`ALTER TABLE order_events DROP CONSTRAINT fail_demo_history`
  }

  const newProfile = await profile('new-user')
  assert.equal(newProfile.memberships.length, 1)
  assert.deepEqual(await profile('new-user'), newProfile)

  const replay = await Promise.all([create(key), create(key)])
  assert.deepEqual(replay.map((response) => response.status).sort(), [200, 201])
  const [first, same] = await Promise.all(replay.map((response) => response.json()))
  assert.deepEqual(same, first)
  const secondResponse = await create(randomUUID())
  assert.equal(secondResponse.status, 201)
  const second = await secondResponse.json()
  assert.notEqual(first.name, second.name)
  assert.notEqual(first.organisationId, second.organisationId)
  assert.equal((await profile('legacy')).memberships.length, 3)
  assert.equal((await get('/organisations/' + first.organisationId + '/products', 'alice')).status, 404)
  const demoOrdersPath = '/organisations/' + first.organisationId + '/orders'
  assert.equal((await get(demoOrdersPath, 'alice')).status, 404)
  const demoOrders = await get(demoOrdersPath, 'legacy')
  assert.equal(demoOrders.status, 200)
  const { orders } = await demoOrders.json()
  assert.equal(orders.length, 24)
  const detail = await get(demoOrdersPath + '/' + orders[0].id, 'legacy')
  assert.equal(detail.status, 200)
  assert.ok((await detail.json()).history.length >= 1)
  assert.deepEqual(await db.organisation.findUnique({
    where: { id: regular.id }, include: { customers: true, products: true, orders: true },
  }), regular)

  for (const membership of [first, second, newProfile.memberships[0]]) {
    assert.equal(membership.role, 'admin')
    const demo = await db.organisation.findUniqueOrThrow({
      where: { id: membership.organisationId },
      include: { customers: true, products: true, orders: {
        include: { lines: true, history: { orderBy: { position: 'asc' } } },
      } },
    })
    assert.equal(demo.settings.isDemo, true)
    assert.equal(demo.customers.length, 5)
    assert.equal(demo.products.length, 6)
    const counts = { fulfilled: 0, pending: 0, approved: 0, rejected: 0 }
    const weeks = Array(8).fill(0)
    const customers = Object.fromEntries(demo.customers.map(({ name }) => [name, 0]))
    const units = Object.fromEntries(demo.products.map(({ sku }) => [sku, 0]))
    const productGross = { 'CUP-08': 0, 'CUP-12': 0, 'LID-90': 0, 'BAG-KR': 0, 'NAP-2P': 0, 'TRAY-4': 0 }
    let manualApprovals = 0
    for (const order of demo.orders) {
      counts[order.status]++
      assert.equal(order.submittedByUserId, null)
      assert.ok(demo.customers.some((customer) => customer.id === order.customerId && customer.name === order.customerName))
      assert.ok(order.lines.length >= 2)
      for (const line of order.lines) {
        assert.ok(demo.products.some((product) => product.id === line.productId && product.sku === line.sku))
      }
      assert.equal(order.history[0].kind, 'submitted')
      assert.equal(order.history[0].createdAt.getTime(), order.createdAt.getTime())
      const last = order.history.at(-1)
      assert.equal(last.toStatus, order.status)
      for (const [index, event] of order.history.entries()) {
        const previous = order.history[index - 1]
        assert.equal(event.actorUserId, null)
        assert.equal(event.fromStatus, previous?.toStatus ?? null)
        if (previous) assert.ok(event.createdAt >= previous.createdAt)
      }
      if (order.history.some((event) => event.kind === 'approved')) manualApprovals++
      if (order.status !== 'fulfilled') continue
      const week = Math.floor((demo.createdAt - last.createdAt) / (7 * 24 * 60 * 60 * 1_000))
      const totalCents = order.total.times(100).toNumber()
      weeks[week] += totalCents
      customers[order.customerName] += totalCents
      for (const line of order.lines) {
        units[line.sku] += line.quantity
        productGross[line.sku] += line.unitPrice.times(100 * line.quantity).toNumber()
      }
    }
    assert.deepEqual(counts, { fulfilled: 20, pending: 2, approved: 1, rejected: 1 })
    assert.equal(manualApprovals, 3)
    assert.deepEqual(weeks, [141636, 108672, 171650, 114603, 59910, 127803, 65858, 60086])
    assert.equal(weeks.reduce((sum, week) => sum + week, 0), 850218)
    assert.deepEqual(customers, {
      'Fern Lane Café': 251581, 'Juniper Bakehouse': 113498, 'Paperbark Coffee': 207546,
      'Wattle Corner Deli': 223970, 'Banksia Kiosk': 53623,
    })
    assert.deepEqual(units, { 'CUP-08': 39, 'CUP-12': 48, 'LID-90': 79, 'BAG-KR': 39, 'NAP-2P': 27, 'TRAY-4': 14 })
    assert.deepEqual(productGross, {
      'CUP-08': 173550, 'CUP-12': 253200, 'LID-90': 270575, 'BAG-KR': 116220, 'NAP-2P': 66420, 'TRAY-4': 27930,
    })
  }

  // The confirmed delete removes all tenant records while leaving identities and other tenants intact.
  const deleteDemo = (id, token, confirmationName) => fetch(base + '/organisations/' + id, {
    method: 'DELETE', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ confirmationName }),
  })
  const { organisationId } = first
  const alice = await profile('alice')
  await db.membership.create({ data: { organisationId, userId: alice.userId, role: 'manager' } })

  // The same HTTP report must reconcile at every aggregation level.
  const reportPath = (id) => '/organisations/' + id + '/reports/sales'
  const salesPath = reportPath(organisationId)
  const reportResponse = await get(salesPath, 'legacy')
  assert.equal(reportResponse.status, 200)
  const report = await reportResponse.json()
  assert.equal(report.fulfilledOrderCount, 20)
  assert.equal(report.netSales, '8502.18')
  assert.equal(report.daily.length, 60)
  assert.ok(report.daily.some((day) => day.netSales === '0.00'))
  assert.equal(report.customers[0].name, 'Fern Lane Café')
  assert.equal(report.customers[0].netSales, '2515.81')
  assert.equal(report.products.find(({ name }) => /90 mm cup lids/i.test(name)).casesSold, 79)
  for (const entries of [report.daily, report.customers, report.products]) {
    assert.equal(entries.reduce((sum, entry) => sum + BigInt(entry.netSales.replace('.', '')), 0n), 850218n)
  }

  assert.deepEqual(await (await get(salesPath, 'alice')).json(), report)
  assert.equal((await get(reportPath(second.organisationId), 'alice')).status, 404)
  assert.equal((await fetch(base + salesPath)).status, 401)
  assert.equal((await get(salesPath + '?startDate=2026-02-30&endDate=2026-03-01', 'legacy')).status, 400)
  assert.equal((await get(salesPath + '?startDate=2024-01-01&endDate=2025-01-01', 'legacy')).status, 400)

  const saleDay = report.daily.find((day) => day.netSales !== '0.00')
  const dateQuery = '?startDate=' + saleDay.date + '&endDate=' + saleDay.date
  const narrowed = await (await get(salesPath + dateQuery, 'legacy')).json()
  assert.equal(narrowed.netSales, saleDay.netSales)
  assert.deepEqual(narrowed.daily, [saleDay])
  assert.ok(narrowed.fulfilledOrderCount > 0 && narrowed.fulfilledOrderCount < 20)
  assert.deepEqual(await (await get(reportPath(regular.id) + dateQuery, 'legacy')).json(), {
    startDate: saleDay.date, endDate: saleDay.date, fulfilledOrderCount: 0, netSales: '0.00',
    daily: [{ date: saleDay.date, netSales: '0.00' }], products: [], customers: [],
  })

  // Change the membership behind the same token to verify that each read rechecks access.
  const aliceMembership = { organisationId, userId: alice.userId }
  const setAlice = (data) => db.membership.update({ where: { organisationId_userId: aliceMembership }, data })
  await setAlice({ role: 'salesperson' })
  assert.equal((await get(salesPath, 'alice')).status, 403)
  await setAlice({ status: 'removed' })
  assert.equal((await get(salesPath, 'alice')).status, 404)
  await setAlice({ role: 'manager', status: 'active' })
  await db.invitation.create({ data: {
    organisationId, issuedByUserId: userId, recipientUserId: newProfile.userId,
    role: 'salesperson', expiresAt: new Date(Date.now() + 60_000),
  } })
  const orderIds = orders.map(({ id }) => id)
  await db.organisation.update({ where: { id: regular.id }, data: { settings: { isDemo: 'true' } } })
  assert.equal((await deleteDemo(regular.id, 'legacy', regular.name)).status, 403)
  assert.equal((await deleteDemo(organisationId, 'charlie', first.name)).status, 404)
  assert.equal((await deleteDemo(organisationId, 'alice', first.name)).status, 403)
  assert.equal((await deleteDemo(organisationId, 'legacy', first.name + ' ')).status, 409)
  assert.equal(await db.salesOrder.count({ where: { organisationId } }), 24)

  assert.equal((await deleteDemo(organisationId, 'legacy', first.name)).status, 204)
  assert.equal(await db.organisation.findUnique({ where: { id: organisationId } }), null)
  assert.equal(await db.orderLine.count({ where: { orderId: { in: orderIds } } }), 0)
  assert.equal(await db.orderEvent.count({ where: { orderId: { in: orderIds } } }), 0)
  assert.equal(await db.salesOrder.count({ where: { organisationId } }), 0)
  assert.equal(await db.invitation.count({ where: { organisationId } }), 0)
  assert.equal(await db.membership.count({ where: { organisationId } }), 0)
  assert.equal(await db.customer.count({ where: { organisationId } }), 0)
  assert.equal(await db.product.count({ where: { organisationId } }), 0)
  assert.equal(await db.salesOrder.count({ where: { organisationId: second.organisationId } }), 24)
  assert.ok(await db.organisation.findUnique({ where: { id: regular.id } }))
  assert.equal((await profile('legacy')).userId, userId)
  assert.equal((await profile('alice')).userId, alice.userId)
  assert.equal((await get(demoOrdersPath, 'legacy')).status, 404)

}
