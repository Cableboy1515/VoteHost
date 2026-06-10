import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { getClientIp } from "@/lib/clientIp"
import { normalizeReceiptCode } from "@/lib/verification"

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
  const code = normalizeReceiptCode(rawCode)

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
