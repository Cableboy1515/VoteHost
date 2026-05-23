export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getScheduledFutureElections } from "@/lib/scheduledElections"
import { getDisplayTimeZone } from "@/lib/timezone"

export async function GET() {
  const session = await getSession()
  if (!session || session.role === "VIEWER") {
    return NextResponse.json({ elections: [], tz: "UTC" })
  }
  const [elections, tz] = await Promise.all([
    getScheduledFutureElections(),
    getDisplayTimeZone(),
  ])
  return NextResponse.json({ elections, tz })
}
