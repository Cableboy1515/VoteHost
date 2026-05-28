export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { Webhook } from "svix"
import { db } from "@/lib/db"

type ResendEvent = {
  type: string
  created_at: string
  data: {
    email_id?: string
    to?: string[]
    tags?: Record<string, string>
  }
}

async function findVoter(event: ResendEvent) {
  const tags = event.data.tags ?? {}
  const recipient = event.data.to?.[0]

  // Prefer precise match by voterId tag
  if (tags.voterId) {
    const voter = await db.voter.findUnique({ where: { id: tags.voterId } })
    if (voter) return voter
  }

  // Fall back to (electionId tag, recipient email)
  if (tags.electionId && recipient) {
    const voter = await db.voter.findFirst({
      where: { electionId: tags.electionId, email: recipient },
    })
    if (voter) return voter
  }

  // Last resort — match by email alone; skip if ambiguous
  if (recipient) {
    const matches = await db.voter.findMany({ where: { email: recipient }, take: 2 })
    if (matches.length === 1) return matches[0]
  }

  return null
}

export async function POST(req: Request) {
  const secret = await db.setting
    .findUnique({ where: { key: "resend_webhook_secret" } })
    .then((r) => r?.value ?? null)

  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })
  }

  const rawBody = await req.text()
  const svixId = req.headers.get("svix-id") ?? ""
  const svixTimestamp = req.headers.get("svix-timestamp") ?? ""
  const svixSignature = req.headers.get("svix-signature") ?? ""

  let event: ResendEvent
  try {
    const wh = new Webhook(secret)
    event = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ResendEvent
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const { type } = event

  if (
    type !== "email.bounced" &&
    type !== "email.complained" &&
    type !== "email.delivery_delayed" &&
    type !== "email.delivered" &&
    type !== "email.sent"
  ) {
    return NextResponse.json({ ok: true })
  }

  const voter = await findVoter(event)
  if (!voter) return NextResponse.json({ ok: true })

  const eventTime = new Date(event.created_at)
  const now = new Date()

  if (type === "email.delivered" || type === "email.sent") {
    // Only clear error if this event is more recent than our last recorded attempt
    if (!voter.lastSendAttemptAt || eventTime >= voter.lastSendAttemptAt) {
      await db.voter.update({
        where: { id: voter.id },
        data: {
          lastSendStatus: "ok",
          lastSendErrorCode: null,
          lastSendErrorMessage: null,
          lastSendAttemptAt: now,
          lastSendProvider: "webhook",
        },
      })
    }
    return NextResponse.json({ ok: true })
  }

  let status: string
  let errorCode: string | null = null
  let errorMessage: string | null = null

  if (type === "email.bounced") {
    status = "bounced"
    errorCode = "bounce"
    errorMessage = "Email bounced (permanent delivery failure)"
  } else if (type === "email.complained") {
    status = "complained"
    errorCode = "complaint"
    errorMessage = "Email marked as spam by recipient"
  } else {
    // email.delivery_delayed
    status = "transient"
    errorCode = "delayed"
    errorMessage = "Email delivery delayed"
  }

  // Always apply bounce/complaint even if it overwrites a later "ok" — bounces are authoritative
  await db.voter.update({
    where: { id: voter.id },
    data: {
      lastSendStatus: status,
      lastSendErrorCode: errorCode,
      lastSendErrorMessage: errorMessage,
      lastSendAttemptAt: eventTime > now ? now : eventTime,
      lastSendProvider: "webhook",
    },
  })

  return NextResponse.json({ ok: true })
}
