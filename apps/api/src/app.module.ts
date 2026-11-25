import { Module } from '@nestjs/common'
import { HealthModule } from './modules/health/health.module'
import { IdentityModule } from './modules/identity/identity.module'
import { CustomersModule } from './modules/customers/customers.module'
import { ProductsModule } from './modules/products/products.module'
import { OrdersModule } from './modules/orders/orders.module'

// The root module assembles feature modules so Nest can load their routes at startup.
@Module({
  imports: [HealthModule, IdentityModule, ProductsModule, CustomersModule, OrdersModule],
})
export class AppModule {}
