import { NextResponse } from "next/server"

export function csrfCheck(req: Request): NextResponse | null {
  const origin = req.headers.get("origin")
  if (!origin) return null // same-origin requests may omit Origin header

  const allowed = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  try {
    if (new URL(origin).origin !== new URL(allowed).origin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return null
}
