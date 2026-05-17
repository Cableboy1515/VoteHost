import { randomBytes, scrypt as _scrypt, createCipheriv, createDecipheriv } from "node:crypto"
import type { ScryptOptions } from "node:crypto"

const SCRYPT_N = 131072  // 2^17 — OWASP 2026 minimum for interactive KDF
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 32

type KdfOpts = { N: number; r: number; p: number }

function scryptAsync(passphrase: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const N = (opts.N as number) ?? 16384
    const r = (opts.r as number) ?? 8
    // maxmem must cover 128·N·r bytes; default OpenSSL cap is 32 MiB which is too low for N≥2^17
    const maxmem = 128 * N * r * 2
    _scrypt(passphrase, salt, KEY_LENGTH, { ...opts, maxmem }, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
}

export function generateSalt(): Buffer {
  return randomBytes(32)
}

export function generateIV(): Buffer {
  return randomBytes(12)
}

export async function deriveKey(
  passphrase: string,
  salt: Buffer,
  opts?: KdfOpts,
): Promise<Buffer> {
  const { N = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P } = opts ?? {}
  return scryptAsync(passphrase, salt, { N, r, p })
}

export function encryptZip(
  passphrase: string,
  zipBuffer: Buffer,
  salt: Buffer,
  iv: Buffer,
  aad?: Buffer,
): Promise<Buffer> {
  return deriveKey(passphrase, salt).then((key) => {
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    if (aad) cipher.setAAD(aad)
    const ciphertext = Buffer.concat([cipher.update(zipBuffer), cipher.final()])
    const tag = cipher.getAuthTag()
    // tag appended as last 16 bytes
    return Buffer.concat([ciphertext, tag])
  })
}

export function decryptZip(
  passphrase: string,
  ciphertext: Buffer,
  salt: Buffer,
  iv: Buffer,
  tag: Buffer,
  kdfOpts?: KdfOpts,
  aad?: Buffer,
): Promise<Buffer> {
  return deriveKey(passphrase, salt, kdfOpts).then((key) => {
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    if (aad) decipher.setAAD(aad)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  })
}
