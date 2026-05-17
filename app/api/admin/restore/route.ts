export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import * as unzipper from "unzipper"
import { requireRole } from "@/lib/auth"
import { csrfCheck } from "@/lib/csrf"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { unpackHeader } from "@/lib/backup/format"
import { decryptZip } from "@/lib/backup/crypto"
import { restoreDatabase } from "@/lib/backup/restoreData"
import type { BackupData } from "@/lib/backup/dumpData"

export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`restore:${session.sub}`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 })
  }

  const fileBlob = formData.get("file")
  const passphrase = formData.get("passphrase")

  if (!(fileBlob instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 })
  }
  if (typeof passphrase !== "string" || passphrase.trim() === "") {
    return NextResponse.json({ error: "Passphrase is required" }, { status: 400 })
  }

  const fileBuffer = Buffer.from(await fileBlob.arrayBuffer())

  let header: ReturnType<typeof unpackHeader>["header"]
  let dataOffset: number
  let formatVersion: number
  try {
    const parsed = unpackHeader(fileBuffer)
    header = parsed.header
    dataOffset = parsed.dataOffset
    formatVersion = parsed.formatVersion
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid backup file: ${(err as Error).message}` },
      { status: 400 },
    )
  }

  // Layout: [header][ciphertext][tag(16 bytes)]
  const GCM_TAG_LENGTH = 16
  if (fileBuffer.length < dataOffset + GCM_TAG_LENGTH) {
    return NextResponse.json({ error: "Backup file is truncated" }, { status: 400 })
  }

  const ciphertext = fileBuffer.slice(dataOffset, fileBuffer.length - GCM_TAG_LENGTH)
  const tag = fileBuffer.slice(fileBuffer.length - GCM_TAG_LENGTH)

  const salt = Buffer.from(header.kdf.saltB64, "base64")
  const iv = Buffer.from(header.ivB64, "base64")

  // v2+: pass header bytes as AAD so GCM auth tag covers the plaintext header.
  // v1 archives have no AAD — omit to maintain backward compatibility.
  const aad = formatVersion >= 2 ? fileBuffer.slice(0, dataOffset) : undefined
  const kdfOpts = { N: header.kdf.N, r: header.kdf.r, p: header.kdf.p }

  let decryptedZip: Buffer
  try {
    decryptedZip = await decryptZip(passphrase, ciphertext, salt, iv, tag, kdfOpts, aad)
  } catch {
    return NextResponse.json(
      { error: "Incorrect passphrase or corrupt archive" },
      { status: 400 },
    )
  }

  const directory = await unzipper.Open.buffer(decryptedZip)

  const dbFile = directory.files.find((f) => f.path === "db.json")
  if (!dbFile) {
    return NextResponse.json({ error: "Archive is missing db.json" }, { status: 400 })
  }
  const dbJsonBuf = await dbFile.buffer()

  const manifestFile = directory.files.find((f) => f.path === "manifest.json")
  if (manifestFile) {
    const manifest = JSON.parse((await manifestFile.buffer()).toString("utf8")) as { dbSha256?: string }
    if (manifest.dbSha256) {
      const actualHash = createHash("sha256").update(dbJsonBuf).digest("hex")
      if (actualHash !== manifest.dbSha256) {
        return NextResponse.json({ error: "Archive integrity check failed" }, { status: 400 })
      }
    }
  }

  const data = JSON.parse(dbJsonBuf.toString("utf8")) as BackupData

  const uploadsDir = path.join(process.cwd(), "public", "uploads")
  const uploadEntries = directory.files.filter(
    (f) => f.type === "File" && f.path.startsWith("uploads/"),
  )
  if (uploadEntries.length > 0) {
    await fs.mkdir(uploadsDir, { recursive: true })
    for (const entry of uploadEntries) {
      const filename = path.basename(entry.path)
      if (!filename) continue
      const buf = await entry.buffer()
      await fs.writeFile(path.join(uploadsDir, filename), buf)
    }
  }

  try {
    const counts = await restoreDatabase(header.type, data, header.schemaVersion)
    return NextResponse.json({ ok: true, type: header.type, counts })
  } catch (err) {
    const e = err as Error & { code?: string }
    if (e.code === "ACTIVE_ELECTIONS") {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    return NextResponse.json({ error: e.message ?? "Restore failed" }, { status: 400 })
  }
}
