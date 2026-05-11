"use client"

import { useRef, useState } from "react"
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

  const imagePreset = preset === "avatar" ? avatarPreset : logoPreset
  const isAvatar = preset === "avatar"

  async function handleFile(file: File) {
    setError("")
    setUploading(true)
    try {
      // If replacing, delete the old image first (best-effort)
      if (deleteUrl) {
        await deleteImage(deleteUrl).catch(() => undefined)
        setDeleteUrl("")
      }
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
    if (deleteUrl) {
      await deleteImage(deleteUrl).catch(() => undefined)
    }
    setUrl("")
    setDeleteUrl("")
    setError("")
  }

  const inputStyle = {
    border: "1px solid var(--vh-line-strong)",
    background: "var(--vh-surface)",
    color: "var(--vh-ink)",
    outline: "none",
  }

  return (
    <div className="flex flex-col gap-2">
      {/* URL input (manual paste or auto-populated after upload) */}
      <div className="flex gap-2">
        <input
          type="url"
          placeholder={isAvatar ? "https://example.com/photo.jpg" : "https://example.com/logo.png"}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={disabled || uploading}
          className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors min-w-0"
          style={inputStyle}
          onFocus={(e) => { e.target.style.borderColor = "var(--vh-accent)"; e.target.style.boxShadow = "var(--vh-ring)" }}
          onBlur={(e) => { e.target.style.borderColor = "var(--vh-line-strong)"; e.target.style.boxShadow = "none" }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          className="shrink-0 text-[13px] font-medium px-3 py-2 rounded-[10px] transition-colors whitespace-nowrap"
          style={{
            border: "1px solid var(--vh-line-strong)",
            background: "var(--vh-surface)",
            color: uploading ? "var(--vh-muted)" : "var(--vh-ink-soft)",
            cursor: disabled || uploading ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {/* Preview and host controls */}
      {url && (
        <div className="flex items-start gap-3 mt-0.5">
          <img
            src={url}
            alt=""
            className={isAvatar ? "rounded-full object-cover shrink-0" : "rounded-[8px] object-contain shrink-0"}
            style={{
              width: isAvatar ? 48 : 80,
              height: isAvatar ? 48 : "auto",
              maxHeight: isAvatar ? 48 : 52,
              border: "1px solid var(--vh-line)",
            }}
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            {deleteUrl && (
              <span className="text-[11.5px]" style={{ color: "var(--vh-muted)" }}>
                Hosted on ImgLink.{" "}
                <a
                  href={deleteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "var(--vh-muted)" }}
                >
                  View delete link
                </a>
              </span>
            )}
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="self-start text-[12px] underline"
              style={{ color: "var(--vh-danger, #e11d48)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              Remove image
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-[12px]" style={{ color: "var(--vh-danger, #e11d48)" }}>{error}</p>
      )}
    </div>
  )
}
