import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'

// Capture CLI output because a database connection error can contain credentials.
// Store only a fixed result; never upload raw migration logs or the process env.
mkdirSync('release-record', { recursive: true })
let result = 'failed'
try {
  if (!process.env.DIRECT_URL) throw new Error('Missing migration credential')
  execFileSync('pnpm', ['--filter', '@ai-sales-operations/api', 'prisma:migrate'], { stdio: 'pipe' })
  execFileSync('pnpm', ['--filter', '@ai-sales-operations/api', 'exec', 'prisma', 'migrate', 'status'], { stdio: 'pipe' })
  result = 'passed'
} catch {
  console.error('Demo migration failed; stop rollout and inspect database state through the protected runbook.')
  process.exitCode = 1
} finally {
  writeFileSync('release-record/migration.json', JSON.stringify({ result }) + '\n')
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Migration: ${result}\n\n`)
}
