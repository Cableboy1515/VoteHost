export interface UploadResult {
  url: string
  deleteUrl: string
}

// Images are uploaded to the server and served from /uploads/.
// To switch to an external host, update the API route at app/api/upload/image/route.ts.
export async function uploadImage(blob: Blob, filename: string): Promise<UploadResult> {
  const form = new FormData()
  form.append("file", blob, filename)

  const res = await fetch("/api/upload/image", { method: "POST", body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `Upload failed: ${res.status}`)
  }

  const json = await res.json()
  if (!json.url) throw new Error("Upload response missing url")
  return { url: json.url, deleteUrl: json.deleteUrl ?? "" }
}

// deleteUrl is a GET endpoint (/api/upload/image/[filename]) that deletes the file.
// Called automatically on image replace or election/option delete.
export async function deleteImage(deleteUrl: string): Promise<void> {
  if (!deleteUrl) return
  await fetch(deleteUrl, { method: "GET" }).catch(() => undefined)
}
