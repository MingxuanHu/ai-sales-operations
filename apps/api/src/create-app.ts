// Nest uses this metadata to resolve constructor dependencies from decorated classes.
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

export async function createApp() {
  // Both entrypoints use the same module and URL prefix.
  // Let the entrypoint handle startup errors instead of letting Nest exit the process.
  const app = await NestFactory.create(AppModule, { abortOnError: false })
  app.setGlobalPrefix('api')
  return app
}
