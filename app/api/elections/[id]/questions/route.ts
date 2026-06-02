import { NextResponse } from "next/server"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { QuestionSchema, OptionSchema } from "@/lib/validations"
import { recordActivity } from "@/lib/recordActivity"
import { z } from "zod"

const BallotSchema = z.array(
  QuestionSchema.extend({
    id: z.string().optional(),
    options: z.array(OptionSchema.extend({ id: z.string().optional() })).optional(),
  })
)

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const questions = await db.question.findMany({
    where: { electionId: id },
    include: { options: { orderBy: { order: "asc" } } },
    orderBy: { order: "asc" },
  })
  return NextResponse.json(questions)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  const electionCheck = await db.election.findUnique({ where: { id: electionId }, select: { firstVoteAt: true } })
  if (!electionCheck) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (electionCheck.firstVoteAt) return NextResponse.json({ error: "Ballot locked — votes have been cast" }, { status: 423 })

  const body = await req.json()
  const parsed = BallotSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  // Snapshot before mutation for diff
  const before = await db.question.findMany({
    where: { electionId },
    include: { options: { orderBy: { order: "asc" } } },
    orderBy: { order: "asc" },
  })

  await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
    await tx.question.deleteMany({ where: { electionId } })
    for (const q of parsed.data) {
      const question = await tx.question.create({
        data: {
          electionId,
          text: q.text,
          description: q.description ?? null,
          type: q.type,
          allowWriteIn: q.allowWriteIn ?? false,
          order: q.order,
          required: q.required ?? true,
          maxSelections: q.maxSelections ?? null,
          seats: q.seats ?? 1,
          randomizeOptions: q.randomizeOptions ?? false,
          showOptionAvatars: q.showOptionAvatars ?? true,
        },
      })
      if (q.options && q.type !== "COMMENT") {
        await tx.option.createMany({
          data: q.options.map((o) => ({
            questionId: question.id,
            text: o.text,
            order: o.order,
            bio: o.bio ?? null,
            photoUrl: o.photoUrl ?? null,
            photoDeleteUrl: o.photoDeleteUrl ?? null,
            website: o.website ?? null,
          })),
        })
      }
    }
  })

  const questions = await db.question.findMany({
    where: { electionId },
    include: { options: { orderBy: { order: "asc" } } },
    orderBy: { order: "asc" },
  })

  // Compute diff for activity log
  const beforeById = new Map(before.map((q) => [q.id, q]))
  const bodyIds = new Set(parsed.data.map((q) => q.id).filter(Boolean))
  const added: string[] = []
  const removed: string[] = []
  const edited: Array<{ text: string; optionsAdded?: number; optionsRemoved?: number; optionsEdited?: number }> = []

  for (const q of parsed.data) {
    if (!q.id || !beforeById.has(q.id)) {
      added.push(q.text)
    } else {
      const prev = beforeById.get(q.id)!
      const prevOptIds = new Set(prev.options.map((o) => o.id))
      const newOpts = q.options ?? []
      const newOptIds = new Set(newOpts.map((o) => o.id).filter(Boolean))
      const optionsAdded   = newOpts.filter((o) => !o.id || !prevOptIds.has(o.id)).length
      const optionsRemoved = prev.options.filter((o) => !newOptIds.has(o.id)).length
      const optionsEdited  = newOpts.filter((o) => {
        if (!o.id || !prevOptIds.has(o.id)) return false
        const po = prev.options.find((p) => p.id === o.id)!
        return po.text !== o.text || (po.bio ?? null) !== (o.bio ?? null) || (po.website ?? null) !== (o.website ?? null)
      }).length

      const questionFieldsChanged =
        prev.text !== q.text ||
        prev.type !== q.type ||
        (prev.description ?? null) !== (q.description ?? null) ||
        (prev.required ?? true) !== (q.required ?? true) ||
        (prev.maxSelections ?? null) !== (q.maxSelections ?? null) ||
        (prev.seats ?? 1) !== (q.seats ?? 1) ||
        (prev.randomizeOptions ?? false) !== (q.randomizeOptions ?? false) ||
        (prev.showOptionAvatars ?? true) !== (q.showOptionAvatars ?? true) ||
        (prev.allowWriteIn ?? false) !== (q.allowWriteIn ?? false)

      if (questionFieldsChanged || optionsAdded || optionsRemoved || optionsEdited) {
        edited.push({
          text: q.text,
          ...(optionsAdded   ? { optionsAdded }   : {}),
          ...(optionsRemoved ? { optionsRemoved } : {}),
          ...(optionsEdited  ? { optionsEdited }  : {}),
        })
      }
    }
  }

  for (const q of before) {
    if (!bodyIds.has(q.id)) removed.push(q.text)
  }

  if (added.length + removed.length + edited.length > 0) {
    await recordActivity({
      session,
      action: "election.ballot_update",
      electionId,
      targetType: "election",
      targetId: electionId,
      metadata: { added, removed, edited },
    })
  }

  return NextResponse.json(questions)
}
