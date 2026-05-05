import { z } from "zod"

export const ElectionSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).optional(),
})

export const QuestionSchema = z.object({
  text: z.string().min(1, "Question text is required"),
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "RANKED_CHOICE", "WRITE_IN"]),
  order: z.number().int().min(0),
  required: z.boolean().default(true),
})

export const OptionSchema = z.object({
  text: z.string().min(1, "Option text is required"),
  order: z.number().int().min(0),
})

export const VoterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
})

export const VotersSchema = z.array(VoterSchema)

export const BallotAnswerSchema = z.discriminatedUnion("type", [
  z.object({
    questionId: z.string(),
    type: z.literal("SINGLE_CHOICE"),
    optionId: z.string(),
  }),
  z.object({
    questionId: z.string(),
    type: z.literal("MULTIPLE_CHOICE"),
    optionIds: z.array(z.string()).min(1),
  }),
  z.object({
    questionId: z.string(),
    type: z.literal("RANKED_CHOICE"),
    rankedOptionIds: z.array(z.string()).min(1),
  }),
  z.object({
    questionId: z.string(),
    type: z.literal("WRITE_IN"),
    text: z.string().min(1),
  }),
])

export const BallotSubmissionSchema = z.object({
  token: z.string().uuid(),
  answers: z.array(BallotAnswerSchema),
})

export type ElectionInput = z.infer<typeof ElectionSchema>
export type QuestionInput = z.infer<typeof QuestionSchema>
export type OptionInput = z.infer<typeof OptionSchema>
export type VoterInput = z.infer<typeof VoterSchema>
export type BallotAnswer = z.infer<typeof BallotAnswerSchema>
export type BallotSubmission = z.infer<typeof BallotSubmissionSchema>
