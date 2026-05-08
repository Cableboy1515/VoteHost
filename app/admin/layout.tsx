"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BrandMark } from "@/components/ui/brand-mark"
import { LayoutDashboard, Vote, Archive, Users, Settings, Plus } from "lucide-react"
import { UnsavedChangesProvider, GuardLink } from "@/components/admin/UnsavedChangesGuard"

const BARE_PATHS = ["/admin/login", "/admin/setup", "/admin/change-password"]

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, match: (p: string) => p === "/admin/dashboard" },
  { label: "Elections", href: "/admin/elections", icon: Vote, match: (p: string) => p.startsWith("/admin/elections") },
  { label: "Archive", href: "/admin/archive", icon: Archive, match: (p: string) => p.startsWith("/admin/archive") },
]

const ADMIN_NAV_ITEMS = [
  { label: "Users", href: "/admin/users", icon: Users, match: (p: string) => p.startsWith("/admin/users") },
  { label: "Settings", href: "/admin/settings", icon: Settings, match: (p: string) => p.startsWith("/admin/settings") },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    if (!BARE_PATHS.includes(pathname)) {
      fetch("/api/auth/me")
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d?.role) setRole(d.role) })
        .catch(() => {})
    }
  }, [pathname])

  if (BARE_PATHS.includes(pathname)) return <>{children}</>

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/admin/login")
  }

  const allNavItems = role === "ADMIN" ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS

  return (
    <UnsavedChangesProvider>
      <div className="min-h-screen flex bg-vh-bg">
        <aside
          className="w-60 flex-shrink-0 flex flex-col bg-vh-surface"
          style={{ borderRight: "1px solid var(--vh-line)" }}
        >
          <div className="px-5 py-5" style={{ borderBottom: "1px solid var(--vh-line)" }}>
            <BrandMark size={22} />
          </div>

          <nav className="flex-1 p-3 flex flex-col gap-0.5">
            {allNavItems.map(({ label, href, icon: Icon, match }) => {
              const active = match(pathname)
              return (
                <GuardLink
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-colors"
                  style={{
                    color: active ? "white" : "var(--vh-ink-soft)",
                    background: active ? "var(--vh-accent)" : "transparent",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  <Icon size={16} style={{ opacity: 0.9 }} />
                  {label}
                </GuardLink>
              )
            })}

            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--vh-line)" }}>
              <GuardLink
                href="/admin/elections/new"
                className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm transition-colors"
                style={{ color: "var(--vh-ink-soft)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)"; (e.currentTarget as HTMLElement).style.color = "var(--vh-ink)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--vh-ink-soft)" }}
              >
                <Plus size={16} />
                New election
              </GuardLink>
            </div>
          </nav>

          <div className="p-4" style={{ borderTop: "1px solid var(--vh-line)" }}>
            <button
              onClick={handleSignOut}
              className="text-sm transition-colors w-full text-left px-3 py-2 rounded-[10px]"
              style={{ color: "var(--vh-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--vh-ink)"; (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--vh-muted)"; (e.currentTarget as HTMLElement).style.background = "transparent" }}
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </UnsavedChangesProvider>
  )
}
