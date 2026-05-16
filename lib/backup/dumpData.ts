import { db } from "@/lib/db"
import type { BackupCounts, BackupType } from "./format"
import type {
  AdminUser,
  Election,
  Question,
  Option,
  Voter,
  Vote,
  Setting,
} from "@/lib/generated/prisma/client"

export type BackupData = {
  adminUsers?: AdminUser[]
  settings?: Setting[]
  elections: Election[]
  questions: Question[]
  options: Option[]
  voters: Voter[]
  votes: Vote[]
}

export async function dumpDatabase(
  type: BackupType,
): Promise<{ data: BackupData; counts: BackupCounts }> {
  const elections = await db.election.findMany()
  const questions = await db.question.findMany()
  const options = await db.option.findMany()
  const voters = await db.voter.findMany()
  const votes = await db.vote.findMany()

  const data: BackupData = { elections, questions, options, voters, votes }
  const counts: BackupCounts = {
    elections: elections.length,
    questions: questions.length,
    options: options.length,
    voters: voters.length,
    votes: votes.length,
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
