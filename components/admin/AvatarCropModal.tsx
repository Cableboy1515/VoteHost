"use client"

import { useCallback, useEffect, useState } from "react"
import Cropper from "react-easy-crop"
import type { Area } from "react-easy-crop"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cropToSquare } from "@/lib/clientImage"

interface Props {
  file: File | null
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

export default function AvatarCropModal({ file, onConfirm, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [working, setWorking] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!file) { setObjectUrl(undefined); return }
    const url = URL.createObjectURL(file)
    setObjectUrl(url)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  async function handleConfirm() {
    if (!file || !croppedAreaPixels) return
    setWorking(true)
    try {
      const blob = await cropToSquare(file, croppedAreaPixels)
      onConfirm(blob)
    } finally {
      setWorking(false)
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open && !working) onCancel()
  }

  return (
    <Dialog open={!!file} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Crop photo</DialogTitle>
        </DialogHeader>

        {/* Cropper viewport */}
        <div className="relative w-full overflow-hidden rounded-[10px]" style={{ height: 320, background: "var(--vh-surface-3)" }}>
          {objectUrl && (
            <Cropper
              image={objectUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-1">
          <span className="text-[12px]" style={{ color: "var(--vh-muted)" }}>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={working}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={working}>
            {working ? "Saving…" : "Use this crop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
