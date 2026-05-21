import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"
import { generateVoterToken } from "@/lib/voterToken"

export type InviteSendSummary = {
  sent: number
  failed: number
  stopped: boolean
  stopReason?: "quota" | "consecutive_failures"
  lastError?: string
  failedAt?: string
}

export async function sendBallotInvitationsToUninvited(
  electionId: string,
): Promise<InviteSendSummary> {
  const election = await db.election.findUnique({
    where: { id: electionId },
    select: {
      title: true,
      emailSubject: true,
      emailMessage: true,
      emailLogoUrl: true,
      emailFooter: true,
      endsAt: true,
    },
  })
  if (!election) return { sent: 0, failed: 0, stopped: false }

  const uninvitedVoters = await db.voter.findMany({
    where: { electionId, invitedAt: null },
    select: { id: true, name: true, email: true },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const now = new Date()
  let sent = 0
  let failed = 0
  let consecutiveFails = 0

  for (const voter of uninvitedVoters) {
    try {
      const { token, tokenHash } = generateVoterToken()
      await db.voter.update({ where: { id: voter.id }, data: { tokenHash } })

      const { error, classification } = await sendBallotInvitation({
        voterName: voter.name,
        voterEmail: voter.email,
        electionTitle: election.title,
        magicLink: `${baseUrl}/vote/${token}`,
        emailSubject: election.emailSubject,
        emailMessage: election.emailMessage,
        emailLogoUrl: election.emailLogoUrl,
        emailFooter: election.emailFooter,
        endsAt: election.endsAt?.toISOString(),
      })

      if (classification === "quota") {
        console.error("[sendBallotInvitationsToUninvited] quota reached at", voter.email, error)
        return { sent, failed: failed + 1, stopped: true, stopReason: "quota", lastError: error ?? undefined, failedAt: voter.email }
      }

      if (error) {
        console.error("[sendBallotInvitationsToUninvited] send failed for", voter.email, error)
        failed++
        if (classification === "transient") {
          consecutiveFails++
          if (consecutiveFails >= 5) {
            return { sent, failed, stopped: true, stopReason: "consecutive_failures", lastError: error, failedAt: voter.email }
          }
        } else {
          // permanent failure (bad address etc.) — reset consecutive count and continue
          consecutiveFails = 0
        }
        continue
      }

      await db.voter.update({ where: { id: voter.id }, data: { invitedAt: now } })
      sent++
      consecutiveFails = 0
    } catch (err) {
      console.error("[sendBallotInvitationsToUninvited] send threw for", voter.email, err)
      failed++
      consecutiveFails++
      if (consecutiveFails >= 5) {
        return { sent, failed, stopped: true, stopReason: "consecutive_failures", lastError: String(err), failedAt: voter.email }
      }
    }
  }

  return { sent, failed, stopped: false }
}
