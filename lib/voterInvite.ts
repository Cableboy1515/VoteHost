import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"
import { recordVoterSendResult } from "@/lib/recordVoterSendResult"
import { generateVoterToken, appendVoterToken } from "@/lib/voterToken"

type VoterData = {
  id: string
  name: string
  email: string
  invitedAt: Date | null
  hasVoted: boolean
  lastSendStatus?: string | null
}

type ElectionData = {
  id: string
  status: string
  title: string
  emailSubject: string | null
  emailMessage: string | null
  emailLogoUrl: string | null
  emailFooter: string | null
  endsAt: Date | null
}

export type InviteOneStatus = "sent" | "voted" | "not_invited" | "election_not_active" | "failed"

export async function sendOneInvite(
  voter: VoterData,
  election: ElectionData,
  baseUrl: string
): Promise<InviteOneStatus> {
  if (voter.hasVoted) return "voted"
  // Allow retry if a previous send failed (lastSendStatus set) even without invitedAt
  if (!voter.invitedAt && !voter.lastSendStatus) return "not_invited"
  if (election.status !== "ACTIVE") return "election_not_active"

  const { token, tokenHash } = generateVoterToken()
  await appendVoterToken(voter.id, tokenHash)

  const result = await sendBallotInvitation({
    voterName: voter.name,
    voterEmail: voter.email,
    electionTitle: election.title,
    magicLink: `${baseUrl}/vote/${token}`,
    emailSubject: election.emailSubject,
    emailMessage: election.emailMessage,
    emailLogoUrl: election.emailLogoUrl,
    emailFooter: election.emailFooter,
    endsAt: election.endsAt?.toISOString(),
    voterId: voter.id,
    electionId: election.id,
  })

  await recordVoterSendResult(voter.id, result).catch(() => {})

  if (result.error) return "failed"

  if (!voter.invitedAt) {
    await db.voter.update({ where: { id: voter.id }, data: { invitedAt: new Date() } })
  }
  return "sent"
}
