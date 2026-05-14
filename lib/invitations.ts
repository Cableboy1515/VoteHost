import crypto from "node:crypto"

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function generateInvitationToken() {
  const raw = crypto.randomBytes(32).toString("base64url")
  const hash = crypto.createHash("sha256").update(raw).digest("hex")
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
  return { raw, hash, expiresAt }
}

export function hashInvitationToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex")
}
