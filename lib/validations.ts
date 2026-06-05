import { z } from "zod"
import { HERO_COLOR_KEYS } from "./heroColors"

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

// Accepts either a relative path (preferred — `/uploads/foo.jpg`, `/api/upload/image/foo.jpg`)
// or a full URL (for backward compatibility with rows uploaded before relative URLs landed,
// and for users who paste an external image URL).
const imageOrPathField = z.preprocess(
  (val) => {
    if (typeof val !== "string") return val
    const trimmed = val.trim()
    if (!trimmed) return undefined
    if (trimmed.startsWith("/")) return trimmed
    if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`
    return trimmed
  },
  z.string().refine(
    (s) => s.startsWith("/") || z.string().url().safeParse(s).success,
    "Must be a URL or path beginning with /"
  )
)

export const ElectionBaseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "PENDING_REVIEW", "COMPLETED"]).optional(),
  archived: z.boolean().optional(),
  emailSubject: z.string().optional().nullable(),
  emailMessage: z.string().optional().nullable(),
  emailLogoUrl: imageOrPathField.optional().nullable(),
  emailLogoDeleteUrl: imageOrPathField.optional().nullable(),
  emailFooter: z.string().optional().nullable(),
  firstReminderDays: z.number().int().positive().nullish(),
  autoActivate: z.boolean().optional(),
  autoSendResults: z.boolean().optional(),
  weightingEnabled: z.boolean().optional(),
  quorumType: z.enum(["NONE", "PERCENT", "COUNT"]).optional(),
  quorumValue: z.number().int().min(1).nullish(),
  heroColor: z.union([
    z.enum(HERO_COLOR_KEYS as [string, ...string[]]),
    z.string().regex(/^#[0-9a-fA-F]{6}$/i),
  ]).nullable().optional(),
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
  type: z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "RANKED_CHOICE", "COMMENT"]),
  allowWriteIn: z.boolean().default(false),
  writeInSlots: z.number().int().min(1).max(50).default(1),
  order: z.number().int().min(0),
  required: z.boolean().default(true),
  maxSelections: z.number().int().positive().nullish(),
  seats: z.number().int().min(1).optional(),
  randomizeOptions: z.boolean().default(false),
  showOptionAvatars: z.boolean().default(true),
})

export const OptionSchema = z.object({
  text: z.string().min(1, "Option text is required"),
  order: z.number().int().min(0),
  bio: z.string().max(500).optional().nullable(),
  photoUrl: imageOrPathField.optional().nullable(),
  photoDeleteUrl: imageOrPathField.optional().nullable(),
  website: urlField.optional().nullable(),
})

export const VoterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  weight: z.number().int().min(1).optional(),
})

export const VotersSchema = z.array(VoterSchema).max(5000, "Cannot import more than 5000 voters at once")

const writeInTextField = z.string().min(1).max(500)

// A ranked item is either a reference to a pre-listed option OR a write-in candidate name.
// Using an interleaved array preserves rank position for write-ins mixed with real options.
export const RankedItemSchema = z.union([
  z.object({ optionId: z.string() }),
  z.object({ writeInText: writeInTextField }),
])

export const BallotAnswerSchema = z.discriminatedUnion("type", [
  // SINGLE_CHOICE: voter picks exactly one option OR writes in one candidate (XOR).
  z.object({
    questionId: z.string(),
    type: z.literal("SINGLE_CHOICE"),
    optionId: z.string().optional(),
    writeInText: writeInTextField.optional(),
  }).refine(
    (d) => (!!d.optionId) !== (!!d.writeInText),
    { message: "Exactly one of optionId or writeInText is required" }
  ),

  // MULTIPLE_CHOICE: any combination of pre-listed options and write-in candidates,
  // combined count >= 1. writeInTexts defaults to [] for non-write-in questions.
  z.object({
    questionId: z.string(),
    type: z.literal("MULTIPLE_CHOICE"),
    optionIds: z.array(z.string()).default([]),
    writeInTexts: z.array(writeInTextField).default([]),
  }).refine(
    (d) => d.optionIds.length + d.writeInTexts.length >= 1,
    { message: "At least one option or write-in is required" }
  ),

  // RANKED_CHOICE: interleaved list of pre-listed options and write-in candidates in
  // rank order. Two parallel arrays (optionIds + writeInRanks) would make rank position
  // ambiguous; a single items array is unambiguous and maps directly to Vote rows.
  z.object({
    questionId: z.string(),
    type: z.literal("RANKED_CHOICE"),
    rankedItems: z.array(RankedItemSchema).min(1),
  }),

  z.object({
    questionId: z.string(),
    type: z.literal("COMMENT"),
    text: z.string().min(1).max(500),
  }),
])

export const BallotSubmissionSchema = z.object({
  token: z.string().uuid(),
  answers: z.array(BallotAnswerSchema),
})

export const CreateUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "ORGANIZER", "VIEWER"]),
})

export const BootstrapAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  setupToken: z.string(),
})

export const UpdateUserSchema = z.object({
  role: z.enum(["ADMIN", "ORGANIZER", "VIEWER"]),
})

export const SetupAccountSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const RequestResetSchema = z.object({
  email: z.string().email(),
})

export const VoterRecoveryRequestSchema = z.object({
  email: z.string().email().max(254),
})

export const ResetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
})

export type ElectionInput = z.infer<typeof ElectionBaseSchema>
export type QuestionInput = z.infer<typeof QuestionSchema>
export type OptionInput = z.infer<typeof OptionSchema>
export type VoterInput = z.infer<typeof VoterSchema>
export type BallotAnswer = z.infer<typeof BallotAnswerSchema>
export type BallotSubmission = z.infer<typeof BallotSubmissionSchema>
export type CreateUserInput = z.infer<typeof CreateUserSchema>
export type SetupAccountInput = z.infer<typeof SetupAccountSchema>
