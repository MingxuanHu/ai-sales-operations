import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { App } from 'aws-cdk-lib'
import { DemoApiStack } from './api-stack.ts'

// Infrastructure metadata comes from the root setup file. Public Cognito
// stack outputs are explicit synthesis inputs and become Lambda settings.
const settings = {
  ...parseEnv(readFileSync(new URL('../../.env.aws', import.meta.url), 'utf8')),
  ...process.env,
}
function required(name: string, source = process.env): string {
  const value = source[name]
  if (!value) throw new Error(`Missing ${name} for demo API synthesis`)
  return value
}

new DemoApiStack(new App(), 'SalesOperationsDemoApi', {
  env: {
    account: required('AWS_ACCOUNT_ID', settings),
    region: required('AWS_REGION', settings),
  },
  artifactPath: fileURLToPath(new URL('../../build/demo-api', import.meta.url)),
  databaseParameterName: required('DEMO_DATABASE_URL_PARAMETER', settings),
  userPoolId: required('COGNITO_USER_POOL_ID'),
  issuer: required('COGNITO_ISSUER'),
  appClientId: required('COGNITO_APP_CLIENT_ID'),
  resourceUrl: new URL('/api', required('DEMO_WEB_ORIGIN', settings)).href,
})
