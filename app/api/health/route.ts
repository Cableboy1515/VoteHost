import { NextResponse } from "next/server"
import { version } from "@/package.json"

export async function GET(req: Request) {
  // Public callers get a minimal liveness response.
  // Version and build info are only returned to callers presenting CRON_SECRET,
  // keeping deployment details off the public internet (pentest finding F-04).
  const auth = req.headers.get("authorization") ?? ""
  const secret = process.env.CRON_SECRET
  const authorized = secret && auth === `Bearer ${secret}`

  if (!authorized) {
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({
    ok: true,
    version,
    gitSha: process.env.NEXT_PUBLIC_GIT_SHA ?? "dev",
  })
}
