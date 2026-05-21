import { NextResponse } from "next/server"

function allowedOrigins(): Set<string> {
  const raw = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const out = new Set<string>()
  for (const part of raw.split(",")) {
    const v = part.trim()
    if (!v) continue
    try { out.add(new URL(v).origin) } catch {}
  }
  return out
}

export function csrfCheck(req: Request): NextResponse | null {
  const origin = req.headers.get("origin")

  // Reject requests that omit the Origin header on state-changing methods.
  // Browsers always send Origin for cross-site requests; legitimate same-site
  // form POSTs include Origin on modern browsers. Missing Origin == programmatic
  // client that bypassed the browser — treat as untrusted.
  if (!origin) {
    const method = req.method.toUpperCase()
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return null
  }

  let parsed: string
  try { parsed = new URL(origin).origin }
  catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }) }

  if (!allowedOrigins().has(parsed)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return null
}
