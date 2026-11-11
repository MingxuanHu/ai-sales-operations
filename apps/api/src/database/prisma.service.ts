import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

@Injectable()
export class PrismaService implements OnModuleDestroy {
  // Nest creates this provider once per application, so callers share one pool.
  private readonly database = this.createClient()

  get client(): PrismaClient {
    // Require database configuration when a caller needs it so the API can start without it.
    if (!this.database) {
      throw new Error('Database connection is not configured')
    }
    return this.database
  }

  async onModuleDestroy(): Promise<void> {
    // Nest calls this hook when the application closes.
    await this.database?.$disconnect()
  }

  private createClient() {
    // For local development, copy the root .env.example to .env and set DATABASE_URL there.
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      return undefined
    }

    return new PrismaClient({
      adapter: new PrismaPg({
        connectionString,
        connectionTimeoutMillis: 2_000,
        query_timeout: 2_000,
      }),
    })
  }
}
