import { Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

// Modules that import DatabaseModule can inject the same PrismaService provider.
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
