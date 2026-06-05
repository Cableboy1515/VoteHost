export const runtime = "nodejs"

/**
 * Email load test seeder — creates an ACTIVE election with N uninvited voters
 * (default 1000, max 5000) so you can trigger the mass-invite loop without
 * sending real emails.
 *
 * Development-only (NODE_ENV !== production). Gated by Authorization: Bearer <CRON_SECRET>
 * GET    ?voters=N  — create the election and N voters, return election id
 * DELETE            — remove the seeded election
 *
 * No emails are sent here (invitedAt is never set).
 * To trigger the mass send: POST /api/elections/<id>/invite
 *
 * Pairing options (no real emails):
 *   • EMAIL_DRY_RUN=1                 — skip transport entirely (+ optional latency/fail knobs)
 *   • SMTP → localhost:1025 (Mailpit) — catch all messages in a local web inbox
 */

import { NextResponse } from "next/server"
import { db } from "@/lib/db"

const LOAD_TITLE = "[Mail Load] Email Load Test — Do Not Use"

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? ""
  // Require an explicit CRON_SECRET — never fall back to NEXTAUTH_SECRET (session-signing key).
  const secret = process.env.CRON_SECRET ?? ""
  return !!secret && auth === `Bearer ${secret}`
}

// ─── GET — seed the election ─────────────────────────────────────────────────

export async function GET(req: Request) {
  // Never available in production — this endpoint creates/destroys elections.
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized — pass Authorization: Bearer <CRON_SECRET>" }, { status: 401 })

  const url = new URL(req.url)
  const voterCount = Math.min(5000, Math.max(1, parseInt(url.searchParams.get("voters") ?? "1000", 10) || 1000))

  const now = new Date()

  // Clean up any leftover from a prior run
  await db.election.deleteMany({ where: { title: LOAD_TITLE } })

  // ── 1. Create an ACTIVE election open for 24 hours ─────────────────────────
  const election = await db.election.create({
    data: {
      title: LOAD_TITLE,
      description: "Email load test. Safe to archive and delete.",
      status: "ACTIVE",
      startsAt: new Date(now.getTime() - 60 * 60 * 1000),    // 1 hour ago
      endsAt: new Date(now.getTime() + 23 * 60 * 60 * 1000), // 23 hours from now
      activatedAt: new Date(now.getTime() - 60 * 60 * 1000),
      autoActivate: false,
      autoSendResults: false,
      emailSubject: "Test: Your ballot is ready",
      emailMessage: "This is a load-test email. No action is required.",
    },
  })

  // ── 2. Add a trivial question so the election ballot is valid ───────────────
  const question = await db.question.create({
    data: {
      electionId: election.id,
      text: "Load test question",
      type: "SINGLE_CHOICE",
      order: 0,
      required: true,
    },
  })
  await db.option.createMany({
    data: [
      { questionId: question.id, text: "Option A", order: 0 },
      { questionId: question.id, text: "Option B", order: 1 },
    ],
  })

  // ── 3. Seed N voters — no invitedAt, so no emails fire here ────────────────
  await db.voter.createMany({
    data: Array.from({ length: voterCount }, (_, i) => ({
      electionId: election.id,
      name: `Load Voter ${String(i + 1).padStart(4, "0")}`,
      email: `load.voter${String(i + 1).padStart(4, "0")}@test.invalid`,
    })),
  })

  return NextResponse.json({
    ok: true,
    electionId: election.id,
    voterCount,
    message: `Created ACTIVE election with ${voterCount} uninvited voters.`,
    nextStep: `POST /api/elections/${election.id}/invite`,
    hints: [
      "Set EMAIL_DRY_RUN=1 to skip the transport entirely (no emails at all).",
      "Or point SMTP settings at Mailpit (host=localhost, port=1025) to catch emails in a local web inbox.",
      "Add EMAIL_DRY_RUN_LATENCY_MS=200 to model provider round-trip speed.",
      "Add EMAIL_DRY_RUN_FAIL_RATE=0.1 to inject 10% transient failures and exercise the stop logic.",
    ],
  })
}

// ─── DELETE — clean up ───────────────────────────────────────────────────────

export async function DELETE(req: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await db.election.deleteMany({ where: { title: LOAD_TITLE } })
  return NextResponse.json({
    ok: true,
    deleted: result.count,
    message: result.count > 0 ? "Load test election deleted." : "No load test election found to delete.",
  })
}
