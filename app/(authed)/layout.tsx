"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { BrandMark } from "@/components/ui/brand-mark"
import { LayoutDashboard, Vote, Archive, Users, Settings, Plus, Menu, X } from "lucide-react"
import { UnsavedChangesProvider, GuardLink } from "@/components/admin/UnsavedChangesGuard"

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  match: (p: string) => boolean
}

const ALL_NAV = {
  dashboard: { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
  elections: { label: "Elections", href: "/elections", icon: Vote, match: (p: string) => p.startsWith("/elections") },
  archive:   { label: "Archive",   href: "/archive",   icon: Archive,         match: (p: string) => p.startsWith("/archive") },
  users:     { label: "Users",     href: "/users",     icon: Users,           match: (p: string) => p.startsWith("/users") },
  settings:  { label: "Settings",  href: "/settings",  icon: Settings,        match: (p: string) => p.startsWith("/settings") },
} satisfies Record<string, NavItem>

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  VIEWER:    [ALL_NAV.elections],
  ORGANIZER: [ALL_NAV.dashboard, ALL_NAV.elections, ALL_NAV.archive],
  ADMIN:     [ALL_NAV.dashboard, ALL_NAV.elections, ALL_NAV.archive, ALL_NAV.users, ALL_NAV.settings],
}

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [identity, setIdentity] = useState<{ email: string; role: string } | null>(null)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.role) setIdentity({ email: d.email, role: d.role }) })
      .catch(() => {})
  }, [pathname])

  useEffect(() => { setNavOpen(false) }, [pathname])

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
  }

  const navItems: NavItem[] = identity ? (NAV_BY_ROLE[identity.role] ?? NAV_BY_ROLE.ORGANIZER) : []
  const canCreate = identity?.role === "ORGANIZER" || identity?.role === "ADMIN"

  return (
    <UnsavedChangesProvider>
      <div className="h-screen flex bg-vh-bg overflow-hidden">
        {navOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setNavOpen(false)}
          />
        )}

        <aside
          className={`w-60 flex-shrink-0 flex flex-col bg-vh-surface fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 md:static md:translate-x-0 md:transition-none ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{ borderRight: "1px solid var(--vh-line)" }}
        >
          <div className="flex items-center justify-between px-5 py-5" style={{ borderBottom: "1px solid var(--vh-line)" }}>
            <BrandMark size={28} />
            <button
              onClick={() => setNavOpen(false)}
              className="md:hidden p-1.5 rounded-[8px]"
              style={{ color: "var(--vh-muted)" }}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="flex-1 p-3 flex flex-col gap-0.5">
            {navItems.map(({ label, href, icon: Icon, match }) => {
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
                  onMouseEnter={active ? undefined : (e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)"; (e.currentTarget as HTMLElement).style.color = "var(--vh-ink)" }}
                  onMouseLeave={active ? undefined : (e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--vh-ink-soft)" }}
                >
                  <Icon size={16} style={{ opacity: 0.9 }} />
                  {label}
                </GuardLink>
              )
            })}

            {canCreate && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--vh-line)" }}>
                <GuardLink
                  href="/elections/new"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm transition-colors"
                  style={{ color: "var(--vh-ink-soft)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)"; (e.currentTarget as HTMLElement).style.color = "var(--vh-ink)" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--vh-ink-soft)" }}
                >
                  <Plus size={16} />
                  New election
                </GuardLink>
              </div>
            )}
          </nav>

          <div className="p-4" style={{ borderTop: "1px solid var(--vh-line)" }}>
            <div className="px-3 pb-3" style={{ color: "var(--vh-muted)" }}>
              <div className="text-[12.5px] truncate leading-tight">{identity?.email ?? ""}</div>
              <div className="text-[11.5px] mt-0.5 capitalize" style={{ opacity: 0.75 }}>
                {identity ? identity.role.toLowerCase() : ""}
              </div>
            </div>
            <GuardLink
              href="/account/password"
              className="text-sm transition-colors w-full text-left px-3 py-2 rounded-[10px] block"
              style={{ color: "var(--vh-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--vh-ink)"; (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--vh-muted)"; (e.currentTarget as HTMLElement).style.background = "transparent" }}
            >
              Change password
            </GuardLink>
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

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <header
            className="md:hidden flex items-center gap-3 px-4 h-14 bg-vh-surface flex-shrink-0"
            style={{ borderBottom: "1px solid var(--vh-line)" }}
          >
            <button
              onClick={() => setNavOpen(true)}
              className="p-2 -ml-2 rounded-[8px]"
              style={{ color: "var(--vh-ink-soft)" }}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <BrandMark size={22} />
          </header>
          <main className="flex-1 overflow-auto overscroll-contain">{children}</main>
        </div>
      </div>
    </UnsavedChangesProvider>
  )
}
