// This import runs setup code that lets Nest read metadata from decorators at runtime.
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  // await waits for Nest to initialise the root module before we configure the server.
  const app = await NestFactory.create(AppModule)
  // The global prefix turns the controller's /health path into /api/health.
  app.setGlobalPrefix('api')
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
