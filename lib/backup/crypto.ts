import { randomBytes, scrypt as _scrypt, createCipheriv, createDecipheriv } from "node:crypto"
import type { ScryptOptions } from "node:crypto"

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 32

const SCRYPT_OPTS: ScryptOptions = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }

function scryptAsync(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    _scrypt(passphrase, salt, KEY_LENGTH, SCRYPT_OPTS, (err, key) => {
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

export async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(passphrase, salt)
}

export function encryptZip(
  passphrase: string,
  zipBuffer: Buffer,
  salt: Buffer,
  iv: Buffer,
): Promise<Buffer> {
  return deriveKey(passphrase, salt).then((key) => {
    const cipher = createCipheriv("aes-256-gcm", key, iv)
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
): Promise<Buffer> {
  return deriveKey(passphrase, salt).then((key) => {
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  })
}
