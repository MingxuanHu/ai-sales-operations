import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import serverlessExpress from '@codegenie/serverless-express'
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { createApp } from './create-app'

// The SDK takes the region and temporary execution-role credentials from Lambda.
const ssm = new SSMClient({ maxAttempts: 2 })

async function initialise() {
  const name = process.env.DATABASE_URL_PARAMETER
  if (!name) {
    throw new Error('DATABASE_URL_PARAMETER is required')
  }

  // Fetch the secret before Nest constructs the Prisma provider.
  const { Parameter } = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
    { abortSignal: AbortSignal.timeout(5_000) },
  )
  if (Parameter?.Type !== 'SecureString' || !Parameter.Value) {
    throw new Error('The database parameter must contain a SecureString value')
  }
  process.env.DATABASE_URL = Parameter.Value

  const app = await createApp()
  try {
    // init registers routes without opening a listening port.
    await app.init()
    return serverlessExpress({
      app: app.getHttpAdapter().getInstance(),
      respondWithErrors: false,
      logSettings: { level: 'error' },
    })
  } catch (error) {
    await app.close()
    throw error
  }
}

// Cache successful startup so warm requests share Nest and its PostgreSQL pool.
let ready: ReturnType<typeof initialise> | undefined

export async function handler(event: APIGatewayProxyEventV2, context: Context) {
  ready ??= initialise().catch(() => {
    ready = undefined
    // Lambda logs thrown errors. Keep details from SSM and Prisma out of those logs.
    throw new Error('API initialisation failed')
  })
  // The adapter returns a Promise. Its shared type still requires a callback.
  return (await ready)(event, context, () => undefined)
}
