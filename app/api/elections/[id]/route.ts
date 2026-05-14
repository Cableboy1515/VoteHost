import { NextResponse } from "next/server"
import { unlink } from "node:fs/promises"
import { join } from "node:path"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { ElectionBaseSchema, ElectionSchema } from "@/lib/validations"

const UPLOADS_DIR = join(process.cwd(), "public", "uploads")

function unlinkUpload(deleteUrl: string): Promise<void> {
  // Accepts both relative `/api/upload/image/uuid.jpg` and absolute legacy URLs.
  const match = deleteUrl.match(/\/api\/upload\/image\/([^/?#]+)/)
  if (!match) return Promise.resolve()
  const filename = match[1]
  if (filename.includes("/") || filename.includes("..")) return Promise.resolve()
  return unlink(join(UPLOADS_DIR, filename)).catch(() => undefined)
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const election = await db.election.findUnique({
    where: { id },
    include: {
      questions: {
        include: { options: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(election)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const parsed = ElectionBaseSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  const election = await db.election.update({ where: { id }, data: parsed.data })
  return NextResponse.json(election)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  // Collect hosted-image delete URLs before cascading delete wipes them
  const election = await db.election.findUnique({
    where: { id },
    select: {
      emailLogoDeleteUrl: true,
      questions: { select: { options: { select: { photoDeleteUrl: true } } } },
    },
  })

  await db.election.delete({ where: { id } })

  if (election) {
    const deleteUrls: string[] = []
    if (election.emailLogoDeleteUrl) deleteUrls.push(election.emailLogoDeleteUrl)
    for (const q of election.questions) {
      for (const o of q.options) {
        if (o.photoDeleteUrl) deleteUrls.push(o.photoDeleteUrl)
      }
    }
    await Promise.allSettled(deleteUrls.map(unlinkUpload))
  }

  return new NextResponse(null, { status: 204 })
}
