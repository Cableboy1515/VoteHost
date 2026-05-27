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

export async function recordActivity(input: {
  session: Pick<SessionPayload, "sub" | "email" | "role">
  action: ActivityAction
  electionId?: string | null
  targetType: "voter" | "election" | "user" | "settings" | "system"
  targetId?: string | null
  targetLabel?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        actorId: input.session.sub,
        actorEmail: input.session.email,
        actorRole: input.session.role,
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
