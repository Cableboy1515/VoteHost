"use client"

import { usePathname } from "next/navigation"
import { GuardLink } from "@/components/admin/UnsavedChangesGuard"

const TABS = [
  { label: "Settings", path: "" },
  { label: "Ballot", path: "/ballot" },
  { label: "Voters", path: "/voters" },
  { label: "Results", path: "/results" },
] as const

export default function ElectionTabs({ electionId }: { electionId: string }) {
  const pathname = usePathname()
  const base = `/admin/elections/${electionId}`

  return (
    <div className="flex gap-1.5 mb-5 flex-wrap">
      {TABS.map((t) => {
        const href = base + t.path
        const active = t.path === "" ? pathname === base : pathname.startsWith(href)
        return (
          <GuardLink
            key={t.path}
            href={href}
            aria-current={active ? "page" : undefined}
            className="px-4 py-2 rounded-[10px] text-[13px] font-medium transition-colors"
            style={
              active
                ? { background: "var(--vh-accent)", color: "white", border: "1px solid var(--vh-accent)" }
                : { background: "var(--vh-surface)", color: "var(--vh-ink-soft)", border: "1px solid var(--vh-line-strong)" }
            }
          >
            {t.label}
          </GuardLink>
        )
      })}
    </div>
  )
}
