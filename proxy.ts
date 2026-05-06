import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? "fallback-dev-secret-change-in-production"
)
const COOKIE = "vh_session"

const BYPASS_PATHS = ["/admin/login", "/admin/setup", "/admin/change-password"]

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isAdminRoute = pathname.startsWith("/admin")

  if (!isAdminRoute) return NextResponse.next()

  // Always allow setup through — first-run page handles its own redirect
  if (pathname === "/admin/setup") return NextResponse.next()

  const token = req.cookies.get(COOKIE)?.value
  let payload: Record<string, unknown> | null = null

  if (token) {
    try {
      const { payload: p } = await jwtVerify(token, SECRET)
      payload = p as Record<string, unknown>
    } catch {
      payload = null
    }
  }

  const isLoginPage = pathname === "/admin/login"
  const valid = payload !== null

  // Unauthenticated → redirect to login (except login itself)
  if (!isLoginPage && !valid) {
    return NextResponse.redirect(new URL("/admin/login", req.url))
  }

  // Already logged in → skip login page
  if (isLoginPage && valid) {
    return NextResponse.redirect(new URL("/admin/dashboard", req.url))
  }

  if (valid && payload) {
    const mustChange = payload.mustChangePassword === true
    const role = payload.role as string

    // Force password change
    if (mustChange && !BYPASS_PATHS.includes(pathname)) {
      return NextResponse.redirect(new URL("/admin/change-password", req.url))
    }

    // ADMIN-only routes
    const isAdminOnly = pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/users")
    if (isAdminOnly && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
