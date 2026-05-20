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
  "block w-full px-3 py-2 text-left cursor-pointer focus:outline-none data-[highlighted]:bg-[var(--vh-surface-2)] data-[highlighted]:text-[var(--vh-ink)]"

export default function ExportResultsButtons({ electionId }: { electionId: string }) {
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
            className="min-w-[180px] rounded-[10px] py-1 text-[13px] shadow-md"
            style={{
              background: "var(--vh-surface)",
              border: "1px solid var(--vh-line-strong)",
              color: "var(--vh-ink-soft)",
            }}
          >
            <Menu.LinkItem href={`${base}/xlsx`} download closeOnClick className={itemClass}>
              Excel (.xlsx)
            </Menu.LinkItem>
            <Menu.LinkItem href={`${base}/pdf`} download closeOnClick className={itemClass}>
              PDF certificate
            </Menu.LinkItem>
            <Menu.LinkItem href={`${base}/csv`} download closeOnClick className={itemClass}>
              CSV
            </Menu.LinkItem>
            <Menu.LinkItem href={`${base}/audit`} download closeOnClick className={itemClass}>
              Audit export (JSON)
            </Menu.LinkItem>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
