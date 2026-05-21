import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { cache } from "react"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import type { AdminRole, AdminUser } from "@/lib/generated/prisma/client"

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET environment variable is required — set it in .env")
}
const SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET)
// Domain-separated secret for 2FA challenge tokens — never used for session signing
const CHALLENGE_SECRET = new TextEncoder().encode(`2fa-challenge:${process.env.NEXTAUTH_SECRET}`)
const COOKIE = "vh_session"

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 8, // 8-hour TTL; re-login required after idle day
}

// Pre-generated at startup so bcrypt.compare always runs the same cost for missing users
const TIMING_HASH = bcrypt.hashSync("__timing_sentinel__", 12)

export type SessionPayload = {
  sub: string
  email: string
  role: AdminRole
  tokenVersion: number
}

const ROLE_ORDER: Record<AdminRole, number> = {
  VIEWER: 0,
  ORGANIZER: 1,
  ADMIN: 2,
}

export async function verifyAdminCredentials(email: string, password: string): Promise<AdminUser | null> {
  const user = await db.adminUser.findUnique({ where: { email } })
  // Always run bcrypt to prevent user-enumeration via timing side-channel.
  // Reject users whose passwordHash is null — they have a pending invitation.
  const valid = await bcrypt.compare(password, user?.passwordHash ?? TIMING_HASH)
  if (!user || !user.passwordHash || !valid) return null
  return user
}

export async function createSession(user: Pick<AdminUser, "id" | "email" | "role" | "tokenVersion">): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(SECRET)
}

// Cached per-request so repeated getSession() calls within a single render
// hit the DB only once.
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null

  let payload: SessionPayload
  try {
    const result = await jwtVerify(token, SECRET)
    payload = result.payload as unknown as SessionPayload
  } catch {
    return null
  }

  // Always validate tokenVersion against DB — catches revoked sessions even when
  // only getSession() (not requireRole) is called by a route or layout.
  const user = await db.adminUser.findUnique({
    where: { id: payload.sub },
    select: { tokenVersion: true },
  })
  if (!user || user.tokenVersion !== (payload.tokenVersion ?? 0)) return null

  return payload
})

export async function requireRole(min: AdminRole): Promise<SessionPayload | null> {
  const session = await getSession()
  if (!session) return null
  if (ROLE_ORDER[session.role] < ROLE_ORDER[min]) return null
  return session
}

// Short-lived challenge token used for the two-step 2FA login flow.
// Purpose "totp" = user has 2FA enabled and must verify it.
// Purpose "enroll" = ADMIN/ORGANIZER without 2FA must set it up before getting a session.
export async function createChallengeToken(userId: string, purpose: "totp" | "enroll"): Promise<string> {
  return new SignJWT({ sub: userId, purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(CHALLENGE_SECRET)
}

export async function verifyChallengeToken(token: string, purpose: "totp" | "enroll"): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, CHALLENGE_SECRET)
    if (payload.purpose !== purpose) return null
    return (payload.sub as string) ?? null
  } catch {
    return null
  }
}

export { COOKIE }
