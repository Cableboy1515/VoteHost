"use client"

import { useRef, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { HERO_COLORS, getHeroColor } from "@/lib/heroColors"

export function HeroColorPicker({
  electionId,
  currentColor,
}: {
  electionId: string
  currentColor: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  async function pickColor(key: string) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/elections/${electionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heroColor: key }),
      })
      if (!res.ok) throw new Error("Failed to save")
      setOpen(false)
      router.refresh()
    } catch {
      setError("Couldn't save — try again")
    } finally {
      setPending(false)
    }
  }

  const selectedKey = getHeroColor(currentColor).key

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-[10px] text-[13px] transition-colors"
        style={{
          background: "rgba(255,255,255,0.12)",
          color: "white",
          border: "1px solid rgba(255,255,255,0.25)",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.20)" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)" }}
      >
        Change color
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 right-0 rounded-[12px] p-3 z-10"
          style={{
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(8px)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            minWidth: 200,
          }}
        >
          <div className="flex gap-2 flex-wrap">
            {HERO_COLORS.map((color) => {
              const isSelected = color.key === selectedKey
              return (
                <button
                  key={color.key}
                  type="button"
                  aria-label={color.label}
                  disabled={pending}
                  onClick={() => pickColor(color.key)}
                  className="relative flex-shrink-0 rounded-full transition-transform hover:scale-110"
                  style={{
                    width: 24,
                    height: 24,
                    background: color.base,
                    outline: isSelected ? "2px solid white" : "none",
                    outlineOffset: 2,
                    opacity: pending ? 0.6 : 1,
                  }}
                >
                  {isSelected && (
                    <svg
                      viewBox="0 0 10 10"
                      className="absolute inset-0 w-full h-full p-[5px]"
                      aria-hidden
                    >
                      <polyline
                        points="1.5,5 4,7.5 8.5,2.5"
                        fill="none"
                        stroke="white"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
          {error && (
            <p role="alert" className="text-[11px] mt-2" style={{ color: "#fca5a5" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
