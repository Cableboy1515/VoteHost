export interface ImagePreset {
  maxWidth: number
  maxHeight: number
  quality: number
}

export const avatarPreset: ImagePreset = { maxWidth: 256, maxHeight: 256, quality: 0.82 }
export const logoPreset: ImagePreset = { maxWidth: 1120, maxHeight: 373, quality: 0.85 }

export async function cropToSquare(
  file: File,
  area: { x: number; y: number; width: number; height: number },
  outputSize = 256,
  quality = avatarPreset.quality
): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  const canvas = document.createElement("canvas")
  canvas.width = outputSize
  canvas.height = outputSize
  canvas.getContext("2d")!.drawImage(bitmap, area.x, area.y, area.width, area.height, 0, 0, outputSize, outputSize)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      quality
    )
  )
}

export async function resizeForUpload(file: File, preset: ImagePreset): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })

  const scaleW = preset.maxWidth / bitmap.width
  const scaleH = preset.maxHeight / bitmap.height
  const scale = Math.min(1, scaleW, scaleH)

  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      preset.quality
    )
  )
}
