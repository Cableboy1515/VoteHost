import { db } from "@/lib/db"
import type { SessionPayload } from "@/lib/auth"

export type ActivityAction =
  | "voter.add"
  | "voter.edit"
  | "voter.delete"
  | "voter.bulk_delete"
  | "voter.csv_import"
  | "voter.invite_resent"
  | "voter.bulk_invite"
  | "voter.recovery_issued"
  | "election.create"
  | "election.update"
  | "election.activate"
  | "election.cancel_activation"
  | "election.close"
  | "election.reopen"
  | "election.archive"
  | "election.unarchive"
  | "election.ballot_update"
  | "election.ballot_reset"
  | "election.delete"
  | "election.auto_activate"
  | "election.auto_activate_failed"
  | "election.auto_invite_batch"
  | "election.auto_complete"
  | "election.first_reminder_batch"
  | "election.final_reminder_batch"
  | "election.closing_soon_notice"
  | "election.starting_soon_notice"
  | "election.full_turnout_notice"
  | "election.completion_notice"
  | "election.results_email_auto_sent"
  | "election.results_email_sent"
  | "election.images_purged"
  | "election.enter_review"    // write-in elections park here between close and finalize
  | "election.finalize"        // admin seals tally hash and completes after write-in review
  | "ballot.replaced"          // voter replaced their ballot using a receipt code
  | "writein.merge"            // admin maps raw write-in text → canonical candidate label
  | "writein.unmerge"          // admin removes a merge mapping
  | "user.invite"
  | "user.role_change"
  | "user.delete"
  | "settings.general_update"
  | "settings.email_update"
  | "settings.security_update"
  | "twofa.enable"
  | "twofa.disable"
  | "admin.backup_download"
  | "admin.restore"

type ActivityActor =
  | { session: Pick<SessionPayload, "sub" | "email" | "role"> }
  | { system: true }

export async function recordActivity(input: ActivityActor & {
  action: ActivityAction
  electionId?: string | null
  targetType: "voter" | "election" | "user" | "settings" | "system" | "writein"
  targetId?: string | null
  targetLabel?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const actor = "system" in input
    ? { actorId: null, actorEmail: "system@votehost.local", actorRole: "SYSTEM" as const }
    : { actorId: input.session.sub, actorEmail: input.session.email, actorRole: input.session.role }
  try {
    await db.activityLog.create({
      data: {
        ...actor,
        electionId: input.electionId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        targetLabel: input.targetLabel ?? null,
        metadata: input.metadata as never ?? null,
      },
    })
  } catch (err) {
    console.error("[recordActivity] failed", input.action, err)
  }
}
