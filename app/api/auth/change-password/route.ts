import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { getSession, createSession, COOKIE } from "@/lib/auth"
import { db } from "@/lib/db"

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { newPassword, confirmPassword } = await req.json().catch(() => ({}))

  if (!newPassword || newPassword !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  const user = await db.adminUser.update({
    where: { id: session.sub },
    data: { passwordHash, mustChangePassword: false },
  })

  const token = await createSession(user)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  })
  return res
}
