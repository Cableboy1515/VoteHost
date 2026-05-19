import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isEmailConfigured } from "@/lib/email"
import { db } from "@/lib/db"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [emailConfigured, wizardRow] = await Promise.all([
    isEmailConfigured(),
    db.setting.findUnique({ where: { key: "email_wizard_seen" } }),
  ])

  return NextResponse.json({
    emailConfigured,
    wizardSeen: wizardRow?.value === "true",
    role: session.role,
    email: session.email,
  })
}
