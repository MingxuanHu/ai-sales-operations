import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { App } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { DemoDeliveryStack, demoSubject, demoTargets } from './delivery-stack.ts'

function synth(reuseProvider = false) {
  const stack = new DemoDeliveryStack(new App(), 'TestDelivery', {
    env: { account: '381491963300', region: 'ap-southeast-2' }, reuseProvider,
  })
  // Resolve CloudFormation's partition token so assertions compare complete ARNs.
  return JSON.parse(JSON.stringify(Template.fromStack(stack).toJSON())
    .replaceAll('{"Ref":"AWS::Partition"}', '"aws"'))
}

test('only the exact immutable repository, demo environment and STS audience are trusted', () => {
  const template = synth(true)
  // Find by resource type so a harmless logical-ID change does not break the test.
  const role = Object.values(template.Resources).find((resource) =>
    (resource as { Type: string }).Type === 'AWS::IAM::Role') as {
      Properties: { AssumeRolePolicyDocument: { Statement: Array<{
        Action: string; Effect: string; Principal: { Federated: unknown }
        Condition: { StringEquals: Record<string, string> }
      }> }; MaxSessionDuration: number }
    }
  assert.equal(role.Properties.MaxSessionDuration, 3600)
  const statements = role.Properties.AssumeRolePolicyDocument.Statement
  assert.equal(statements.length, 1)
  const statement = statements[0]
  assert.equal(statement.Action, 'sts:AssumeRoleWithWebIdentity')
  assert.equal(statement.Effect, 'Allow')
  assert.deepEqual(statement.Principal, { Federated: { 'Fn::Join': ['', [
    'arn:', 'aws', ':iam::381491963300:oidc-provider/token.actions.githubusercontent.com',
  ]] } })
  assert.deepEqual(statement.Condition, { StringEquals: {
    'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    'token.actions.githubusercontent.com:sub': demoSubject,
  } })
  // Exercise the synthesized equality conditions, including the older subject format.
  const conditions = statement.Condition.StringEquals
  const allows = (sub: string, aud = 'sts.amazonaws.com') =>
    conditions['token.actions.githubusercontent.com:sub'] === sub &&
    conditions['token.actions.githubusercontent.com:aud'] === aud
  assert.equal(allows(demoSubject), true)
  for (const subject of [
    demoSubject.replace('MingxuanHu@20830158', 'other@123'),
    demoSubject.replace('1452171772', '999'),
    demoSubject.replace(':environment:demo', ':environment:production'),
    demoSubject.replace(':environment:demo', ':pull_request'),
    demoSubject.replace(':environment:demo', ':ref:refs/heads/main'),
    'repo:MingxuanHu/ai-sales-operations:environment:demo',
  ]) assert.equal(allows(subject), false, subject)
  assert.equal(allows(demoSubject, 'other-audience'), false)
})

test('release permissions contain only the existing artifact publication resources', () => {
  const template = synth(true)
  const role = Object.values(template.Resources).find((resource) =>
    (resource as { Type: string }).Type === 'AWS::IAM::Role') as {
      Properties: { Policies: Array<{ PolicyDocument: unknown }> }
    }
  assert.equal(role.Properties.Policies.length, 1)
  // A complete policy assertion catches accidental IAM, SSM, CDK role or wildcard grants.
  const arn = (suffix: string) => ({ 'Fn::Join': ['', ['arn:', 'aws', suffix]] })
  assert.deepEqual(role.Properties.Policies[0].PolicyDocument, {
    Version: '2012-10-17', Statement: [
      { Effect: 'Allow', Action: ['lambda:UpdateFunctionCode', 'lambda:GetFunctionConfiguration'],
        Resource: arn(`:lambda:ap-southeast-2:381491963300:function:${demoTargets.functionName}`) },
      { Effect: 'Allow', Action: ['s3:ListBucket', 's3:GetBucketLocation'],
        Resource: arn(`:s3:::${demoTargets.bucketName}`) },
      { Effect: 'Allow', Action: ['s3:PutObject', 's3:GetObject'],
        Resource: arn(`:s3:::${demoTargets.bucketName}/*`) },
      { Effect: 'Allow', Action: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        Resource: arn(`:cloudfront::381491963300:distribution/${demoTargets.distributionId}`) },
    ],
  })
  assert.equal(JSON.stringify(role).includes('ManagedPolicyArns'), false)
})

test('provider creation is native and retained; reuse creates no provider or custom Lambda', () => {
  const created = synth()
  const types = Object.values(created.Resources).map((r) => (r as { Type: string }).Type)
  assert.deepEqual(types.sort(), ['AWS::IAM::OIDCProvider', 'AWS::IAM::Role'].sort())
  const provider = Object.values(created.Resources).find((r) =>
    (r as { Type: string }).Type === 'AWS::IAM::OIDCProvider') as Record<string, unknown>
  assert.deepEqual(provider.Properties, {
    ClientIdList: ['sts.amazonaws.com'], Url: 'https://token.actions.githubusercontent.com',
  })
  assert.equal(provider.DeletionPolicy, 'Retain')
  assert.equal(provider.UpdateReplacePolicy, 'Retain')
  assert.deepEqual(Object.values(synth(true).Resources).map((r) =>
    (r as { Type: string }).Type), ['AWS::IAM::Role'])
})

test('PR CI has no OIDC write permission, AWS credential action or deployment environment', () => {
  const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(ci, /id-token:\s*write|configure-aws-credentials|environment:/)
  assert.doesNotMatch(ci, /pull_request_target/)
})

test('the manual identity workflow uses main/demo trust and cannot publish a release', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/demo-identity-check.yml', import.meta.url), 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /pull_request:|pull_request_target:|push:/)
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main' && github.event_name == 'workflow_dispatch'/)
  assert.match(workflow, /environment: demo/)
  assert.ok(workflow.includes(`claims.sub === '${demoSubject}'`))
  assert.match(workflow, /uses: aws-actions\/configure-aws-credentials@[a-f0-9]{40}\n/)
  assert.match(workflow, /role-duration-seconds: 900/)
  assert.match(workflow, /aws sts get-caller-identity/)
  assert.doesNotMatch(workflow, /actions\/checkout|update-function-code|s3 (sync|cp)|prisma|cdk deploy/)
})

test('the actual workflow claim script fails closed without logging a token', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/demo-identity-check.yml', import.meta.url), 'utf8')
  // Execute the embedded script with a fake token response, without a server or AWS.
  const script = workflow.match(/node --input-type=module <<'NODE'\n([\s\S]+?) {10}NODE/)?.[1]
    .replace(/^ {10}/gm, '')
  assert.ok(script)
  const valid = {
    iss: 'https://token.actions.githubusercontent.com', aud: 'sts.amazonaws.com',
    sub: demoSubject, ref: 'refs/heads/main', environment: 'demo',
    repository_id: '1452171772', repository_owner_id: '20830158',
  }
  const invalidClaims = [
    { aud: 'other' }, { sub: demoSubject.replace(':demo', ':other') },
    { ref: 'refs/heads/feature/untrusted' }, { repository_id: '999' },
    { iss: 'https://example.invalid' }, { environment: 'other' },
  ]
  for (const changes of [{}, ...invalidClaims]) {
    const token = `header.${Buffer.from(JSON.stringify({ ...valid, ...changes })).toString('base64url')}.signature`
    const result: SpawnSyncReturns<string> = spawnSync(process.execPath, ['--input-type=module'], {
      input: `globalThis.fetch = async () => ({ ok: true, json: async () => ({ value: '${token}' }) });\n${script}`,
      env: { ...process.env, ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid/token' },
      encoding: 'utf8',
    })
    assert.equal(result.status === 0, Object.keys(changes).length === 0)
    assert.equal(`${result.stdout}${result.stderr}`.includes(token), false)
  }
})
