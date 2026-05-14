import { cn } from "@/lib/utils"

interface Props {
  size?: number
  showWordmark?: boolean
  /** Set true when placing on a dark/coloured background — inverts glyph and wordmark */
  dark?: boolean
  className?: string
}

export function BrandMark({ size = 22, showWordmark = true, dark = false, className }: Props) {
  const wordmarkSize = Math.round(size * 0.68)
  const subtitleSize = Math.max(8, Math.round(size * 0.30))
  const glyphStroke = dark ? "var(--vh-accent)" : "white"

  return (
    <span
      className={cn("inline-flex items-center gap-2 font-semibold", dark ? "text-white" : "text-vh-ink", className)}
      style={{ letterSpacing: "-0.015em" }}
    >
      <span
        className={cn("inline-grid place-items-center flex-shrink-0", dark ? "bg-white" : "bg-vh-accent")}
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.23) }}
      >
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6.5 12.5 L10.8 16.8 L18.5 7.2"
            stroke={glyphStroke}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showWordmark && (
        <span className="inline-flex flex-col leading-none">
          <span style={{ fontSize: wordmarkSize }}>VoteHost</span>
          <span
            className="font-medium uppercase opacity-80"
            style={{ fontSize: subtitleSize, letterSpacing: "0.12em", marginTop: 2 }}
          >
            Elections
          </span>
        </span>
      )}
    </span>
  )
}
