import Link from "next/link"
import { BrandMark } from "@/components/ui/brand-mark"
import { cn } from "@/lib/utils"

interface Props {
  icon: string
  iconBg?: string
  title: string
  body: string
  primaryLabel?: string
  primaryHref?: string
  secondary?: string
  className?: string
}

export function StateScreen({
  icon,
  iconBg = "bg-vh-surface-3",
  title,
  body,
  primaryLabel,
  primaryHref,
  secondary,
  className,
}: Props) {
  return (
    <div className={cn("min-h-screen bg-vh-bg flex flex-col", className)}>
      {/* Minimal header */}
      <header className="px-4 sm:px-6 py-5 border-b border-vh-line bg-vh-surface">
        <BrandMark size={22} />
      </header>

      {/* Centered content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16 text-center">
        <span
          className={cn("inline-grid place-items-center text-4xl mb-6", iconBg)}
          style={{ width: 72, height: 72, borderRadius: 18 }}
          aria-hidden
        >
          {icon}
        </span>

        <h1 className="text-2xl font-semibold text-vh-ink mb-3 max-w-sm">{title}</h1>
        <p className="text-[15px] text-vh-muted max-w-xs leading-relaxed">{body}</p>

        {primaryLabel && primaryHref && (
          <Link
            href={primaryHref}
            className="mt-8 inline-flex items-center justify-center font-medium text-white rounded-[var(--vh-radius-sm)] px-5 py-2.5 transition-colors"
            style={{ background: "var(--vh-accent)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--vh-accent)")}
          >
            {primaryLabel}
          </Link>
        )}

        {secondary && (
          <p className="mt-4 text-[13px] text-vh-muted">{secondary}</p>
        )}
      </div>
    </div>
  )
}
