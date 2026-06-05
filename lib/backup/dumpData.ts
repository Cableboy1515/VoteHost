import { db } from "@/lib/db"
import type { BackupCounts, BackupType } from "./format"
import type {
  AdminUser,
  BallotReceipt,
  Election,
  Question,
  Option,
  Voter,
  Vote,
  Setting,
  WriteInMerge,
} from "@/lib/generated/prisma/client"

export type BackupData = {
  adminUsers?: AdminUser[]
  settings?: Setting[]
  elections: Election[]
  questions: Question[]
  options: Option[]
  voters: Voter[]
  votes: Vote[]
  // Added in schema v3 — included in both "full" and "elections" backups.
  ballotReceipts: BallotReceipt[]
  writeInMerges: WriteInMerge[]
}

export async function dumpDatabase(
  type: BackupType,
): Promise<{ data: BackupData; counts: BackupCounts }> {
  const [elections, questions, options, voters, votes, ballotReceipts, writeInMerges] =
    await Promise.all([
      db.election.findMany(),
      db.question.findMany(),
      db.option.findMany(),
      db.voter.findMany(),
      db.vote.findMany(),
      db.ballotReceipt.findMany(),
      db.writeInMerge.findMany(),
    ])

  const data: BackupData = { elections, questions, options, voters, votes, ballotReceipts, writeInMerges }
  const counts: BackupCounts = {
    elections: elections.length,
    questions: questions.length,
    options: options.length,
    voters: voters.length,
    votes: votes.length,
    ballotReceipts: ballotReceipts.length,
    writeInMerges: writeInMerges.length,
  }

  if (type === "full") {
    const adminUsers = await db.adminUser.findMany()
    const settings = await db.setting.findMany()
    data.adminUsers = adminUsers
    data.settings = settings
    counts.adminUsers = adminUsers.length
    counts.settings = settings.length
  }

  return { data, counts }
}
