import { Prisma } from '../generated/prisma/client'

// Prisma exposes this error as a string code. P2002 means a unique constraint was violated.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002'

export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION
}

// Prisma reports a PostgreSQL foreign key violation as P2003.
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003'
}
