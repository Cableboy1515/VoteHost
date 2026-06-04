import { PrismaClient } from "./generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

function createClient() {
  // Default pg pool max is 10, which is easily exhausted by the sequential
  // mass-invite loop (1 interactive transaction + 2 concurrent updates per voter).
  // 20 gives pages and background tasks enough headroom to coexist.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 20 })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
