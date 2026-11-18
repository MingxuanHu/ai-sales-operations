import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const repository = 'MingxuanHu/ai-sales-operations'
export const targets = {
  function: 'SalesOperationsDemoApi-ApiFunctionCE271BD4-04BpZE8CXvGS',
  bucket: 'salesoperationsdemoweb-webassets27872646-ngmiddvdzwdm',
  distribution: 'E1NWV6DKPQ0SSF',
  origin: 'https://d3finwpuxpr8bj.cloudfront.net',
}
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
// Sort object keys so AWS JSON property order cannot change a fingerprint.
const canonical = (value) => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')

// Refuse links and unexpected paths before hashing or publishing artifact files.
export function files(directory, prefix = '') {
  return readdirSync(directory).sort().flatMap((name) => {
    assert.ok(/^[a-zA-Z0-9_.@+-]+$/.test(name) && !name.startsWith('.env'), 'Unsafe artifact name')
    const path = `${directory}/${name}`
    const stat = lstatSync(path)
    assert.ok(!stat.isSymbolicLink(), 'Artifact contains a symbolic link')
    return stat.isDirectory() ? files(path, `${prefix}${name}/`) : [`${prefix}${name}`]
  })
}

// The AWS CLI returns only requested fields. Never persist Lambda environment values.
function aws(...args) {
  return execFileSync('aws', [...args, '--no-cli-pager'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
const gh = (path) => JSON.parse(execFileSync('gh', ['api', `repos/${repository}/${path}`], { encoding: 'utf8' }))
function configuration() {
  return JSON.parse(aws('lambda', 'get-function-configuration', '--function-name', targets.function,
    '--query', '{RevisionId:RevisionId,CodeSha256:CodeSha256,Runtime:Runtime,Architectures:Architectures,Handler:Handler,Environment:Environment.Variables,Role:Role,Layers:Layers,MemorySize:MemorySize,Timeout:Timeout}', '--output', 'json'))
}
export function runtimeFingerprint(config) {
  const { RevisionId: _revision, CodeSha256: _code, ...runtime } = config
  return sha256(JSON.stringify(canonical(runtime)))
}
export function compatibility() {
  // Exact migration/infra fingerprints deliberately reject rollback across schema
  // changes. Relax this only after a separate compatibility review and tests.
  const paths = ['apps/api/prisma', 'infra/api', 'infra/web', 'infra/cognito']
  const tracked = execFileSync('git', ['ls-files', '-z', ...paths], { encoding: 'utf8' }).split('\0').filter(Boolean)
  return sha256(JSON.stringify(tracked.sort().map((path) => [path, sha256(readFileSync(path))])))
}
export function validateManifest(directory, manifest, expectedId) {
  assert.equal(manifest.id, expectedId, 'Release ID mismatch')
  assert.match(manifest.id, /^[a-f0-9]{40}-[1-9][0-9]*$/)
  assert.equal(manifest.revision, manifest.id.split('-')[0], 'Manifest source revision mismatch')
  assert.equal(manifest.format, 1)
  assert.deepEqual(manifest.targets, targets, 'Infrastructure target mismatch')
  const actual = files(directory).filter((path) => path !== 'manifest.json')
  assert.deepEqual(Object.keys(manifest.checksums).sort(), actual.sort(), 'Artifact inventory mismatch')
  assert.ok(actual.includes('api.zip') && actual.includes('web/index.html'), 'Incomplete release')
  for (const path of actual) {
    assert.ok(path === 'api.zip' || path.startsWith('web/'), 'Unexpected artifact file')
    assert.equal(sha256(readFileSync(`${directory}/${path}`)), manifest.checksums[path], `Checksum mismatch: ${path}`)
  }
}

export function validateCi(run, jobs, sha) {
  assert.equal(run.head_repository.full_name, repository)
  assert.equal(run.head_branch, 'main')
  assert.equal(run.event, 'push')
  assert.equal(run.path, '.github/workflows/ci.yml')
  assert.equal(run.head_sha, sha)
  assert.equal(run.conclusion, 'success')
  for (const name of ['docs-check', 'lint', 'typecheck', 'unit-tests', 'integration-tests', 'build']) {
    assert.ok(jobs.some((job) => job.name === name && job.conclusion === 'success'), `Required check did not pass: ${name}`)
  }
}

function paginated(path, key) {
  const values = []
  for (let page = 1; ; page++) {
    const batch = gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)[key]
    values.push(...batch)
    if (batch.length < 100) return values
  }
}
export function validateRelease(run, artifact, id, now = Date.now()) {
  assert.match(id, /^[a-f0-9]{40}-[1-9][0-9]*$/)
  assert.equal(`${run.head_sha}-${run.id}`, id)
  assert.equal(run.head_repository.full_name, repository)
  assert.equal(run.head_branch, 'main')
  assert.equal(run.path, '.github/workflows/release-demo.yml')
  assert.equal(run.event, 'workflow_run')
  assert.equal(run.conclusion, 'success')
  assert.equal(artifact.name, `demo-${id}`)
  assert.equal(artifact.expired, false)
  assert.ok(Date.parse(artifact.expires_at) > now, 'Release artifact expired')
}

async function verifyApi(request) {
  const health = await request(`${targets.origin}/api/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok' })
  assert.equal((await request(`${targets.origin}/api/me`)).status, 401)
}

async function smoke(manifest, request) {
  for (const path of ['/', '/auth/callback', '/onboarding']) {
    const response = await request(`${targets.origin}${path}`)
    assert.equal(response.status, 200, `SPA route failed: ${path}`)
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), manifest.checksums['web/index.html'])
  }
  await verifyApi(request)
  assert.equal((await request(`https://${targets.bucket}.s3.ap-southeast-2.amazonaws.com/index.html`)).status, 403)
  for (const path of Object.keys(manifest.checksums).filter((path) => path.startsWith('web/'))) {
    const response = await request(`${targets.origin}/${path.slice(4)}`)
    assert.equal(response.status, 200)
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), manifest.checksums[path], `Published checksum mismatch: ${path}`)
  }
}

// Dependency injection lets failure-path tests prove no later mutation runs.
export async function publish(directory, manifest, { command = aws, request = (url) => fetch(url, { signal: AbortSignal.timeout(30000) }), config = configuration(), record = () => {} } = {}) {
  validateManifest(directory, manifest, manifest.id)
  assert.equal(manifest.compatibility, compatibility(), 'Schema/infrastructure compatibility mismatch')
  assert.equal(manifest.runtime, runtimeFingerprint(config), 'Lambda runtime configuration changed')
  const previous = { code: config.CodeSha256 }
  try { previous.release = command('s3', 'cp', `s3://${targets.bucket}/_release/current.json`, '-') }
  catch { previous.release = 'No release marker available; see previous Lambda hash' }
  record({ stage: 'before-api', previous })
  command('lambda', 'update-function-code', '--function-name', targets.function,
    '--revision-id', config.RevisionId, '--zip-file', `fileb://${resolve(directory, 'api.zip')}`, '--query', 'CodeSha256', '--output', 'text')
  command('lambda', 'wait', 'function-updated-v2', '--function-name', targets.function)
  const code = command('lambda', 'get-function-configuration', '--function-name', targets.function, '--query', 'CodeSha256', '--output', 'text')
  assert.equal(code, Buffer.from(manifest.checksums['api.zip'], 'hex').toString('base64'), 'Published Lambda hash mismatch')
  await verifyApi(request)
  record({ stage: 'api-published', previous })
  command('s3', 'sync', `${directory}/web/`, `s3://${targets.bucket}/`, '--exclude', 'index.html', '--cache-control', 'no-cache')
  command('s3', 'cp', `${directory}/web/index.html`, `s3://${targets.bucket}/index.html`, '--content-type', 'text/html', '--cache-control', 'no-cache')
  record({ stage: 'web-published', previous })
  const invalidation = command('cloudfront', 'create-invalidation', '--distribution-id', targets.distribution, '--paths', '/*', '--query', 'Invalidation.Id', '--output', 'text')
  command('cloudfront', 'wait', 'invalidation-completed', '--distribution-id', targets.distribution, '--id', invalidation)
  await smoke(manifest, request)
  record({ stage: 'smoke-passed', previous })
  command('s3', 'cp', `${directory}/manifest.json`, `s3://${targets.bucket}/_release/current.json`, '--cache-control', 'no-cache')
}

async function main() {
  const [mode, argument] = process.argv.slice(2)
  assert.equal(process.env.GITHUB_REPOSITORY, repository)
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main')
  if (mode === 'gate') {
    const event = json(process.env.GITHUB_EVENT_PATH)
    const run = gh(`actions/runs/${event.workflow_run.id}`)
    validateCi(run, paginated(`actions/runs/${run.id}/jobs?filter=latest`, 'jobs'), run.head_sha)
    // A late CI completion must never replace a newer main revision.
    assert.equal(gh('git/ref/heads/main').object.sha, run.head_sha, 'Superseded main revision')
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), run.head_sha, 'Workflow revision must match checked source')
    appendFileSync(process.env.GITHUB_OUTPUT, `sha=${run.head_sha}\n`)
  } else if (mode === 'prepare') {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const manifest = { format: 1, id: `${revision}-${process.env.GITHUB_RUN_ID}`, revision,
      targets, compatibility: compatibility(), runtime: runtimeFingerprint(configuration()), checksums: {} }
    for (const path of files('release')) manifest.checksums[path] = sha256(readFileSync(`release/${path}`))
    save('release/manifest.json', manifest)
    appendFileSync(process.env.GITHUB_OUTPUT, `id=${manifest.id}\n`)
  } else if (mode === 'select') {
    assert.match(argument, /^[a-f0-9]{40}-[1-9][0-9]*$/)
    assert.equal(process.env.CONFIRM_RELEASE, argument, 'Confirmation must exactly match release ID')
    const runId = argument.split('-')[1]
    const run = gh(`actions/runs/${runId}`)
    const artifact = paginated(`actions/runs/${runId}/artifacts`, 'artifacts').find((item) => item.name === `demo-${argument}`)
    assert.ok(artifact, 'Release artifact is missing')
    validateRelease(run, artifact, argument)
    execFileSync('gh', ['run', 'download', runId, '--repo', repository, '--name', artifact.name, '--dir', 'release'], { stdio: 'inherit' })
    const manifest = json('release/manifest.json')
    validateManifest('release', manifest, argument)
    assert.equal(manifest.compatibility, compatibility(), 'Incompatible schema/infrastructure')
    // Runtime compatibility is checked again after OIDC and before any mutation.
  } else if (mode === 'publish') {
    mkdirSync('release-record', { recursive: true })
    const manifest = json('release/manifest.json')
    const record = (state) => save('release-record/result.json', { ...state, selected: manifest.id,
      actor: process.env.GITHUB_ACTOR, initiator: process.env.GITHUB_TRIGGERING_ACTOR, run: process.env.GITHUB_RUN_ID })
    record({ stage: 'preflight' })
    await publish('release', manifest, { record })
  } else if (mode === 'catalog') {
    const artifacts = paginated('actions/artifacts', 'artifacts').filter((item) => /^demo-[a-f0-9]{40}-[1-9][0-9]*$/.test(item.name))
    let summary = `Deployment result: ${process.env.JOB_STATUS}\n\nRelease ID | Revision | Result | Expires\n--- | --- | --- | ---\n`
    for (const artifact of artifacts) {
      const id = artifact.name.slice(5)
      const run = gh(`actions/runs/${id.split('-')[1]}`)
      // The current run is still in progress while writing its own summary.
      if (String(run.id) === process.env.GITHUB_RUN_ID && process.env.JOB_STATUS === 'success') {
        summary += `${id} | ${run.head_sha} | publication passed; eligible after run succeeds | ${artifact.expires_at}\n`
        continue
      }
      try {
        validateRelease(run, artifact, id)
        summary += `${id} | ${run.head_sha} | success | ${artifact.expires_at}\n`
      } catch { /* Failed or expired runs are not rollback candidates. */ }
    }
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  } else throw new Error('Unknown release command')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Fixed diagnostics keep credential-bearing child-process errors out of logs.
  main().catch(() => { console.error('Demo release failed; inspect the last completed step and release record.'); process.exitCode = 1 })
}
