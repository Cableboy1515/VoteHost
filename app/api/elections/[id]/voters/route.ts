import { NextResponse } from "next/server"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { VotersSchema } from "@/lib/validations"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const voters = await db.voter.findMany({
    where: { electionId: id },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(voters)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params
  const body = await req.json()

  const input = Array.isArray(body) ? body : [body]
  const parsed = VotersSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const results = await Promise.allSettled(
    parsed.data.map((voter) =>
      db.voter.create({ data: { ...voter, electionId } })
    )
  )

  const created = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<unknown>).value)
  const skipped = results.filter((r) => r.status === "rejected").length

  return NextResponse.json({ created: created.length, skipped }, { status: 201 })
}
