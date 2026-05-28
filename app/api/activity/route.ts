export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET(req: Request) {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10), 500)
  const cursor = url.searchParams.get("cursor") ?? undefined

  const logs = await db.activityLog.findMany({
    where: { electionId: null },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const nextCursor = logs.length > limit ? logs[limit - 1].id : null
  return NextResponse.json({ logs: logs.slice(0, limit), nextCursor })
}
