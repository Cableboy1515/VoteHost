import { generateSecret, generateSync, verifySync, generateURI } from "otplib"
import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto"
import bcrypt from "bcryptjs"
import { BRAND_NAME } from "@/lib/branding"

const GCM_TAG_LENGTH = 16

function getTotpEncKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for TOTP encryption")
  // Domain-separated key from the server secret — never used for JWT signing
  return createHash("sha256").update(`totp-enc-key:${secret}`).digest()
}

export function encryptTotpSecret(plaintext: string): string {
  const key = getTotpEncKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // iv(12) + ciphertext + tag(16) — base64url encoded
  return Buffer.concat([iv, ct, tag]).toString("base64url")
}

export function decryptTotpSecret(encrypted: string): string {
  const key = getTotpEncKey()
  const buf = Buffer.from(encrypted, "base64url")
  const iv = buf.slice(0, 12)
  const tag = buf.slice(buf.length - GCM_TAG_LENGTH)
  const ct = buf.slice(12, buf.length - GCM_TAG_LENGTH)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ct) + decipher.final("utf8")
}

export function generateTotpSetup(email: string): { secret: string; otpauthUrl: string } {
  const secret = generateSecret()
  const otpauthUrl = generateURI({ label: email, issuer: BRAND_NAME, secret })
  return { secret, otpauthUrl }
}

export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    const result = verifySync({ token: code, secret })
    return result.valid
  } catch {
    return false
  }
}

const RECOVERY_CODE_BYTES = 6 // 12 hex chars per code
const RECOVERY_CODE_COUNT = 10

export async function generateRecoveryCodes(): Promise<{ codes: string[]; hashes: string[] }> {
  const codes: string[] = []
  const hashes: string[] = []
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = randomBytes(RECOVERY_CODE_BYTES).toString("hex").toUpperCase()
    const formatted = `${raw.slice(0, 6)}-${raw.slice(6)}` // XXXXXX-XXXXXX
    codes.push(formatted)
    hashes.push(await bcrypt.hash(raw, 12))
  }
  return { codes, hashes }
}

/** Returns the index of the matching code hash, or -1 if no match. */
export async function findMatchingRecoveryCode(input: string, hashes: string[]): Promise<number> {
  const normalised = input.replace(/-/g, "").toUpperCase()
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalised, hashes[i])) return i
  }
  return -1
}
