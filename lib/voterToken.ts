import { randomUUID, createHash } from "node:crypto"

export function hashVoterToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function generateVoterToken(): { token: string; tokenHash: string } {
  const token = randomUUID()
  return { token, tokenHash: hashVoterToken(token) }
}
