import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  const election = await db.election.findUnique({ where: { id: electionId } })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (election.status !== "COMPLETED") {
    return NextResponse.json({ error: "Election is not completed." }, { status: 409 })
  }

  await db.election.update({
    where: { id: electionId },
    data: { dashboardDismissedAt: new Date() },
  })

  return NextResponse.json({ dismissed: true })
}
