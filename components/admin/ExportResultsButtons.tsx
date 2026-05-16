"use client"

const btnClass = "flex items-center justify-center gap-1.5 h-auto px-3.5 py-2 text-[13px] rounded-[10px] transition-colors border w-full"
const btnStyle = {
  color: "var(--vh-ink-soft)",
  background: "var(--vh-surface)",
  borderColor: "var(--vh-line-strong)",
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className={btnClass}
      style={btnStyle}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = "var(--vh-surface-2)"
        el.style.color = "var(--vh-ink)"
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = btnStyle.background
        el.style.color = btnStyle.color
      }}
    >
      {label}
    </a>
  )
}

export default function ExportResultsButtons({ electionId }: { electionId: string }) {
  const base = `/api/elections/${electionId}/results/export`
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <p className="text-[11px] font-medium uppercase tracking-wider text-right" style={{ color: "var(--vh-muted)" }}>
        Export
      </p>
      <ExportLink href={`${base}/xlsx`} label="Excel (.xlsx)" />
      <ExportLink href={`${base}/pdf`} label="PDF certificate" />
      <ExportLink href={`${base}/csv`} label="CSV" />
    </div>
  )
}
