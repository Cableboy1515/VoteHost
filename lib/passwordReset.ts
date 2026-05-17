import crypto from "node:crypto"

const RESET_TTL_MS = 60 * 60 * 1000 // 1 hour

export function generateResetToken() {
  const raw = crypto.randomBytes(32).toString("base64url")
  const hash = crypto.createHash("sha256").update(raw).digest("hex")
  const expiresAt = new Date(Date.now() + RESET_TTL_MS)
  return { raw, hash, expiresAt }
}

export function hashResetToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex")
}
