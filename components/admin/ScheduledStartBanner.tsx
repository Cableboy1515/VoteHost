"use client"

import { useEffect, useState, useCallback } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { useDisplayTimeZone } from "@/components/TimezoneProvider"

type Warning = { reason: string; label: string; href: string }
type Election = { id: string; title: string; startsAt: string; warnings: Warning[] }

const POLL_MS = 20_000

function formatStartsAt(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: tz,
    })
  } catch {
    return iso
  }
}

export default function ScheduledStartBanner() {
  const pathname = usePathname()
  const contextTz = useDisplayTimeZone()
  const [elections, setElections] = useState<Election[]>([])
  const [apiTz, setApiTz] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduled-elections", { cache: "no-store" })
      if (!res.ok) return
      const json = await res.json()
      setElections(json.elections ?? [])
      setApiTz(json.tz ?? null)
    } catch {}
  }, [])

  useEffect(() => {
    fetchData()
  }, [pathname, fetchData])

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchData()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [fetchData])

  useEffect(() => {
    const onFocus = () => fetchData()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [fetchData])

  // Exclude the election currently being viewed (setup-flow rule)
  const editingMatch = pathname.match(/^\/elections\/([^/]+)(?:\/|$)/)
  const editingId = editingMatch ? editingMatch[1] : null
  const visible = editingId ? elections.filter((e) => e.id !== editingId) : elections
  if (visible.length === 0) return null

  const tz = contextTz || apiTz || "UTC"
  const heading =
    visible.length === 1
      ? "1 election scheduled to start"
      : `${visible.length} elections scheduled to start`

  return (
    <div
      className="flex items-start gap-3 px-[18px] py-3.5 mx-4 mt-4 rounded-[14px]"
      style={{ background: "var(--vh-accent-soft)", border: "1px solid oklch(0.85 0.05 255)" }}
    >
      <span className="flex-shrink-0 text-[16px] leading-[22px]">🗓</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-medium mb-1" style={{ color: "var(--vh-accent-strong)" }}>
          {heading}
        </p>
        <ul className="space-y-0.5">
          {visible.map((e) => (
            <li key={e.id} className="flex items-center gap-2 flex-wrap text-[13px]">
              <span style={{ color: "var(--vh-accent-strong)" }}>•</span>
              <Link
                href={`/elections/${e.id}`}
                className="font-bold underline decoration-1 underline-offset-2"
                style={{ color: "var(--vh-accent-strong)" }}
              >
                {e.title}
              </Link>
              <span style={{ color: "var(--vh-ink-soft)" }}>—</span>
              <span style={{ color: "var(--vh-ink-soft)" }}>{formatStartsAt(e.startsAt, tz)}</span>
              {e.warnings.map((w) => (
                <Link
                  key={w.reason}
                  href={w.href}
                  className="rounded-[6px] px-2 py-0.5 text-[11.5px] font-medium transition-opacity hover:opacity-75"
                  style={{
                    background: "var(--vh-warn-soft)",
                    color: "var(--vh-warn)",
                    border: "1px solid oklch(0.85 0.08 80)",
                  }}
                >
                  ⚠ {w.label}
                </Link>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
