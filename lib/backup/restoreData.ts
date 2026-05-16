import { db } from "@/lib/db"
import { CURRENT_SCHEMA_VERSION, type BackupCounts, type BackupType } from "./format"
import type { BackupData } from "./dumpData"

export async function restoreDatabase(
  type: BackupType,
  data: BackupData,
  schemaVersion: string,
): Promise<BackupCounts> {
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Archive schema version "${schemaVersion}" does not match current version "${CURRENT_SCHEMA_VERSION}". ` +
        "Upgrade your VoteHost installation to match the archive version before restoring.",
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

  await db.$transaction(async (tx) => {
    await tx.vote.deleteMany()
    await tx.voter.deleteMany()
    await tx.option.deleteMany()
    await tx.question.deleteMany()
    await tx.election.deleteMany()

    if (type === "full") {
      await tx.setting.deleteMany()
      await tx.adminUser.deleteMany()
    }

    if (data.elections.length > 0) {
      await tx.election.createMany({ data: data.elections })
    }
    if (data.questions.length > 0) {
      await tx.question.createMany({ data: data.questions })
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
  }

  if (type === "full") {
    counts.adminUsers = data.adminUsers?.length ?? 0
    counts.settings = data.settings?.length ?? 0
  }

  return counts
}
