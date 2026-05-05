import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getResultsForElection } from "@/lib/results"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const results = await getResultsForElection(id)
  return NextResponse.json(results)
}
