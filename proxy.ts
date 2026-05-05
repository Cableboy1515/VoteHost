import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? "fallback-dev-secret-change-in-production"
)
const COOKIE = "vh_session"

export async function proxy(req: NextRequest) {
  const isAdminRoute = req.nextUrl.pathname.startsWith("/admin")
  const isLoginPage = req.nextUrl.pathname === "/admin/login"

  if (!isAdminRoute) return NextResponse.next()

  const token = req.cookies.get(COOKIE)?.value
  let valid = false
  if (token) {
    try {
      await jwtVerify(token, SECRET)
      valid = true
    } catch {
      valid = false
    }
  }

  if (!isLoginPage && !valid) {
    return NextResponse.redirect(new URL("/admin/login", req.url))
  }

  if (isLoginPage && valid) {
    return NextResponse.redirect(new URL("/admin/dashboard", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
