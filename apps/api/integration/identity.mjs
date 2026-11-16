import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../dist/database/prisma.service.js'

export async function checkIdentity(app) {
  const apiUrl = (await app.getUrl()) + '/api'
  async function request(method, path, token, expectedStatus, body) {
    const headers = {}
    if (token) headers.authorization = 'Bearer ' + token
    if (body) headers['content-type'] = 'application/json'
    const response = await fetch(apiUrl + path, { method, headers, body: JSON.stringify(body) })
    assert.equal(response.status, expectedStatus, method + ' ' + path)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    // 204 has no body. Every other response in this suite is JSON.
    return expectedStatus === 204 ? undefined : response.json()
  }

  // A missing or rejected bearer token produces 401 before the API reads a profile.
  await request('GET', '/me', undefined, 401)
  const rejectedTokenResponse = await request('GET', '/me', 'invalid', 401)
  // The internal verifier error is available as a cause and stays out of the HTTP body.
  assert.deepEqual(rejectedTokenResponse, { statusCode: 401, message: 'Unauthorized' })
  // Start two first requests together to check that both resolve to the same new user.
  const [aliceProfile, concurrentAliceProfile] = await Promise.all([
    request('GET', '/me', 'alice', 200),
    request('GET', '/me', 'alice', 200),
  ])
  assert.deepEqual(aliceProfile, concurrentAliceProfile)
  assert.deepEqual(aliceProfile.memberships, [])
  const bobProfile = await request('GET', '/me', 'bob', 200)
  const charlieProfile = await request('GET', '/me', 'charlie', 200)

  // Two submissions with the same request ID must produce one company and one first administrator.
  const createCompanyABody = { name: ' Test Company A ', requestId: randomUUID() }
  const [firstCreateResponse, secondCreateResponse] = await Promise.all([
    fetch(apiUrl + '/organisations', {
      method: 'POST', headers: { authorization: 'Bearer alice', 'content-type': 'application/json' },
      body: JSON.stringify(createCompanyABody),
    }),
    fetch(apiUrl + '/organisations', {
      method: 'POST', headers: { authorization: 'Bearer alice', 'content-type': 'application/json' },
      body: JSON.stringify(createCompanyABody),
    }),
  ])
  assert.deepEqual([firstCreateResponse.status, secondCreateResponse.status].sort(), [200, 201])
  const { organisationId: companyAId } = await firstCreateResponse.json()
  assert.deepEqual(await secondCreateResponse.json(), { organisationId: companyAId })
  // Reusing the request ID with a different name conflicts with the original creation.
  await request('POST', '/organisations', 'alice', 409, { ...createCompanyABody, name: 'Renamed Test Company A' })

  // The creator can enter Company A. The API returns 404 to callers without membership.
  const companyAPath = '/organisations/' + companyAId
  assert.deepEqual(await request('GET', companyAPath, 'alice', 200), { organisationId: companyAId, name: 'Test Company A', role: 'admin' })
  await request('GET', companyAPath, 'bob', 404)
  // A malformed UUID returns 400 before the service looks up the organisation.
  await request('GET', '/organisations/invalid', 'bob', 400)
  // Removing the only administrator would leave the company unmanaged, so it returns 409.
  await request('DELETE', companyAPath + '/memberships/' + aliceProfile.userId, 'alice', 409)

  // An unrecognised role returns 400 before the service can grant any permissions.
  await request('POST', companyAPath + '/invitations', 'alice', 400, {
    recipientUserId: bobProfile.userId, role: 'owner',
  })
  // An identical invitation retry returns the existing offer. Changing its role returns 409.
  const salespersonInvitationBody = { recipientUserId: bobProfile.userId, role: 'salesperson' }
  const salespersonInvitation = await request('POST', companyAPath + '/invitations', 'alice', 201, salespersonInvitationBody)
  assert.deepEqual(await request('POST', companyAPath + '/invitations', 'alice', 200, salespersonInvitationBody), salespersonInvitation)
  await request('POST', companyAPath + '/invitations', 'alice', 409, { ...salespersonInvitationBody, role: 'manager' })
  // Only the intended recipient can see the pending invitation in their inbox.
  const bobInbox = await request('GET', '/invitations', 'bob', 200)
  assert.deepEqual(bobInbox.invitations, [{ ...salespersonInvitation, organisationId: companyAId, name: 'Test Company A' }])
  assert.deepEqual(await request('GET', '/invitations', 'charlie', 200), { invitations: [] })

  // Only Bob can accept his invitation. Acceptance grants the role Alice offered.
  const acceptSalespersonInvitationPath = '/invitations/' + salespersonInvitation.invitationId + '/accept'
  await request('POST', acceptSalespersonInvitationPath, 'charlie', 404)
  const acceptedInvitationReceipt = await request('POST', acceptSalespersonInvitationPath, 'bob', 200)
  assert.deepEqual(acceptedInvitationReceipt, { organisationId: companyAId, invitationId: salespersonInvitation.invitationId, status: 'accepted' })
  assert.equal((await request('GET', companyAPath, 'bob', 200)).role, 'salesperson')
  // Bob belongs to Company A, so 403 specifically means his role lacks invitation permission.
  await request('POST', companyAPath + '/invitations', 'bob', 403, { ...salespersonInvitationBody, recipientUserId: charlieProfile.userId })

  const { organisationId: companyBId } = await request('POST', '/organisations', 'bob', 201, {
    name: 'Test Company B', requestId: randomUUID(),
  })
  const companyBPath = '/organisations/' + companyBId
  // Even a Company B administrator gets 404 for an invitation owned by Company A.
  await request('DELETE', companyBPath + '/invitations/' + salespersonInvitation.invitationId, 'bob', 404)
  // Role changes are visible on the next request with the same token.
  await request('PATCH', companyAPath + '/memberships/' + bobProfile.userId, 'alice', 200, { role: 'manager' })
  assert.equal((await request('GET', companyAPath, 'bob', 200)).role, 'manager')
  // Removal is safe to retry. An old acceptance receipt cannot restore Company A access.
  await request('DELETE', companyAPath + '/memberships/' + bobProfile.userId, 'alice', 204)
  await request('DELETE', companyAPath + '/memberships/' + bobProfile.userId, 'alice', 204)
  assert.deepEqual(await request('POST', acceptSalespersonInvitationPath, 'bob', 200), acceptedInvitationReceipt)
  await request('GET', companyAPath, 'bob', 404)
  assert.equal((await request('GET', companyBPath, 'bob', 200)).role, 'admin')

  // A fresh invitation can restore membership with a new role.
  const adminInvitationForBob = await request('POST', companyAPath + '/invitations', 'alice', 201, { ...salespersonInvitationBody, role: 'admin' })
  await request('POST', '/invitations/' + adminInvitationForBob.invitationId + '/accept', 'bob', 200)
  const managerInvitationBody = { recipientUserId: charlieProfile.userId, role: 'manager' }
  const { invitationId: expiredInvitationId } = await request('POST', companyAPath + '/invitations', 'alice', 201, managerInvitationBody)
  // Move the fixture into the past while retaining the database expiry constraint.
  const database = app.get(PrismaService).client
  await database.$executeRaw`
    UPDATE invitations
    SET created_at = clock_timestamp() - interval '8 days', expires_at = clock_timestamp() - interval '1 day'
    WHERE id = ${expiredInvitationId}::uuid
  `
  assert.deepEqual(await request('GET', '/invitations', 'charlie', 200), { invitations: [] })
  // An expired invitation returns 409 because it can no longer grant membership.
  await request('POST', '/invitations/' + expiredInvitationId + '/accept', 'charlie', 409)
  // An expired offer can be replaced. Demoting its issuer then revokes the replacement.
  const replacementInvitation = await request('POST', companyAPath + '/invitations', 'alice', 201, managerInvitationBody)
  assert.notEqual(replacementInvitation.invitationId, expiredInvitationId)
  await request('PATCH', companyAPath + '/memberships/' + aliceProfile.userId, 'bob', 200, { role: 'manager' })
  await request('POST', '/invitations/' + replacementInvitation.invitationId + '/accept', 'charlie', 409)
  await request('DELETE', companyAPath + '/invitations/' + replacementInvitation.invitationId, 'bob', 204)

  // With two administrators, either self-demotion is valid on its own.
  await request('PATCH', companyAPath + '/memberships/' + aliceProfile.userId, 'bob', 200, { role: 'admin' })
  // Send both demotions together. One succeeds and the last-admin rule rejects the other with 409.
  const demotionResponses = await Promise.all([
    fetch(apiUrl + companyAPath + '/memberships/' + aliceProfile.userId, {
      method: 'PATCH', headers: { authorization: 'Bearer alice', 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'manager' }),
    }),
    fetch(apiUrl + companyAPath + '/memberships/' + bobProfile.userId, {
      method: 'PATCH', headers: { authorization: 'Bearer bob', 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'manager' }),
    }),
  ])
  assert.deepEqual(demotionResponses.map((demotionResponse) => demotionResponse.status).sort(), [200, 409])
  for (const demotionResponse of demotionResponses) await demotionResponse.json()
  assert.equal(await database.membership.count({ where: { organisationId: companyAId, status: 'active', role: 'admin' } }), 1)
}
