import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { App } from 'aws-cdk-lib'
import { DemoDeliveryStack } from './delivery-stack.ts'

// Only infrastructure metadata is read here; application env files stay separate.
const settings = {
  ...parseEnv(readFileSync(new URL('../../.env.aws', import.meta.url), 'utf8')),
  ...process.env,
}
const account = settings.AWS_ACCOUNT_ID
const region = settings.AWS_REGION
if (!account || !/^\d{12}$/.test(account) || !region) {
  throw new Error('Set AWS_ACCOUNT_ID and AWS_REGION for delivery synthesis')
}
// An explicit mode forces the operator to check for an existing provider first.
const mode = settings.DEMO_GITHUB_OIDC_PROVIDER_MODE
if (mode !== 'create' && mode !== 'reuse') {
  throw new Error('Set DEMO_GITHUB_OIDC_PROVIDER_MODE to create or reuse after provider inspection')
}
new DemoDeliveryStack(new App(), 'SalesOperationsDemoDelivery', {
  env: { account, region }, reuseProvider: mode === 'reuse',
})
