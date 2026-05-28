"use client"

import { useRef, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import Saturation from "@uiw/react-color-saturation"
import Hue from "@uiw/react-color-hue"
import { hexToHsva, hsvaToHex } from "@uiw/color-convert"
import type { HsvaColor } from "@uiw/color-convert"
import { Button } from "@/components/ui/button"
import { HERO_COLORS, getHeroColor, isCustomHex } from "@/lib/heroColors"

function initHsva(color: string | null): HsvaColor {
  if (isCustomHex(color)) return hexToHsva(color)
  return hexToHsva("#3F66D9")
}

function toDisplayHex(hsva: HsvaColor): string {
  return hsvaToHex(hsva).toUpperCase()
}

export function HeroColorPicker({
  electionId,
  currentColor,
}: {
  electionId: string
  currentColor: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<"presets" | "wheel">("presets")
  const [cardEl, setCardEl] = useState<Element | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hsva, setHsva] = useState<HsvaColor>(() => initHsva(currentColor))
  const [hexInput, setHexInput] = useState<string>(() => toDisplayHex(initHsva(currentColor)))
  const triggerRef = useRef<HTMLButtonElement>(null)
  const latestHsvaRef = useRef<HsvaColor>(hsva)
  const originalHsvaRef = useRef<HsvaColor>(hsva)

  useEffect(() => {
    if (!open) {
      const next = initHsva(currentColor)
      setHsva(next)
      latestHsvaRef.current = next
      setHexInput(toDisplayHex(next))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentColor])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function close() {
    setOpen(false)
    setView("presets")
  }

  function cancelWheel() {
    const orig = originalHsvaRef.current
    setHsva(orig)
    latestHsvaRef.current = orig
    setHexInput(toDisplayHex(orig))
    setView("presets")
  }

  async function pickColor(key: string, closeAfter = true) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/elections/${electionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heroColor: key }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        console.error("[HeroColorPicker] PATCH failed", res.status, body)
        const err = new Error(`Failed to save (${res.status})`) as Error & { status: number }
        err.status = res.status
        throw err
      }
      if (closeAfter) close()
      router.refresh()
    } catch (e) {
      const status = (e as { status?: number }).status
      console.error("[HeroColorPicker] save failed", e)
      setError(status ? `Couldn't save (HTTP ${status}) — try again` : "Couldn't save — try again")
    } finally {
      setPending(false)
    }
  }

  const selectedKey = getHeroColor(currentColor).key
  const customIsActive = isCustomHex(currentColor)
  const liveHex = toDisplayHex(hsva)

  const applyDisabled = pending || liveHex.toLowerCase() === (currentColor ?? "").toLowerCase()

  const overlayContent = (
    <div
      onClick={close}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-[14px] p-4"
        style={{
          background: "var(--vh-surface)",
          border: "1px solid var(--vh-line-strong)",
          boxShadow: "var(--vh-shadow-lg)",
          color: "var(--vh-ink)",
        }}
      >
        {view === "presets" ? (
          <div className="flex gap-2 flex-wrap items-center">
            {HERO_COLORS.map((color) => {
              const isSelected = color.key === selectedKey && !customIsActive
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
                    outline: isSelected ? "2px solid var(--vh-accent)" : "none",
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

            {/* Custom color swatch */}
            <button
              type="button"
              aria-label="Custom color"
              disabled={pending}
              onClick={() => {
                originalHsvaRef.current = latestHsvaRef.current
                setView("wheel")
              }}
              className="relative flex-shrink-0 rounded-full transition-transform hover:scale-110 overflow-hidden"
              style={{
                width: 24,
                height: 24,
                background: customIsActive
                  ? (currentColor as string)
                  : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                outline: customIsActive ? "2px solid var(--vh-accent)" : "none",
                outlineOffset: 2,
                opacity: pending ? 0.6 : 1,
              }}
            >
              {customIsActive && (
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
          </div>
        ) : (
          <div style={{ width: 180 }}>
            {/* Back link */}
            <button
              type="button"
              onClick={cancelWheel}
              className="text-[12px] mb-3 flex items-center gap-1 transition-colors"
              style={{ color: "var(--vh-muted)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--vh-ink)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--vh-muted)" }}
            >
              ← Back
            </button>

            {/* Saturation picker */}
            <div
              style={{ opacity: pending ? 0.6 : 1, pointerEvents: pending ? "none" : "auto" }}
            >
              <Saturation
                hsva={hsva}
                style={{ width: "100%", height: 100, borderRadius: 6 }}
                onChange={(newColor) => {
                  latestHsvaRef.current = newColor
                  setHsva(newColor)
                  setHexInput(toDisplayHex(newColor))
                }}
              />
            </div>

            {/* Hue strip */}
            <div
              style={{
                marginTop: 10,
                opacity: pending ? 0.6 : 1,
                pointerEvents: pending ? "none" : "auto",
              }}
            >
              <Hue
                hue={hsva.h}
                width="100%"
                height={12}
                radius={6}
                onChange={(newHue) => {
                  const next = { ...hsva, h: newHue.h }
                  latestHsvaRef.current = next
                  setHsva(next)
                  setHexInput(toDisplayHex(next))
                }}
              />
            </div>

            {/* Hex input row with preview circle */}
            <div className="flex items-center gap-2 mt-3 mb-3">
              <div
                className="rounded-full flex-shrink-0"
                style={{
                  width: 36,
                  height: 36,
                  background: liveHex,
                  border: "2px solid var(--vh-line-strong)",
                }}
              />
              <label className="flex items-center gap-1.5 flex-1 min-w-0">
                <span style={{ fontSize: 11, color: "var(--vh-muted)", flexShrink: 0, userSelect: "none" }}>
                  Hex
                </span>
                <input
                  type="text"
                  spellCheck={false}
                  value={hexInput}
                  disabled={pending}
                  onChange={(e) => {
                    const raw = e.target.value
                    setHexInput(raw)
                    const normalized = raw.replace(/^#/, "")
                    if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
                      const next = hexToHsva(`#${normalized}`)
                      latestHsvaRef.current = next
                      setHsva(next)
                    }
                  }}
                  onBlur={() => {
                    const normalized = hexInput.replace(/^#/, "")
                    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
                      setHexInput(toDisplayHex(latestHsvaRef.current))
                    }
                  }}
                  style={{
                    background: "var(--vh-surface-3)",
                    border: "1px solid var(--vh-line)",
                    borderRadius: "var(--vh-radius-sm)",
                    color: "var(--vh-ink)",
                    fontSize: 12,
                    padding: "3px 8px",
                    width: "100%",
                    outline: "none",
                    fontFamily: "monospace",
                    opacity: pending ? 0.6 : 1,
                  }}
                />
              </label>
            </div>

            {/* Apply / Cancel */}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={cancelWheel} disabled={pending}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => pickColor(toDisplayHex(latestHsvaRef.current), true)}
                disabled={applyDisabled}
              >
                Apply
              </Button>
            </div>

            {error && (
              <p role="alert" className="text-[11px] mt-2" style={{ color: "var(--vh-danger)" }}>
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            close()
          } else {
            const card = triggerRef.current?.closest("[data-hero-color-overlay-target]") ?? null
            setCardEl(card)
            setOpen(true)
          }
        }}
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

      {open && cardEl && createPortal(overlayContent, cardEl)}
    </>
  )
}
