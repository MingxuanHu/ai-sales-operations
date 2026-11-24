import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { compatibility, publish, repository, runtimeFingerprint, sha256, targets, validateCi, validateManifest, validateRelease } from './demo-release.mjs'

const sha = 'a'.repeat(40)
const id = `${sha}-123`
const config = { RevisionId: 'revision', CodeSha256: 'previous', Runtime: 'nodejs26.x', Architectures: ['arm64'] }
const ci = { head_repository: { full_name: repository }, head_branch: 'main', event: 'push', path: '.github/workflows/ci.yml', head_sha: sha, conclusion: 'success' }
const jobs = ['docs-check', 'lint', 'typecheck', 'unit-tests', 'integration-tests', 'build'].map((name) => ({ name, conclusion: 'success' }))

test('CI gate rejects failed, missing, skipped, foreign and wrong-revision checks', () => {
  validateCi(ci, jobs, sha)
  for (const patch of [{ event: 'pull_request' }, { head_branch: 'other' }, { conclusion: 'failure' }, { head_sha: 'b'.repeat(40) }, { head_repository: { full_name: 'other/repo' } }]) {
    assert.throws(() => validateCi({ ...ci, ...patch }, jobs, sha))
  }
  assert.throws(() => validateCi(ci, jobs.slice(1), sha))
  assert.throws(() => validateCi(ci, jobs.map((job) => ({ ...job, conclusion: 'skipped' })), sha))
})

test('rollback requires successful trusted provenance and a live artifact', () => {
  const run = { ...ci, id: 123, event: 'workflow_run', path: '.github/workflows/release-demo.yml' }
  const artifact = { name: `demo-${id}`, expired: false, expires_at: '2099-01-01T00:00:00Z' }
  validateRelease(run, artifact, id)
  for (const patch of [{ conclusion: 'failure' }, { head_branch: 'feature/test' }, { path: '.github/workflows/other.yml' }, { event: 'pull_request' }, { head_sha: 'b'.repeat(40) }]) {
    assert.throws(() => validateRelease({ ...run, ...patch }, artifact, id))
  }
  for (const patch of [{ expired: true }, { expires_at: '2000-01-01' }, { name: 'wrong' }]) {
    assert.throws(() => validateRelease(run, { ...artifact, ...patch }, id))
  }
  assert.throws(() => validateRelease(run, artifact, '../123'))
})

function fixture(t) {
  const directory = mkdtempSync(`${tmpdir()}/demo-release-test-`)
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(`${directory}/web`)
  writeFileSync(`${directory}/api.zip`, 'zip fixture')
  writeFileSync(`${directory}/web/index.html`, '<html>demo</html>')
  const manifest = { format: 1, id, revision: sha, targets, compatibility: compatibility(), runtime: runtimeFingerprint(config), checksums: { 'api.zip': sha256('zip fixture'), 'web/index.html': sha256('<html>demo</html>') } }
  writeFileSync(`${directory}/manifest.json`, JSON.stringify(manifest))
  const calls = []
  const command = (...args) => {
    calls.push(args)
    if (args[0] === 'lambda' && args[1] === 'get-function-configuration') return Buffer.from(manifest.checksums['api.zip'], 'hex').toString('base64')
    return 'previous-or-invalidation-id'
  }
  const request = async (url) => {
    if (url.endsWith('/api/health')) return Response.json({ status: 'ok' })
    if (url.endsWith('/api/me')) return new Response('', { status: 401 })
    if (url.includes('.s3.')) return new Response('', { status: 403 })
    return new Response('<html>demo</html>')
  }
  return { directory, manifest, calls, command, request }
}

test('tampered artifacts and incompatible releases cause no AWS mutations', async (t) => {
  const f = fixture(t)
  for (const manifest of [{ ...f.manifest, compatibility: 'different' }, { ...f.manifest, runtime: 'different' }]) {
    await assert.rejects(publish(f.directory, manifest, { command: f.command, request: f.request, config }))
  }
  writeFileSync(`${f.directory}/api.zip`, 'tampered')
  assert.throws(() => validateManifest(f.directory, f.manifest, id))
  await assert.rejects(publish(f.directory, f.manifest, { command: f.command, config }))
  assert.equal(f.calls.length, 0)
})

test('publication waits for API then assets then HTML then invalidation and smoke', async (t) => {
  const f = fixture(t)
  const stages = []
  await publish(f.directory, f.manifest, { command: f.command, request: f.request, config,
    record: ({ stage }) => stages.push(stage) })
  assert.deepEqual(stages, ['before-api', 'api-uploaded', 'api-published', 'web-published', 'smoke-passed'])
  assert.deepEqual(f.calls.map((args) => args.slice(0, 2).join(' ')), [
    's3 cp', 'lambda update-function-code', 'lambda wait', 'lambda get-function-configuration',
    's3 sync', 's3 cp', 'cloudfront create-invalidation', 'cloudfront wait', 's3 cp',
  ])
  assert.ok(f.calls[1].includes('--revision-id'))
  // Keep the waiter compatible with the existing least-privilege release role.
  assert.deepEqual(f.calls[2].slice(0, 3), ['lambda', 'wait', 'function-updated'])
  assert.ok(!f.calls.flat().includes('--delete'))
})

test('each failed publication stage prevents every later mutation', async (t) => {
  for (const failure of ['update-function-code', 'wait', 'sync', 'create-invalidation']) {
    const f = fixture(t)
    const command = (...args) => {
      if (args[1] === failure) throw new Error('simulated failure')
      return f.command(...args)
    }
    await assert.rejects(publish(f.directory, f.manifest, { command, request: f.request, config }))
    assert.ok(!f.calls.some((args) => args.includes(`s3://${targets.bucket}/_release/current.json`) && args[2] !== `s3://${targets.bucket}/_release/current.json`))
    if (['update-function-code', 'wait'].includes(failure)) assert.ok(!f.calls.some((args) => args[1] === 'sync'))
  }
})

test('failed API smoke prevents web rollout and the success marker', async (t) => {
  const f = fixture(t)
  await assert.rejects(publish(f.directory, f.manifest, { command: f.command, request: async () => new Response('bad', { status: 500 }), config }))
  assert.equal(f.calls.at(-1)[0], 'lambda')
  assert.ok(!f.calls.some((args) => args[1] === 'sync'))
})

test('failed web smoke prevents the success marker after invalidation', async (t) => {
  const f = fixture(t)
  const request = (url) => url === `${targets.origin}/` ? new Response('wrong html') : f.request(url)
  await assert.rejects(publish(f.directory, f.manifest, { command: f.command, request, config }))
  assert.equal(f.calls.at(-1)[0], 'cloudfront')
})

test('migration errors hide captured credentials and produce a failed outcome', (t) => {
  const directory = mkdtempSync(`${tmpdir()}/demo-migration-test-`)
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const fakeSecret = 'synthetic-secret-must-not-appear'
  // A fake CLI simulates a database error that includes the connection password.
  writeFileSync(`${directory}/pnpm`, '#!/bin/sh\necho "$DIRECT_URL" >&2\nexit 1\n', { mode: 0o755 })
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./demo-migrate.mjs', import.meta.url))], {
    cwd: directory, encoding: 'utf8', env: { ...process.env, PATH: directory, DIRECT_URL: fakeSecret },
  })
  assert.equal(result.status, 1)
  assert.ok(!`${result.stdout}${result.stderr}`.includes(fakeSecret))
})

test('runtime grants follow migration status and must succeed for release', (t) => {
  const directory = mkdtempSync(`${tmpdir()}/demo-runtime-grants-test-`)
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const script = fileURLToPath(new URL('./demo-migrate.mjs', import.meta.url))
  const grants = fileURLToPath(new URL('./demo-runtime-grants.sql', import.meta.url))
  // Stand in for Prisma and fail only the grants command on the first run.
  writeFileSync(`${directory}/pnpm`, `#!/bin/sh
printf '%s\\n' "$*" >> commands
case "$*" in
  *"db execute"*) exit "$GRANTS_EXIT_CODE" ;;
esac
`, { mode: 0o755 })

  for (const [status, outcome] of [[1, 'failed'], [0, 'passed']]) {
    writeFileSync(`${directory}/commands`, '')
    const result = spawnSync(process.execPath, [script], {
      cwd: directory,
      encoding: 'utf8',
      env: { PATH: directory, DIRECT_URL: 'synthetic-url', GRANTS_EXIT_CODE: String(status) },
    })
    assert.equal(result.status, status)
    assert.deepEqual(JSON.parse(readFileSync(`${directory}/release-record/migration.json`, 'utf8')), { result: outcome })
    const prefix = '--filter @ai-sales-operations/api'
    assert.deepEqual(readFileSync(`${directory}/commands`, 'utf8').trim().split('\n'), [
      `${prefix} prisma:migrate`,
      `${prefix} exec prisma migrate status`,
      `${prefix} exec prisma db execute --file ${grants}`,
    ])
  }
})

test('workflows confine the secret to migration and serialize all publication', () => {
  for (const name of ['release', 'rollback']) {
    const workflow = readFileSync(new URL(`../.github/workflows/${name}-demo.yml`, import.meta.url), 'utf8')
    assert.match(workflow, /group: demo-publication/)
    assert.match(workflow, /cancel-in-progress: false/)
    assert.match(workflow, /persist-credentials: false/)
    assert.ok(!workflow.includes('pull_request_target'))
    if (name === 'rollback') assert.ok(!workflow.includes('DEMO_DIRECT_URL') && !workflow.includes('demo-migrate'))
    else {
      assert.equal(workflow.split('secrets.DEMO_DIRECT_URL').length, 2)
      assert.ok(workflow.indexOf('demo-migrate.mjs') < workflow.indexOf('demo-release.mjs publish'))
    }
  }
})
