import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { unlink } from "node:fs/promises"
import { join } from "node:path"

const UPLOADS_DIR = join(process.cwd(), "public", "uploads")

// Called by deleteImage() — also works as a one-click browser link for admins
export async function GET(_req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { filename } = await params
  if (filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 })
  }

  await unlink(join(UPLOADS_DIR, filename)).catch(() => undefined)
  return NextResponse.json({ deleted: filename })
}
