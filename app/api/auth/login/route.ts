import { NextResponse } from "next/server"
import { verifyAdminCredentials, createSession, COOKIE } from "@/lib/auth"

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 })
  }

  const user = await verifyAdminCredentials(email, password)
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  const token = await createSession(user)
  const res = NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword })
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  })
  return res
}
