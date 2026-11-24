import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

export async function checkProducts(app) {
  const apiUrl = (await app.getUrl()) + '/api'
  async function request(method, path, token, expectedStatus, body) {
    const headers = { 'content-type': 'application/json' }
    if (token) headers.authorization = 'Bearer ' + token
    const response = await fetch(apiUrl + path, { method, headers, body: JSON.stringify(body) })
    assert.equal(response.status, expectedStatus, method + ' ' + path)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    return expectedStatus === 204 ? undefined : response.json()
  }

  const alpha = await request('POST', '/organisations', 'alice', 201, { name: 'Alpha Catalogue', requestId: randomUUID() })
  const beta = await request('POST', '/organisations', 'bob', 201, { name: 'Beta Catalogue', requestId: randomUUID() })
  const alphaPath = '/organisations/' + alpha.organisationId
  const alphaProducts = alphaPath + '/products'
  const betaProducts = '/organisations/' + beta.organisationId + '/products'
  const { userId: bob } = await request('GET', '/me', 'bob', 200)
  const { invitationId } = await request('POST', alphaPath + '/invitations', 'alice', 201, {
    recipientUserId: bob, role: 'salesperson',
  })
  await request('POST', '/invitations/' + invitationId + '/accept', 'bob', 200)
  const input = { sku: 'BOX-01', name: 'Shipping box', unitPrice: '12.30' }

  await request('POST', alphaProducts, undefined, 401, input)
  await request('POST', alphaProducts, 'charlie', 404, input)
  for (const invalid of [
    { sku: ' ' }, { sku: 'A'.repeat(65) }, { name: '' }, { name: 'A'.repeat(121) },
    { unitPrice: -1 }, { unitPrice: '-0.01' }, { unitPrice: '1.001' }, { unitPrice: '10000000000' },
  ]) {
    const error = await request('POST', alphaProducts, 'alice', 400, { ...input, ...invalid })
    assert.match(error.message, /SKU|Name|Unit price/)
  }
  assert.deepEqual(await request('GET', alphaProducts, 'alice', 200), { products: [] })

  // Concurrent submissions rely on the database's unique constraint.
  const [one, two] = await Promise.all([1, 2].map(() => fetch(apiUrl + alphaProducts, {
    method: 'POST',
    headers: { authorization: 'Bearer alice', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })))
  assert.deepEqual([one.status, two.status].sort(), [201, 409])
  const product = await (one.ok ? one : two).json()
  const item = alphaProducts + '/' + product.id
  assert.deepEqual(product, { ...input, id: product.id })
  assert.deepEqual(await request('GET', item, 'alice', 200), product)
  assert.deepEqual(await request('GET', alphaProducts, 'alice', 200), { products: [product] })

  // Bob's administrator role in Beta cannot grant him product access in Alpha.
  for (const role of ['salesperson', 'manager']) {
    if (role === 'manager') await request('PATCH', alphaPath + '/memberships/' + bob, 'alice', 200, { role })
    await request('GET', alphaProducts, 'bob', 403)
    await request('POST', alphaProducts, 'bob', 403, input)
    await request('GET', item, 'bob', 403)
    await request('PUT', item, 'bob', 403, input)
    await request('DELETE', item, 'bob', 403)
  }
  const betaProduct = await request('POST', betaProducts, 'bob', 201, input)
  assert.notEqual(betaProduct.id, product.id)
  const foreignItem = betaProducts + '/' + product.id
  await request('GET', foreignItem, 'bob', 404)
  await request('PUT', foreignItem, 'bob', 404, input)
  await request('DELETE', foreignItem, 'bob', 404)
  assert.deepEqual(await request('GET', betaProducts, 'bob', 200), { products: [betaProduct] })

  const updated = { ...input, sku: 'BOX-02', name: 'Large shipping box', unitPrice: '0.00' }
  const other = await request('POST', alphaProducts, 'alice', 201, { ...input, sku: updated.sku })
  await request('PUT', item, 'alice', 409, updated)
  assert.deepEqual(await request('GET', item, 'alice', 200), product)
  await request('DELETE', alphaProducts + '/' + other.id, 'alice', 204)
  assert.deepEqual(await request('PUT', item, 'alice', 200, updated), { ...updated, id: product.id })

  // A role granted or removed after sign-in takes effect on the next request.
  await request('PATCH', alphaPath + '/memberships/' + bob, 'alice', 200, { role: 'admin' })
  await request('POST', alphaProducts, 'bob', 201, input)
  await request('DELETE', alphaPath + '/memberships/' + bob, 'alice', 204)
  await request('POST', alphaProducts, 'bob', 404, input)
  await request('DELETE', item, 'alice', 204)
  await request('GET', item, 'alice', 404)
}
