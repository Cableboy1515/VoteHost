import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? "fallback-dev-secret-change-in-production"
)
const COOKIE = "vh_session"

export async function verifyAdminCredentials(email: string, password: string) {
  if (email !== process.env.ADMIN_EMAIL) return false
  const hash = process.env.ADMIN_PASSWORD_HASH
  if (!hash) return false
  return bcrypt.compare(password, hash)
}

export async function createSession() {
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SECRET)
  return token
}

export async function getSession() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload
  } catch {
    return null
  }
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload
  } catch {
    return null
  }
}

export { COOKIE }
