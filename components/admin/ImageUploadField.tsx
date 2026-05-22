"use client"

import { useRef, useState } from "react"
import { Pencil, Trash2, ImagePlus } from "lucide-react"
import { avatarPreset, logoPreset, resizeForUpload } from "@/lib/clientImage"
import { uploadImage, deleteImage } from "@/lib/imageHost"

interface Props {
  preset: "avatar" | "logo"
  url: string
  setUrl: (url: string) => void
  deleteUrl: string
  setDeleteUrl: (deleteUrl: string) => void
  disabled?: boolean
}

export default function ImageUploadField({ preset, url, setUrl, deleteUrl, setDeleteUrl, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [dragging, setDragging] = useState(false)

  const isAvatar = preset === "avatar"
  const imagePreset = isAvatar ? avatarPreset : logoPreset

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { setError("Please select an image file"); return }
    setError("")
    setUploading(true)
    try {
      if (deleteUrl) { await deleteImage(deleteUrl).catch(() => undefined); setDeleteUrl("") }
      const blob = await resizeForUpload(file, imagePreset)
      const result = await uploadImage(blob, file.name.replace(/\.[^.]+$/, ".jpg"))
      setUrl(result.url)
      setDeleteUrl(result.deleteUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function handleRemove() {
    if (deleteUrl) await deleteImage(deleteUrl).catch(() => undefined)
    setUrl(""); setDeleteUrl(""); setError("")
  }

  function pick() { if (!disabled && !uploading) fileRef.current?.click() }

  const hiddenInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
    />
  )

  // ── Avatar (48px circle) ───────────────────────────────────────────
  if (isAvatar) {
    return (
      <div className="flex flex-col gap-1.5">
        {url ? (
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0" style={{ width: 48, height: 48 }}>
              <img
                src={url}
                alt=""
                className="w-full h-full rounded-full object-cover"
                style={{
                  border: "1px solid var(--vh-line)",
                  opacity: uploading ? 0.45 : 1,
                  transition: "opacity 0.15s",
                }}
              />
              {uploading && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center">
                  <div
                    className="animate-spin rounded-full"
                    style={{ width: 16, height: 16, border: "2px solid var(--vh-muted)", borderTopColor: "var(--vh-accent)" }}
                  />
                </div>
              )}
            </div>
            {!disabled && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={pick}
                  disabled={uploading}
                  className="text-[13px] font-medium px-3 py-1.5 rounded-[8px] transition-colors"
                  style={{
                    border: "1px solid var(--vh-line-strong)",
                    background: "var(--vh-surface)",
                    color: uploading ? "var(--vh-muted)" : "var(--vh-ink-soft)",
                    cursor: uploading ? "not-allowed" : "pointer",
                  }}
                >
                  {uploading ? "Uploading…" : "Change"}
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={uploading}
                  className="text-[13px] font-medium px-3 py-1.5 rounded-[8px] transition-colors"
                  style={{
                    border: "1px solid var(--vh-line-strong)",
                    background: "var(--vh-surface)",
                    color: "var(--vh-danger, #e11d48)",
                    cursor: uploading ? "not-allowed" : "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative" style={{ width: 48, height: 48 }}>
            <button
              type="button"
              onClick={pick}
              disabled={disabled || uploading}
              title={uploading ? "Uploading…" : "Upload photo"}
              className="w-full h-full rounded-full flex items-center justify-center transition-colors"
              style={{
                border: "1.5px dashed var(--vh-line-strong)",
                background: "var(--vh-surface)",
                color: "var(--vh-muted)",
                cursor: disabled || uploading ? "not-allowed" : "pointer",
              }}
            >
              {uploading
                ? <div className="animate-spin rounded-full" style={{ width: 14, height: 14, border: "1.5px solid var(--vh-muted)", borderTopColor: "var(--vh-accent)" }} />
                : <Pencil size={13} />
              }
            </button>
          </div>
        )}
        {error && <p className="text-[11.5px]" style={{ color: "var(--vh-danger, #e11d48)" }}>{error}</p>}
        {hiddenInput}
      </div>
    )
  }

  // ── Logo (drop zone) ───────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      {url ? (
        <>
          <div className="rounded-[10px] overflow-hidden" style={{ border: "1px solid var(--vh-line)", background: "var(--vh-surface)" }}>
            <img src={url} alt="" className="w-full block object-contain" style={{ maxHeight: 140 }} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={pick}
              disabled={disabled || uploading}
              className="text-[13px] font-medium px-3 py-1.5 rounded-[8px] transition-colors"
              style={{
                border: "1px solid var(--vh-line-strong)",
                background: "var(--vh-surface)",
                color: uploading ? "var(--vh-muted)" : "var(--vh-ink-soft)",
                cursor: disabled || uploading ? "not-allowed" : "pointer",
              }}
            >
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || uploading}
              className="text-[13px] font-medium px-3 py-1.5 rounded-[8px] transition-colors"
              style={{
                border: "1px solid var(--vh-line-strong)",
                background: "var(--vh-surface)",
                color: "var(--vh-danger, #e11d48)",
                cursor: disabled || uploading ? "not-allowed" : "pointer",
              }}
            >
              Remove
            </button>
          </div>
        </>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={pick}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") pick() }}
          onDragOver={(e) => { e.preventDefault(); if (!disabled && !uploading) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files[0]
            if (f && !disabled && !uploading) handleFile(f)
          }}
          className="w-full flex flex-col items-center justify-center gap-2 rounded-[10px] select-none transition-colors"
          style={{
            height: 120,
            border: `1.5px dashed ${dragging ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
            background: dragging ? "var(--vh-accent-soft, color-mix(in oklch, var(--vh-accent) 8%, transparent))" : "var(--vh-surface)",
            cursor: disabled || uploading ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full" style={{ width: 20, height: 20, border: "2px solid var(--vh-line-strong)", borderTopColor: "var(--vh-accent)" }} />
              <span className="text-[13px]" style={{ color: "var(--vh-muted)" }}>Uploading…</span>
            </>
          ) : (
            <>
              <ImagePlus size={20} style={{ color: dragging ? "var(--vh-accent)" : "var(--vh-ink-soft)" }} />
              <span className="text-[13px]" style={{ color: dragging ? "var(--vh-accent)" : "var(--vh-ink-soft)" }}>
                {dragging ? "Drop to upload" : "Drop image or click to browse"}
              </span>
              <span className="text-[11.5px]" style={{ color: "var(--vh-muted)" }}>{isAvatar ? "PNG or JPG · square crop recommended" : "PNG or JPG · ~1120×373 banner (3:1) recommended · taller images auto-scaled"}</span>
            </>
          )}
        </div>
      )}
      {error && <p className="text-[12px]" style={{ color: "var(--vh-danger, #e11d48)" }}>{error}</p>}
      {hiddenInput}
    </div>
  )
}
