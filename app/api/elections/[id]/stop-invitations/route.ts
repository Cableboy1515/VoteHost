export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { csrfCheck } from "@/lib/csrf"
import { db } from "@/lib/db"
import { requestStop } from "@/lib/activationProgress"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  const election = await db.election.findUnique({
    where: { id: electionId },
    select: { status: true },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (election.status !== "ACTIVE") {
    return NextResponse.json({ error: "Election is not active." }, { status: 409 })
  }

  requestStop(electionId)

  return NextResponse.json({ ok: true })
}
