import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'build', 'demo-api')
const pnpm = (...args) => execFileSync('pnpm', args, { cwd: root, stdio: 'inherit' })

// Deploy copies the files allowlist and installs the locked production tree.
// The output is a dedicated build directory that can be replaced on each build.
pnpm('--filter', '@ai-sales-operations/api', 'run', 'build')
pnpm(
  '--filter', '@ai-sales-operations/api', '--prod', 'deploy', '--force',
  '--config.inject-workspace-packages=true', '--config.node-linker=hoisted', output,
)

// The workspace lockfile satisfies Prisma Client's optional CLI peer with the
// development toolchain. Keep only packages reachable at runtime, including
// optional dependencies and required peers (such as Nest's reflect-metadata).
const runtimePackages = new Set()
function markRuntimePackages(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const requiredPeers = Object.keys(manifest.peerDependencies ?? {})
    .filter((name) => !manifest.peerDependenciesMeta?.[name]?.optional)
  const dependencies = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...requiredPeers,
  ])

  for (const name of dependencies) {
    // Walk up directories as Node does when resolving a bare package import.
    let parent = directory
    while (parent === output || parent.startsWith(output + sep)) {
      const dependency = join(parent, 'node_modules', name)
      if (existsSync(join(dependency, 'package.json'))) {
        if (!runtimePackages.has(dependency)) {
          runtimePackages.add(dependency)
          markRuntimePackages(dependency)
        }
        break
      }
      parent = dirname(parent)
    }
  }
}

function prunePackages(directory) {
  if (!existsSync(directory)) return

  for (const name of readdirSync(directory)) {
    const entry = join(directory, name)
    if (name.startsWith('@')) {
      prunePackages(entry)
    } else if (runtimePackages.has(entry)) {
      prunePackages(join(entry, 'node_modules'))
    } else {
      rmSync(entry, { recursive: true, force: true })
    }
  }
}

markRuntimePackages(output)
prunePackages(join(output, 'node_modules'))

// Check hidden files too. The hoisted tree should contain ordinary files so
// CDK can archive it without resolving any workspace links.
let bytes = 0
function verifyDirectory(directory) {
  for (const name of readdirSync(directory)) {
    const entry = join(directory, name)
    if (name === '.env' || name.startsWith('.env.')) {
      throw new Error('Lambda artifact contains an environment file')
    }
    const stat = lstatSync(entry)
    if (stat.isSymbolicLink()) {
      throw new Error('Lambda artifact contains a symbolic link')
    } else if (stat.isDirectory()) {
      verifyDirectory(entry)
    } else {
      bytes += stat.size
    }
  }
}
verifyDirectory(output)
if (bytes > 250 * 1024 ** 2) {
  throw new Error('Lambda artifact exceeds the 250 MiB uncompressed limit')
}
console.log(`Verified Lambda artifact at build/demo-api (${bytes} bytes uncompressed)`)
