"use client"

import { Menu } from "@base-ui/react/menu"
import { ChevronDownIcon } from "lucide-react"

const triggerClass =
  "flex items-center justify-center gap-1.5 h-auto px-3.5 py-2 text-[13px] rounded-[10px] transition-colors border w-full cursor-pointer"
const triggerStyle = {
  color: "var(--vh-ink-soft)",
  background: "var(--vh-surface)",
  borderColor: "var(--vh-line-strong)",
}
const triggerHoverStyle = {
  background: "var(--vh-surface-2)",
  color: "var(--vh-ink)",
}

const itemClass =
  "block w-full px-3 py-2 text-left cursor-pointer focus:outline-none data-[highlighted]:bg-[var(--vh-surface-2)]"

export default function ExportResultsButtons({
  electionId,
  hasRankedQuestion,
}: {
  electionId: string
  hasRankedQuestion?: boolean
}) {
  const base = `/api/elections/${electionId}/results/export`
  return (
    <Menu.Root>
      <Menu.Trigger
        className={triggerClass}
        style={triggerStyle}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.background = triggerHoverStyle.background
          el.style.color = triggerHoverStyle.color
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.background = triggerStyle.background
          el.style.color = triggerStyle.color
        }}
      >
        Export
        <ChevronDownIcon className="size-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="isolate z-50">
          <Menu.Popup
            className="min-w-[210px] rounded-[10px] py-1 text-[13px] shadow-md"
            style={{
              background: "var(--vh-surface)",
              border: "1px solid var(--vh-line-strong)",
              color: "var(--vh-ink-soft)",
            }}
          >
            {/* ── Reports ────────────────────────────────────── */}
            <Menu.Group>
              <Menu.GroupLabel
                className="px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--vh-muted)" }}
              >
                Reports
              </Menu.GroupLabel>

              <Menu.LinkItem href={`${base}/xlsx`} download closeOnClick className={itemClass}>
                <span className="block text-[13px]" style={{ color: "var(--vh-ink)" }}>Excel (.xlsx)</span>
                <span className="block text-[11.5px]" style={{ color: "var(--vh-muted)" }}>Full results workbook</span>
              </Menu.LinkItem>

              <Menu.LinkItem href={`${base}/pdf`} download closeOnClick className={itemClass}>
                <span className="block text-[13px]" style={{ color: "var(--vh-ink)" }}>PDF certificate</span>
                <span className="block text-[11.5px]" style={{ color: "var(--vh-muted)" }}>Signed results summary</span>
              </Menu.LinkItem>

              <Menu.LinkItem href={`${base}/csv`} download closeOnClick className={itemClass}>
                <span className="block text-[13px]" style={{ color: "var(--vh-ink)" }}>Results summary (CSV)</span>
                <span className="block text-[11.5px]" style={{ color: "var(--vh-muted)" }}>Vote totals per option</span>
              </Menu.LinkItem>
            </Menu.Group>

            {/* ── Divider ────────────────────────────────────── */}
            <div className="my-1 h-px mx-0" style={{ background: "var(--vh-line)" }} />

            {/* ── Audit tools ────────────────────────────────── */}
            <Menu.Group>
              <Menu.GroupLabel
                className="px-3 pt-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--vh-muted)" }}
              >
                Audit tools
              </Menu.GroupLabel>

              {hasRankedQuestion && (
                <Menu.LinkItem href={`${base}/cvr`} download closeOnClick className={itemClass}>
                  <span className="block text-[13px]" style={{ color: "var(--vh-ink)" }}>Cast Vote Record (CSV)</span>
                  <span className="block text-[11.5px]" style={{ color: "var(--vh-muted)" }}>One row per ballot · for RCV re-tally</span>
                </Menu.LinkItem>
              )}
              {hasRankedQuestion && (
                <Menu.LinkItem href={`${base}/blt`} download closeOnClick className={itemClass}>
                  <span className="block text-[13px]" style={{ color: "var(--vh-ink)" }}>Ballot data (BLT)</span>
                  <span className="block text-[11.5px]" style={{ color: "var(--vh-muted)" }}>Re-tally in OpaVote / OpenSTV</span>
                </Menu.LinkItem>
              )}

              <Menu.LinkItem href={`${base}/audit`} download closeOnClick className={itemClass}>
                <span className="block text-[13px]" style={{ color: "var(--vh-ink)" }}>Audit export (JSON)</span>
                <span className="block text-[11.5px]" style={{ color: "var(--vh-muted)" }}>Raw votes + tally hash</span>
              </Menu.LinkItem>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
