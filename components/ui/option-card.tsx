"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface Props {
  name: string
  subtitle?: string | null
  bio?: string | null
  photoUrl?: string | null
  website?: string | null
  showAvatar?: boolean
  avatarSize?: number
  type: "single" | "multi"
  checked: boolean
  disabled?: boolean
  onChange: () => void
  className?: string
}

function Initials({ name, size }: { name: string; size: number }) {
  const parts = name.trim().split(/\s+/)
  const letters = parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : name.slice(0, 2)

  return (
    <span
      className="inline-grid place-items-center flex-shrink-0 rounded-full bg-vh-surface-3 text-vh-ink-soft font-semibold border border-vh-line"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {letters.toUpperCase()}
    </span>
  )
}

export function OptionCard({
  name,
  subtitle,
  bio,
  photoUrl,
  website,
  showAvatar = true,
  avatarSize = 72,
  type,
  checked,
  disabled = false,
  onChange,
  className,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const hasBio = !!(bio || website)

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={checked}
      aria-disabled={disabled}
      onClick={() => !disabled && onChange()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          onChange()
        }
      }}
      className={cn("select-none transition-all duration-150 cursor-pointer", className)}
      style={{
        background: checked ? "var(--vh-accent-soft)" : "var(--vh-surface)",
        border: `1.5px solid ${checked ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
        borderRadius: 12,
        boxShadow: checked ? "0 6px 20px oklch(0.36 0.10 255 / 0.15)" : "none",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {/* Main row */}
      <div className="flex items-center gap-3.5 p-4">
        {showAvatar && (photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={name}
            className="flex-shrink-0 rounded-full object-cover border border-vh-line"
            style={{ width: avatarSize, height: avatarSize }}
          />
        ) : (
          <Initials name={name} size={avatarSize} />
        ))}

        <div className="flex-1 min-w-0">
          <p className="text-[15.5px] font-medium text-vh-ink break-words">{name}</p>
          {subtitle && (
            <p className="text-[13px] text-vh-muted truncate">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {hasBio && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[13px] font-medium px-2.5 py-2 sm:py-1 rounded-[8px] transition-colors"
              style={{
                background: "var(--vh-surface-3)",
                border: "1px solid var(--vh-line-strong)",
                color: "var(--vh-ink-soft)",
              }}
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)"
                ;(e.currentTarget as HTMLElement).style.color = "var(--vh-ink)"
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = "var(--vh-surface-3)"
                ;(e.currentTarget as HTMLElement).style.color = "var(--vh-ink-soft)"
              }}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Hide" : "Show"} details about ${name}`}
            >
              <span className="hidden sm:inline">{expanded ? "Hide details" : "Show details"}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
                style={{
                  transition: "transform 150ms",
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                }}
              >
                <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* Selection mark */}
          <span
            className="inline-grid place-items-center flex-shrink-0 transition-colors"
            style={{
              width: 22,
              height: 22,
              borderRadius: type === "multi" ? 6 : "50%",
              border: `2px solid ${checked ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
              background: checked ? "var(--vh-accent)" : "transparent",
            }}
          >
            {checked && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </div>
      </div>

      {/* Expandable bio panel */}
      {expanded && hasBio && (
        <div
          className="px-4 pb-4 border-t border-vh-line pt-3 space-y-1"
          onClick={(e) => e.stopPropagation()}
        >
          {bio && (
            <p className="text-sm text-vh-muted leading-relaxed">{bio}</p>
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-vh-accent hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
