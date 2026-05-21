import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { csrfCheck } from "@/lib/csrf"
import { detectImageType, MAX_UPLOAD_BYTES } from "@/lib/uploads"
import { writeFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

const UPLOADS_DIR = join(process.cwd(), "public", "uploads")

export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const detected = detectImageType(buffer)
  if (!detected) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a PNG, JPEG, or WebP image." },
      { status: 415 }
    )
  }

  const filename = `${randomUUID()}.${detected.ext}`
  await writeFile(join(UPLOADS_DIR, filename), buffer)

  return NextResponse.json({
    url: `/api/files/${filename}`,
    deleteUrl: `/api/upload/image/${filename}`,
  })
}

export async function DELETE(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const filename = searchParams.get("file")
  if (!filename || filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 })
  }

  await unlink(join(UPLOADS_DIR, filename)).catch(() => undefined)
  return new NextResponse(null, { status: 204 })
}
