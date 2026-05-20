import { NextResponse } from "next/server"
import { version } from "@/package.json"

export async function GET() {
  return NextResponse.json({
    ok: true,
    version,
    gitSha: process.env.NEXT_PUBLIC_GIT_SHA ?? "dev",
  })
}
