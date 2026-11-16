// This import runs setup code that lets Nest read metadata from decorators at runtime.
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  // Vite exposes VITE_ settings to the browser by default. Map those same public
  // values here so local .env defines each once and Lambda uses backend names.
  process.env.COGNITO_ISSUER ??= process.env.VITE_COGNITO_ISSUER ?? ''
  process.env.COGNITO_APP_CLIENT_ID ??= process.env.VITE_COGNITO_CLIENT_ID ?? ''
  process.env.COGNITO_API_RESOURCE_URL ??= process.env.VITE_COGNITO_API_RESOURCE_URL ?? ''
  // await waits for Nest to initialise the root module before we configure the server.
  const app = await NestFactory.create(AppModule)
  // The global prefix turns the controller's /health path into /api/health.
  app.setGlobalPrefix('api')
  // Listen for shutdown signals so Nest can close the database pool.
  app.enableShutdownHooks()
  // The loopback address makes the server reachable only from this machine.
  await app.listen(3000, '127.0.0.1')
}

// catch handles a rejected startup Promise and returns a new Promise.
// void evaluates the entire chain, then returns undefined instead of the Promise.
void bootstrap().catch((error: unknown) => {
  console.error(error)
  // A nonzero exit code tells the shell that startup failed.
  process.exitCode = 1
})
