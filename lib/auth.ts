import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import type { AdminRole, AdminUser } from "@/lib/generated/prisma/client"

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? "fallback-dev-secret-change-in-production"
)
const COOKIE = "vh_session"

export type SessionPayload = {
  sub: string
  email: string
  role: AdminRole
  mustChangePassword: boolean
}

const ROLE_ORDER: Record<AdminRole, number> = {
  VIEWER: 0,
  ORGANIZER: 1,
  ADMIN: 2,
}

export async function verifyAdminCredentials(email: string, password: string): Promise<AdminUser | null> {
  const user = await db.adminUser.findUnique({ where: { email } })
  if (!user) return null
  const valid = await bcrypt.compare(password, user.passwordHash)
  return valid ? user : null
}

export async function createSession(user: AdminUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SECRET)
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function requireRole(min: AdminRole): Promise<SessionPayload | null> {
  const session = await getSession()
  if (!session) return null
  if (ROLE_ORDER[session.role] < ROLE_ORDER[min]) return null
  return session
}

export { COOKIE }
