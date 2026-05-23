"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { useDisplayTimeZone } from "@/components/TimezoneProvider"

interface Props {
  electionId: string
  purgedAt: string | null
}

export default function PurgeImagesButton({ electionId, purgedAt: initialPurgedAt }: Props) {
  const tz = useDisplayTimeZone()
  const [purgedAt, setPurgedAt] = useState(initialPurgedAt)
  const [purging, setPurging] = useState(false)
  const [error, setError] = useState("")

  async function handlePurge() {
    if (!confirm("This will permanently replace all uploaded images for this election with a transparent placeholder. This cannot be undone. Proceed?")) return
    setPurging(true)
    setError("")
    try {
      const res = await fetch(`/api/elections/${electionId}/purge-images`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setPurgedAt(data.purgedAt)
      } else {
        setError(data.error ?? "Failed to purge images")
      }
    } catch {
      setError("Failed to purge images")
    } finally {
      setPurging(false)
    }
  }

  return (
    <div
      className="mt-6 rounded-[16px] p-[22px] flex items-start gap-4"
      style={{ border: "1px solid var(--vh-line)" }}
    >
      <div className="flex-1">
        <h3 className="text-[14px] font-semibold mb-1">Uploaded images</h3>
        {purgedAt ? (
          <p className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
            Images purged on {new Date(purgedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: tz })}.
            Logo and avatar URLs are now serving a transparent placeholder (~70 bytes each).
          </p>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
            Replace all uploaded images for this election with a transparent placeholder.
            The URLs stay valid so old emails won&apos;t show broken-image icons, but the
            server transfers ~70 bytes instead of the full image on each load.
            This cannot be undone.
          </p>
        )}
        {error && <p className="text-[12px] mt-1.5" style={{ color: "var(--vh-danger, #e11d48)" }}>{error}</p>}
      </div>
      {!purgedAt && (
        <button
          type="button"
          onClick={handlePurge}
          disabled={purging}
          className="shrink-0 flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-[8px] transition-colors"
          style={{
            border: "1px solid var(--vh-line-strong)",
            background: "var(--vh-surface)",
            color: purging ? "var(--vh-muted)" : "var(--vh-danger, #e11d48)",
            cursor: purging ? "not-allowed" : "pointer",
          }}
        >
          <Trash2 size={13} />
          {purging ? "Purging…" : "Purge images"}
        </button>
      )}
    </div>
  )
}
