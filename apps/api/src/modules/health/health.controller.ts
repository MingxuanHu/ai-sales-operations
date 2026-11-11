import { Controller, Get } from '@nestjs/common'

// A decorator is an @-prefixed instruction. @Controller adds "health" to this class's route path.
@Controller('health')
export class HealthController {
  // @Get handles HTTP GET requests at the controller's path. Nest converts the returned object to JSON.
  @Get()
  getHealth() {
    return { status: 'ok' }
  }
}
