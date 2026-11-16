// Prisma CLI discovers this file at the API package root. Nest compiles only src/.
import { env } from 'node:process'
import { defineConfig } from 'prisma/config'

// Prisma CLI uses the direct connection for migration commands.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  // Migration commands need DIRECT_URL. Client generation can run without a database.
  datasource: { url: env.DIRECT_URL ?? '' },
})
