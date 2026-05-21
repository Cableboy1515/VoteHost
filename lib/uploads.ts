const ALLOWED: Array<{ ext: string; mime: string; magic: number[] }> = [
  { ext: "png",  mime: "image/png",  magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "jpg",  mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { ext: "jpeg", mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { ext: "webp", mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
]

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

export type ValidatedImage = { ext: string; mime: string }

/** Validate buffer magic bytes. Returns detected type or null if unrecognised. */
export function detectImageType(buf: Buffer): ValidatedImage | null {
  for (const { ext, mime, magic } of ALLOWED) {
    if (magic.every((b, i) => buf[i] === b)) {
      // Extra check for WebP: bytes 8-11 must be "WEBP"
      if (ext === "webp") {
        if (buf.slice(8, 12).toString("ascii") !== "WEBP") continue
      }
      return { ext, mime }
    }
  }
  return null
}

export const ALLOWED_UPLOAD_EXTENSIONS = new Set(ALLOWED.map((e) => e.ext))
