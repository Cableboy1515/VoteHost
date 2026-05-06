"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

const BARE_PATHS = ["/admin/login", "/admin/setup", "/admin/change-password"]

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

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-zinc-900 text-zinc-100 flex flex-col">
        <div className="p-4 border-b border-zinc-700">
          <span className="font-bold text-lg">VoteHost</span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          <Link href="/admin/dashboard" className="block px-3 py-2 rounded hover:bg-zinc-700 text-sm">
            Dashboard
          </Link>
          <Link href="/admin/elections/new" className="block px-3 py-2 rounded hover:bg-zinc-700 text-sm">
            New Election
          </Link>
          <Link href="/admin/archive" className="block px-3 py-2 rounded hover:bg-zinc-700 text-sm">
            Archive
          </Link>
          {role === "ADMIN" && (
            <>
              <Link href="/admin/users" className="block px-3 py-2 rounded hover:bg-zinc-700 text-sm">
                Users
              </Link>
              <Link href="/admin/settings" className="block px-3 py-2 rounded hover:bg-zinc-700 text-sm">
                Settings
              </Link>
            </>
          )}
        </nav>
        <div className="p-4 border-t border-zinc-700">
          <button onClick={handleSignOut} className="text-sm text-zinc-400 hover:text-zinc-100">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 bg-zinc-50 overflow-auto">{children}</main>
    </div>
  )
}
