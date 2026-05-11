// Set to true to route uploads through /api/upload/image (needed if ImgLink blocks CORS)
const USE_PROXY = false

const IMGLINK_UPLOAD = "https://imglink.io/api/v1/upload"

export interface UploadResult {
  url: string
  deleteUrl: string
}

export async function uploadImage(blob: Blob, filename: string): Promise<UploadResult> {
  const form = new FormData()
  form.append("file", blob, filename)

  const endpoint = USE_PROXY ? "/api/upload/image" : IMGLINK_UPLOAD
  const res = await fetch(endpoint, { method: "POST", body: form })

  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)

  const json = await res.json()

  // ImgLink returns { data: { url, delete_url } } on success
  const data = json?.data ?? json
  const url: string = data?.url ?? data?.link ?? data?.image?.url
  const deleteUrl: string = data?.delete_url ?? data?.deleteUrl ?? data?.delete

  if (!url) throw new Error("ImgLink response missing url")
  if (!deleteUrl) throw new Error("ImgLink response missing delete_url")

  return { url, deleteUrl }
}

export async function deleteImage(deleteUrl: string): Promise<void> {
  await fetch(deleteUrl, { method: "GET" }).catch(() => undefined)
}
