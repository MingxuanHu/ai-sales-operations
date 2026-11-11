import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { HealthService } from './health.service'

// The controller path and global prefix give this route its /api/health URL.
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // Nest serializes the return value to JSON and uses the exception's status for failures.
  @Get()
  async getHealth() {
    try {
      await this.health.checkDatabase()
      return { status: 'ok' }
    } catch {
      // Keep database connection errors out of the HTTP response.
      throw new ServiceUnavailableException({ status: 'unavailable' })
    }
  }
}
