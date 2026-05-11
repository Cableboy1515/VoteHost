import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { purgeElectionImages } from "@/lib/imageRetention"
import { db } from "@/lib/db"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const election = await db.election.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (election.status === "ACTIVE") {
    return NextResponse.json({ error: "Cannot purge images for an active election" }, { status: 400 })
  }

  await purgeElectionImages(id)
  const updated = await db.election.findUnique({ where: { id }, select: { imagesPurgedAt: true } })
  return NextResponse.json({ purgedAt: updated?.imagesPurgedAt })
}
