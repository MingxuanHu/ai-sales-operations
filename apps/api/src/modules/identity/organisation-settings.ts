import { InternalServerErrorException } from '@nestjs/common'
import type { Prisma } from '../../generated/prisma/client'

export function approvalThreshold(settings: Prisma.JsonValue) {
  // Settings values are JSON, so narrow the value before using it in the approval rule.
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const threshold = settings.orderApprovalThresholdBasisPoints
    if (threshold === undefined) return 1_000 // 1,000 hundredths of a percent is 10%.
    if (typeof threshold === 'number' && Number.isInteger(threshold) && threshold >= 0 && threshold <= 10_000) {
      return threshold
    }
  }
  throw new InternalServerErrorException('Invalid organisation order approval settings.')
}
