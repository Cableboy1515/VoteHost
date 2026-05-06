import { NextResponse } from "next/server"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { ElectionSchema } from "@/lib/validations"

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
  const parsed = ElectionSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const election = await db.election.update({ where: { id }, data: parsed.data })
  return NextResponse.json(election)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  await db.election.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
