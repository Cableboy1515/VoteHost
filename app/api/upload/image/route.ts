import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { writeFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

const UPLOADS_DIR = join(process.cwd(), "public", "uploads")

export async function POST(req: Request) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const ext = file.type === "image/png" ? "png" : "jpg"
  const filename = `${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  await writeFile(join(UPLOADS_DIR, filename), buffer)

  const url = `/uploads/${filename}`
  const deleteUrl = `/api/upload/image/${filename}`

  return NextResponse.json({ url, deleteUrl })
}

export async function DELETE(req: Request) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Support delete via query param: DELETE /api/upload/image?file=uuid.jpg
  const { searchParams } = new URL(req.url)
  const filename = searchParams.get("file")
  if (!filename || filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 })
  }

  await unlink(join(UPLOADS_DIR, filename)).catch(() => undefined)
  return new NextResponse(null, { status: 204 })
}
