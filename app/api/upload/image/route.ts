import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"

const IMGLINK_UPLOAD = "https://imglink.io/api/v1/upload"

export async function POST(req: Request) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const form = await req.formData()
  const res = await fetch(IMGLINK_UPLOAD, { method: "POST", body: form })
  const json = await res.json()

  if (!res.ok) return NextResponse.json(json, { status: res.status })
  return NextResponse.json(json)
}
