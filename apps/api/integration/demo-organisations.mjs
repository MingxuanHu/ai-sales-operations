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
  assert.equal(orders.length, 32)
  const detail = await get(demoOrdersPath + '/' + orders[0].id, 'legacy')
  assert.equal(detail.status, 200)
  assert.ok((await detail.json()).history.length >= 1)
  assert.deepEqual(await db.organisation.findUnique({
    where: { id: regular.id }, include: { customers: true, products: true, orders: true },
  }), regular)

  const reportPath = (id) => '/organisations/' + id + '/reports/sales'
  for (const [membership, token] of [[first, 'legacy'], [second, 'legacy'], [newProfile.memberships[0], 'new-user']]) {
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
    assert.deepEqual(counts, { fulfilled: 28, pending: 2, approved: 1, rejected: 1 })
    assert.equal(manualApprovals, 4)
    assert.deepEqual(weeks, [255666, 108672, 247246, 159163, 121939, 177503, 115716, 98876])
    assert.equal(weeks.reduce((sum, week) => sum + week, 0), 1284781)
    assert.deepEqual(customers, {
      'Fern Lane Café': 301281, 'Juniper Bakehouse': 218796, 'Paperbark Coffee': 283142,
      'Wattle Corner Deli': 268530, 'Banksia Kiosk': 213032,
    })
    assert.deepEqual(units, { 'CUP-08': 59, 'CUP-12': 60, 'LID-90': 106, 'BAG-KR': 75, 'NAP-2P': 49, 'TRAY-4': 41 })
    assert.deepEqual(productGross, {
      'CUP-08': 262550, 'CUP-12': 316500, 'LID-90': 363050, 'BAG-KR': 223500, 'NAP-2P': 120540, 'TRAY-4': 81795,
    })

    const salesPath = reportPath(demo.id)
    // Use each demo's UTC creation day so the expected buckets work even across midnight.
    const day = 86_400_000
    const dateLabel = (timestamp) => new Date(timestamp).toISOString().slice(0, 10)
    const dateAtAge = (age) => dateLabel(demo.createdAt.getTime() - age * day)
    const dailySales = new Map([
      [1, '641.20'], [3, '585.90'], [5, '1329.56'], [8, '291.65'], [10, '601.97'],
      [12, '193.10'], [15, '532.35'], [16, '755.96'], [17, '840.82'], [20, '343.33'],
      [22, '445.60'], [23, '508.80'], [25, '164.73'], [27, '472.50'], [29, '620.29'],
      [30, '321.90'], [33, '277.20'], [35, '678.83'], [36, '497.00'], [37, '178.40'],
      [40, '420.80'], [42, '498.58'], [45, '435.78'], [47, '222.80'], [49, '387.90'],
      [52, '285.86'], [54, '315.00'],
    ].map(([age, netSales]) => [dateAtAge(age), netSales]))
    // Resolve fixture names and SKUs to the tenant's IDs while preserving expected rank order.
    const customerRanks = (rows) => rows.map(([name, netSales]) => ({
      id: demo.customers.find((customer) => customer.name === name).id, name, netSales,
    }))
    const productRanks = (rows) => rows.map(([sku, netSales, casesSold]) => {
      const { id, name } = demo.products.find((product) => product.sku === sku)
      return { id, name, netSales, casesSold }
    })
    const readReport = async (query = '') => {
      const response = await get(salesPath + query, token)
      assert.equal(response.status, 200)
      return response.json()
    }

    const report = await readReport()
    const expectedDaily = Array.from({ length: 60 }, (_, index) => {
      const date = dateLabel(Date.parse(report.endDate) - (59 - index) * day)
      return { date, netSales: dailySales.get(date) ?? '0.00' }
    })
    assert.deepEqual(report, {
      startDate: expectedDaily[0].date, endDate: expectedDaily.at(-1).date,
      fulfilledOrderCount: 28, netSales: '12847.81', daily: expectedDaily,
      customers: customerRanks([
        ['Fern Lane Café', '3012.81'], ['Paperbark Coffee', '2831.42'],
        ['Wattle Corner Deli', '2685.30'], ['Juniper Bakehouse', '2187.96'], ['Banksia Kiosk', '2130.32'],
      ]),
      products: productRanks([
        ['LID-90', '3358.21', 106], ['CUP-12', '2925.01', 60], ['CUP-08', '2450.84', 59],
        ['BAG-KR', '2194.77', 75], ['NAP-2P', '1159.89', 49], ['TRAY-4', '759.09', 41],
      ]),
    })

    const startDate = dateAtAge(5)
    const endDate = dateAtAge(2)
    const narrowed = await readReport('?startDate=' + startDate + '&endDate=' + endDate)
    assert.deepEqual(narrowed, {
      startDate, endDate, fulfilledOrderCount: 3, netSales: '1915.46',
      daily: [5, 4, 3, 2].map((age) => ({
        date: dateAtAge(age), netSales: dailySales.get(dateAtAge(age)) ?? '0.00',
      })),
      customers: customerRanks([
        ['Fern Lane Café', '775.16'], ['Banksia Kiosk', '585.90'], ['Juniper Bakehouse', '554.40'],
      ]),
      products: productRanks([
        ['CUP-08', '669.72', 17], ['LID-90', '515.47', 17], ['BAG-KR', '357.60', 12],
        ['NAP-2P', '282.90', 12], ['TRAY-4', '89.77', 5],
      ]),
    })
    for (const result of [report, narrowed]) {
      const cents = (amount) => BigInt(amount.replace('.', ''))
      for (const entries of [result.daily, result.customers, result.products]) {
        assert.equal(entries.reduce((sum, entry) => sum + cents(entry.netSales), 0n), cents(result.netSales))
      }
    }
  }

  // The confirmed delete removes all tenant records while leaving identities and other tenants intact.
  const deleteDemo = (id, token, confirmationName) => fetch(base + '/organisations/' + id, {
    method: 'DELETE', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ confirmationName }),
  })
  const { organisationId } = first
  const alice = await profile('alice')
  await db.membership.create({ data: { organisationId, userId: alice.userId, role: 'manager' } })

  const salesPath = reportPath(organisationId)
  const report = await (await get(salesPath, 'legacy')).json()
  assert.deepEqual(await (await get(salesPath, 'alice')).json(), report)
  assert.equal((await get(reportPath(second.organisationId), 'alice')).status, 404)
  assert.equal((await fetch(base + salesPath)).status, 401)
  assert.equal((await get(salesPath + '?startDate=2026-02-30&endDate=2026-03-01', 'legacy')).status, 400)
  assert.equal((await get(salesPath + '?startDate=2024-01-01&endDate=2025-01-01', 'legacy')).status, 400)

  const saleDay = report.daily.find((day) => day.netSales !== '0.00')
  const dateQuery = '?startDate=' + saleDay.date + '&endDate=' + saleDay.date
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
  assert.equal(await db.salesOrder.count({ where: { organisationId } }), 32)

  assert.equal((await deleteDemo(organisationId, 'legacy', first.name)).status, 204)
  assert.equal(await db.organisation.findUnique({ where: { id: organisationId } }), null)
  assert.equal(await db.orderLine.count({ where: { orderId: { in: orderIds } } }), 0)
  assert.equal(await db.orderEvent.count({ where: { orderId: { in: orderIds } } }), 0)
  assert.equal(await db.salesOrder.count({ where: { organisationId } }), 0)
  assert.equal(await db.invitation.count({ where: { organisationId } }), 0)
  assert.equal(await db.membership.count({ where: { organisationId } }), 0)
  assert.equal(await db.customer.count({ where: { organisationId } }), 0)
  assert.equal(await db.product.count({ where: { organisationId } }), 0)
  assert.equal(await db.salesOrder.count({ where: { organisationId: second.organisationId } }), 32)
  assert.ok(await db.organisation.findUnique({ where: { id: regular.id } }))
  assert.equal((await profile('legacy')).userId, userId)
  assert.equal((await profile('alice')).userId, alice.userId)
  assert.equal((await get(demoOrdersPath, 'legacy')).status, 404)

}
