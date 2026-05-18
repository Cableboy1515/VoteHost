export type CanActivateResult =
  | { ok: true }
  | { ok: false; reason: "no_ballot" | "no_voters" | "past_endsAt" }

export function canActivate(opts: {
  questionCount: number
  voterCount: number
  endsAt?: Date | null
}): CanActivateResult {
  if (opts.questionCount === 0) return { ok: false, reason: "no_ballot" }
  if (opts.voterCount === 0) return { ok: false, reason: "no_voters" }
  if (opts.endsAt && opts.endsAt <= new Date()) return { ok: false, reason: "past_endsAt" }
  return { ok: true }
}

export const CANNOT_ACTIVATE_MESSAGES: Record<
  "no_ballot" | "no_voters" | "past_endsAt",
  string
> = {
  no_ballot: "Add at least one race to the ballot before activating.",
  no_voters: "Add at least one voter before activating.",
  past_endsAt: "The election close date has already passed. Update it before activating.",
}
