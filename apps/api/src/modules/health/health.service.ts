import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'

@Injectable()
export class HealthService {
  // Nest injects the shared provider exported by DatabaseModule.
  constructor(private readonly prisma: PrismaService) {}

  async checkDatabase(): Promise<void> {
    // A tagged query asks PostgreSQL to evaluate a constant without needing any tables.
    await this.prisma.client.$queryRaw`SELECT 1`
  }
}
