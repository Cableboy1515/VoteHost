import { db } from "@/lib/db"
import { BRAND_NAME } from "@/lib/branding"
import { CURRENT_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS, type BackupCounts, type BackupType } from "./format"
import type { BackupData } from "./dumpData"

export async function restoreDatabase(
  type: BackupType,
  data: BackupData,
  schemaVersion: string,
): Promise<BackupCounts> {
  if (!(SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(schemaVersion)) {
    throw new Error(
      `Archive schema version "${schemaVersion}" is not supported (supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}). ` +
        `This archive was created by a newer version of ${BRAND_NAME} — upgrade your installation before restoring.`,
    )
  }

  const activeCount = await db.election.count({ where: { status: "ACTIVE" } })
  if (activeCount > 0) {
    const err = new Error(
      "Restore refused: there are active elections on this server. Close or cancel them before restoring.",
    )
    ;(err as Error & { code: string }).code = "ACTIVE_ELECTIONS"
    throw err
  }

  // Schema v1/v2 archives (v1.0.0–v1.0.3) used QuestionType.WRITE_IN, which was
  // renamed to COMMENT in v1.1.0. Map before insert so the current enum accepts them.
  const questions = data.questions.map((q) =>
    (q as { type?: string }).type === "WRITE_IN" ? { ...q, type: "COMMENT" as const } : q
  )

  await db.$transaction(async (tx) => {
    // Delete children before parents to respect FK constraints.
    // WriteInMerge FKs both Election and Question; BallotReceipt FKs Election.
    await tx.writeInMerge.deleteMany()
    await tx.ballotReceipt.deleteMany()
    await tx.vote.deleteMany()
    await tx.voter.deleteMany()
    await tx.option.deleteMany()
    await tx.question.deleteMany()
    await tx.election.deleteMany()

    if (type === "full") {
      await tx.setting.deleteMany()
      await tx.adminUser.deleteMany()
    }

    // Insert parents before children.
    if (data.elections.length > 0) {
      await tx.election.createMany({ data: data.elections })
    }
    if (questions.length > 0) {
      await tx.question.createMany({ data: questions })
    }
    if (data.options.length > 0) {
      await tx.option.createMany({ data: data.options })
    }
    if (data.voters.length > 0) {
      await tx.voter.createMany({ data: data.voters })
    }
    if (data.votes.length > 0) {
      await tx.vote.createMany({ data: data.votes })
    }
    // BallotReceipt FKs Election only — insert after elections.
    if (data.ballotReceipts && data.ballotReceipts.length > 0) {
      await tx.ballotReceipt.createMany({ data: data.ballotReceipts })
    }
    // WriteInMerge FKs both Election and Question — insert after both.
    if (data.writeInMerges && data.writeInMerges.length > 0) {
      await tx.writeInMerge.createMany({ data: data.writeInMerges })
    }

    if (type === "full") {
      if (data.settings && data.settings.length > 0) {
        await tx.setting.createMany({ data: data.settings })
      }
      if (data.adminUsers && data.adminUsers.length > 0) {
        await tx.adminUser.createMany({ data: data.adminUsers })
        await tx.adminUser.updateMany({
          data: { tokenVersion: { increment: 1 } },
        })
      }
    }
  })

  const counts: BackupCounts = {
    elections: data.elections.length,
    questions: data.questions.length,
    options: data.options.length,
    voters: data.voters.length,
    votes: data.votes.length,
    ballotReceipts: data.ballotReceipts?.length ?? 0,
    writeInMerges: data.writeInMerges?.length ?? 0,
  }

  if (type === "full") {
    counts.adminUsers = data.adminUsers?.length ?? 0
    counts.settings = data.settings?.length ?? 0
  }

  return counts
}
