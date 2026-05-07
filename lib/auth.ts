import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import type { AdminRole, AdminUser } from "@/lib/generated/prisma/client"

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET environment variable is required — set it in .env")
}
const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET)
const COOKIE = "vh_session"

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24,
}

// Pre-generated at startup so bcrypt.compare always runs the same cost for missing users
const TIMING_HASH = bcrypt.hashSync("__timing_sentinel__", 12)

export type SessionPayload = {
  sub: string
  email: string
  role: AdminRole
  mustChangePassword: boolean
  tokenVersion: number
}

const ROLE_ORDER: Record<AdminRole, number> = {
  VIEWER: 0,
  ORGANIZER: 1,
  ADMIN: 2,
}

export async function verifyAdminCredentials(email: string, password: string): Promise<AdminUser | null> {
  const user = await db.adminUser.findUnique({ where: { email } })
  // Always run bcrypt to prevent user-enumeration via timing side-channel
  const valid = await bcrypt.compare(password, user?.passwordHash ?? TIMING_HASH)
  if (!user || !valid) return null
  return user
}

export async function createSession(user: AdminUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    tokenVersion: user.tokenVersion,
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

  // Verify session has not been revoked (tokenVersion must match DB)
  const user = await db.adminUser.findUnique({
    where: { id: session.sub },
    select: { tokenVersion: true },
  })
  if (!user || user.tokenVersion !== (session.tokenVersion ?? 0)) return null

  return session
}

export { COOKIE }
