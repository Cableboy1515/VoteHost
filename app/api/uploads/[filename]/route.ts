import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

const UPLOADS_DIR = join(process.cwd(), "public", "uploads")
const ALLOWED = /^[a-f0-9-]+\.(jpg|png)$/i

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  if (!ALLOWED.test(filename)) {
    return new NextResponse(null, { status: 404 })
  }
  try {
    const bytes = await readFile(join(UPLOADS_DIR, filename))
    const contentType = filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
