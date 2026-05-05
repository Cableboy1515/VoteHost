import { NextResponse } from "next/server"
import { verifyAdminCredentials, createSession, COOKIE } from "@/lib/auth"

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 })
  }

  const valid = await verifyAdminCredentials(email, password)
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  const token = await createSession()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  })
  return res
}
