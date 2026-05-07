"use client"

import { cn } from "@/lib/utils"

interface Props {
  title: string
  caption?: string
  showLive?: boolean
  className?: string
  children?: React.ReactNode
}

export function HeroTile({ title, caption, showLive = false, className, children }: Props) {
  return (
    <div
      className={cn("relative overflow-hidden text-white", className)}
      style={{
        background: "linear-gradient(135deg, var(--vh-accent) 0%, var(--vh-accent-strong) 100%)",
        borderRadius: "var(--radius-hero)",
        padding: "28px",
      }}
    >
      {/* Decorative ring */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: -60,
          right: -60,
          width: 240,
          height: 240,
          borderRadius: "999px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
        aria-hidden
      />

      {showLive && (
        <div className="mb-3 flex items-center gap-2">
          <span
            className="inline-block rounded-full"
            style={{
              width: 7,
              height: 7,
              background: "white",
              animation: "vhPulse 1.6s ease-in-out infinite",
            }}
          />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ opacity: 0.85 }}>
            {caption ?? "Election in progress"}
          </span>
        </div>
      )}

      {!showLive && caption && (
        <p className="mb-2 text-sm" style={{ opacity: 0.85 }}>
          {caption}
        </p>
      )}

      <h2 className="text-xl font-semibold leading-snug" style={{ letterSpacing: "-0.02em" }}>
        {title}
      </h2>

      {children && <div className="mt-5">{children}</div>}

      <style>{`
        @keyframes vhPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
