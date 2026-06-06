import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { getClientIp } from "@/lib/clientIp"

function normalizeCode(raw: string): string {
  const stripped = raw.toUpperCase().replace(/[^A-Z2-7]/g, "")
  if (stripped.length !== 16) return ""
  return `${stripped.slice(0, 4)}-${stripped.slice(4, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}`
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ electionId: string }> }
) {
  const ip = getClientIp(req)
  const rl = rateLimit(`verify:ip:${ip}`, { limit: 20, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const { electionId } = await params
  const url = new URL(req.url)
  const rawCode = url.searchParams.get("code") ?? ""
  const code = normalizeCode(rawCode)

  if (!code) {
    return NextResponse.json({ found: false })
  }

  const receipt = await db.ballotReceipt.findUnique({
    where: { receiptCode: code },
    select: { electionId: true, createdAt: true },
  })

  if (!receipt || receipt.electionId !== electionId) {
    return NextResponse.json({ found: false })
  }

  return NextResponse.json({ found: true, createdAt: receipt.createdAt.toISOString() })
}
