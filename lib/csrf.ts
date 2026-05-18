import { NextResponse } from "next/server"

function originsFromEnv(): Set<string> {
  const raw = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const out = new Set<string>()
  for (const part of raw.split(",")) {
    const v = part.trim()
    if (!v) continue
    try { out.add(new URL(v).origin) } catch {}
  }
  return out
}

function forwardedOrigin(req: Request): string | null {
  const host = req.headers.get("x-forwarded-host")
  if (!host) return null
  const proto = req.headers.get("x-forwarded-proto") ?? "https"
  try { return new URL(`${proto}://${host}`).origin } catch { return null }
}

export function csrfCheck(req: Request): NextResponse | null {
  const origin = req.headers.get("origin")
  if (!origin) return null
  let parsed: string
  try { parsed = new URL(origin).origin }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }) }

  const allowed = originsFromEnv()
  const fwd = forwardedOrigin(req)
  if (fwd) allowed.add(fwd)

  if (!allowed.has(parsed)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return null
}
