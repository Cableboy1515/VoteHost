import { NextResponse } from "next/server"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { QuestionSchema, OptionSchema } from "@/lib/validations"
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
  const body = await req.json()
  const parsed = BallotSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
    await tx.question.deleteMany({ where: { electionId } })
    for (const q of parsed.data) {
      const question = await tx.question.create({
        data: {
          electionId,
          text: q.text,
          description: q.description ?? null,
          type: q.type,
          order: q.order,
          required: q.required ?? true,
          maxSelections: q.maxSelections ?? null,
        },
      })
      if (q.options && q.type !== "WRITE_IN") {
        await tx.option.createMany({
          data: q.options.map((o) => ({
            questionId: question.id,
            text: o.text,
            order: o.order,
            bio: o.bio ?? null,
            photoUrl: o.photoUrl ?? null,
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
  return NextResponse.json(questions)
}
