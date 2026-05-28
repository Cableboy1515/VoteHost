import { db } from "@/lib/db"
import type { SendResult } from "@/lib/email"

export async function recordVoterSendResult(voterId: string, r: SendResult): Promise<void> {
  const now = new Date()
  if (r.error === null) {
    await db.voter.update({
      where: { id: voterId },
      data: {
        lastSendStatus: "ok",
        lastSendErrorCode: null,
        lastSendErrorMessage: null,
        lastSendAttemptAt: now,
        lastSendProvider: r.provider,
      },
    })
  } else {
    await db.voter.update({
      where: { id: voterId },
      data: {
        lastSendStatus: r.classification,
        lastSendErrorCode: r.responseCode,
        lastSendErrorMessage: r.responseText,
        lastSendAttemptAt: now,
        lastSendProvider: r.provider,
      },
    })
  }
}
