export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"
// archiver v8 is ESM-only with no matching @types; require bypasses the stale CJS typedefs
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ZipArchive } = require("archiver") as { ZipArchive: new (opts?: object) => NodeJS.ReadableStream & { append(src: NodeJS.ReadableStream | Buffer | string, data: { name: string }): void; finalize(): void } }
import { PassThrough } from "node:stream"
import { requireRole } from "@/lib/auth"
import { csrfCheck } from "@/lib/csrf"
import { dumpDatabase } from "@/lib/backup/dumpData"
import { packHeader, type BackupHeader, type BackupType } from "@/lib/backup/format"
import { encryptZip, generateSalt, generateIV } from "@/lib/backup/crypto"
import { createHash } from "node:crypto"

function buildZip(dataJson: string, manifestJson: string, uploadFiles: { name: string; buf: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 6 } })
    const passThrough = new PassThrough()
    const chunks: Buffer[] = []

    passThrough.on("data", (chunk: Buffer) => chunks.push(chunk))
    passThrough.on("end", () => resolve(Buffer.concat(chunks)))
    passThrough.on("error", reject)
    archive.on("error", reject)

    archive.pipe(passThrough)

    archive.append(dataJson, { name: "db.json" })
    archive.append(manifestJson, { name: "manifest.json" })

    for (const { name, buf } of uploadFiles) {
      archive.append(buf, { name: `uploads/${name}` })
    }

    archive.finalize()
  })
}

export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const type = body.type as BackupType | undefined
  const passphrase = body.passphrase as string | undefined

  if (type !== "full" && type !== "elections") {
    return NextResponse.json({ error: "type must be 'full' or 'elections'" }, { status: 400 })
  }
  if (!passphrase || passphrase.trim() === "") {
    return NextResponse.json({ error: "Passphrase is required" }, { status: 400 })
  }

  const { data, counts } = await dumpDatabase(type)

  const dataJson = JSON.stringify(data)
  const dbHash = createHash("sha256").update(dataJson).digest("hex")

  const uploadsDir = path.join(process.cwd(), "public", "uploads")
  const uploadFiles: { name: string; buf: Buffer }[] = []

  let uploadsExist = false
  try {
    await fs.access(uploadsDir)
    uploadsExist = true
  } catch {
    // directory doesn't exist — skip
  }

  if (uploadsExist) {
    const files = await fs.readdir(uploadsDir).catch(() => [] as string[])
    for (const filename of files) {
      if (dataJson.includes(`/uploads/${filename}`)) {
        try {
          const buf = await fs.readFile(path.join(uploadsDir, filename))
          uploadFiles.push({ name: filename, buf })
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  const createdAt = new Date().toISOString()
  const salt = generateSalt()
  const iv = generateIV()

  const manifest = {
    type,
    schemaVersion: "1",
    voteHostVersion: "0.1.0",
    createdAt,
    counts,
    dbSha256: dbHash,
  }
  const manifestJson = JSON.stringify(manifest)

  const zipBuffer = await buildZip(dataJson, manifestJson, uploadFiles)

  const header: BackupHeader = {
    type,
    schemaVersion: "1",
    voteHostVersion: "0.1.0",
    createdAt,
    kdf: {
      name: "scrypt",
      N: 131072,
      r: 8,
      p: 1,
      saltB64: salt.toString("base64"),
    },
    ivB64: iv.toString("base64"),
    counts,
  }

  // Pack header first so its bytes can serve as GCM AAD — binds the plaintext header
  // to the ciphertext, preventing undetected tampering of type/schemaVersion fields.
  const headerBuf = packHeader(header)
  const ciphertextWithTag = await encryptZip(passphrase, zipBuffer, salt, iv, headerBuf)
  const vhbak = Buffer.concat([headerBuf, ciphertextWithTag])

  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = `votehost-${type}-${dateStr}.vhbak`

  return new Response(vhbak as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
