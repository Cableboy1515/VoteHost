import { z } from "zod"

const urlField = z.preprocess(
  (val) => {
    if (typeof val !== "string") return val
    const trimmed = val.trim()
    if (!trimmed) return undefined
    if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`
    return trimmed
  },
  z.string().url("Enter a valid URL")
)

export const ElectionBaseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "CLOSED", "COMPLETED"]).optional(),
  archived: z.boolean().optional(),
  emailSubject: z.string().optional().nullable(),
  emailMessage: z.string().optional().nullable(),
  emailLogoUrl: urlField.optional().nullable(),
  emailLogoDeleteUrl: z.string().url().optional().nullable(),
  emailFooter: z.string().optional().nullable(),
  firstReminderDays: z.number().int().positive().nullish(),
})

export const ElectionSchema = ElectionBaseSchema.refine(
  (data) => {
    if (data.firstReminderDays == null) return true
    if (!data.endsAt) return false
    if (data.startsAt) {
      const start = new Date(data.startsAt).getTime()
      const end = new Date(data.endsAt).getTime()
      const offsetMs = data.firstReminderDays * 24 * 60 * 60 * 1000
      if (end - start <= offsetMs) return false
    }
    return true
  },
  {
    message: "First reminder requires an end date and must be less than the election duration",
    path: ["firstReminderDays"],
  }
)

export const QuestionSchema = z.object({
  text: z.string().min(1, "Question text is required"),
  description: z.string().max(1000).optional().nullable(),
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "RANKED_CHOICE", "WRITE_IN"]),
  order: z.number().int().min(0),
  required: z.boolean().default(true),
  maxSelections: z.number().int().positive().nullish(),
  randomizeOptions: z.boolean().default(false),
  showOptionAvatars: z.boolean().default(true),
})

export const OptionSchema = z.object({
  text: z.string().min(1, "Option text is required"),
  order: z.number().int().min(0),
  bio: z.string().max(500).optional().nullable(),
  photoUrl: urlField.optional().nullable(),
  photoDeleteUrl: z.string().url().optional().nullable(),
  website: urlField.optional().nullable(),
})

export const VoterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
})

export const VotersSchema = z.array(VoterSchema).max(5000, "Cannot import more than 5000 voters at once")

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
    text: z.string().min(1).max(500),
  }),
])

export const BallotSubmissionSchema = z.object({
  token: z.string().uuid(),
  answers: z.array(BallotAnswerSchema),
})

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "ORGANIZER", "VIEWER"]),
})

export const UpdateUserSchema = z.object({
  role: z.enum(["ADMIN", "ORGANIZER", "VIEWER"]).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
})

export type ElectionInput = z.infer<typeof ElectionBaseSchema>
export type QuestionInput = z.infer<typeof QuestionSchema>
export type OptionInput = z.infer<typeof OptionSchema>
export type VoterInput = z.infer<typeof VoterSchema>
export type BallotAnswer = z.infer<typeof BallotAnswerSchema>
export type BallotSubmission = z.infer<typeof BallotSubmissionSchema>
