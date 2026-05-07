import { cn } from "@/lib/utils"

interface Props {
  size?: number
  showWordmark?: boolean
  className?: string
}

export function BrandMark({ size = 22, showWordmark = true, className }: Props) {
  const glyphSize = Math.round(size * 0.636)
  const fontSize = Math.round(size * 0.682)

  return (
    <span
      className={cn("inline-flex items-center gap-2 font-semibold text-vh-ink", className)}
      style={{ letterSpacing: "-0.015em" }}
    >
      <span
        className="inline-grid place-items-center flex-shrink-0 bg-vh-accent text-white"
        style={{ width: size, height: size, borderRadius: 5 }}
      >
        <svg width={glyphSize} height={glyphSize} viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M2.5 7L5.5 10L11.5 4"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showWordmark && (
        <span style={{ fontSize }}>VoteHost</span>
      )}
    </span>
  )
}
