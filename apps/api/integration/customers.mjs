import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export async function checkCustomers(app) {
  const apiUrl = (await app.getUrl()) + '/api'
  async function request(method, path, token, expectedStatus, body) {
    const headers = { 'content-type': 'application/json' }
    if (token) headers.authorization = 'Bearer ' + token
    const response = await fetch(apiUrl + path, { method, headers, body: JSON.stringify(body) })
    assert.equal(response.status, expectedStatus, method + ' ' + path)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    return expectedStatus === 204 ? undefined : response.json()
  }

  const alpha = await request('POST', '/organisations', 'alice', 201, { name: 'Alpha Directory', requestId: randomUUID() })
  const beta = await request('POST', '/organisations', 'bob', 201, { name: 'Beta Directory', requestId: randomUUID() })
  const alphaPath = '/organisations/' + alpha.organisationId
  const alphaCustomers = alphaPath + '/customers'
  const betaCustomers = '/organisations/' + beta.organisationId + '/customers'
  const { userId: bob } = await request('GET', '/me', 'bob', 200)
  const { invitationId } = await request('POST', alphaPath + '/invitations', 'alice', 201, {
    recipientUserId: bob, role: 'salesperson',
  })
  await request('POST', '/invitations/' + invitationId + '/accept', 'bob', 200)
  const input = { name: 'Acme Wholesale' }

  await request('POST', alphaCustomers, undefined, 401, input)
  await request('POST', alphaCustomers, 'charlie', 404, input)
  for (const invalid of [
    { name: ' ' }, { name: 42 }, { name: 'A'.repeat(121) }, { name: 'A\0B' },
  ]) {
    const error = await request('POST', alphaCustomers, 'alice', 400, { ...input, ...invalid })
    assert.match(error.message, /Name/)
  }
  assert.deepEqual(await request('GET', alphaCustomers, 'alice', 200), { customers: [] })

  // The path determines the tenant even if the caller submits an organisation ID.
  const customer = await request('POST', alphaCustomers, 'alice', 201, {
    name: '  Acme Wholesale  ', organisationId: beta.organisationId,
  })
  const item = alphaCustomers + '/' + customer.id
  assert.deepEqual(customer, { ...input, id: customer.id })
  assert.deepEqual(await request('GET', item, 'alice', 200), customer)
  assert.deepEqual(await request('GET', alphaCustomers, 'alice', 200), { customers: [customer] })

  // Bob's administrator role in Beta cannot grant him customer access in Alpha.
  for (const role of ['salesperson', 'manager']) {
    if (role === 'manager') await request('PATCH', alphaPath + '/memberships/' + bob, 'alice', 200, { role })
    await request('GET', alphaCustomers, 'bob', 403)
    await request('POST', alphaCustomers, 'bob', 403, input)
    await request('GET', item, 'bob', 403)
    await request('PUT', item, 'bob', 403, input)
    await request('DELETE', item, 'bob', 403)
  }
  const betaCustomer = await request('POST', betaCustomers, 'bob', 201, input)
  assert.notEqual(betaCustomer.id, customer.id)
  const foreignItem = betaCustomers + '/' + customer.id
  await request('GET', foreignItem, 'bob', 404)
  await request('PUT', foreignItem, 'bob', 404, input)
  await request('DELETE', foreignItem, 'bob', 404)
  assert.deepEqual(await request('GET', betaCustomers, 'bob', 200), { customers: [betaCustomer] })

  const updated = { name: 'Acme Distribution' }
  await request('PUT', item, 'alice', 400, { name: '' })
  assert.deepEqual(await request('GET', item, 'alice', 200), customer)
  assert.deepEqual(await request('PUT', item, 'alice', 200, updated), { ...updated, id: customer.id })

  // A role granted or removed after sign-in takes effect on the next request.
  await request('PATCH', alphaPath + '/memberships/' + bob, 'alice', 200, { role: 'admin' })
  await request('POST', alphaCustomers, 'bob', 201, input)
  await request('DELETE', alphaPath + '/memberships/' + bob, 'alice', 204)
  await request('POST', alphaCustomers, 'bob', 404, input)
  await request('DELETE', item, 'alice', 204)
  await request('GET', item, 'alice', 404)
}
