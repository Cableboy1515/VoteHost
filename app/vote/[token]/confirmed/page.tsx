import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { BrandMark } from "@/components/ui/brand-mark"
import CopyButton from "@/components/ui/copy-button"
import { findVoterIdByToken } from "@/lib/voterToken"

export default async function ConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ receipt?: string; replaced?: string }>
}) {
  const { token } = await params
  const { receipt, replaced } = await searchParams
  const isReplaced = replaced === "1"

  const voterId = await findVoterIdByToken(token)
  const voter = voterId
    ? await db.voter.findUnique({ where: { id: voterId }, include: { election: true } })
    : null

  if (!voter || !voter.hasVoted) notFound()

  return (
    <div className="min-h-screen bg-vh-bg flex flex-col">
      <header className="px-4 sm:px-6 py-5 border-b border-vh-line bg-vh-surface">
        <BrandMark size={28} />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16 text-center">
        <BrandMark size={72} showWordmark={false} className="mb-6" />

        <h1 className="text-2xl font-semibold text-vh-ink mb-3 max-w-sm">
          {isReplaced ? "Your ballot has been replaced" : "Your vote has been recorded"}
        </h1>
        <p className="text-[15px] text-vh-muted max-w-xs leading-relaxed">
          {isReplaced
            ? <>Your previous ballot for <strong className="text-vh-ink-soft">{voter.election.title}</strong> has been replaced. Your new receipt code is below.</>
            : <>Thank you for participating in{" "}<strong className="text-vh-ink-soft">{voter.election.title}</strong>. Your ballot is anonymous and cannot be changed.</>
          }
        </p>

        {receipt && (
          <div
            className="mt-8 w-full max-w-sm rounded-[14px] p-5 text-left"
            style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line-strong)" }}
          >
            <p className="text-[12px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--vh-muted)" }}>
              {isReplaced ? "New ballot receipt" : "Your ballot receipt"}
            </p>
            <div className="flex items-center gap-3">
              <code
                className="flex-1 text-[17px] font-mono font-semibold tracking-widest"
                style={{ color: "var(--vh-ink)" }}
              >
                {receipt}
              </code>
              <CopyButton value={receipt} />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--vh-muted)" }}>
              {isReplaced
                ? <>This new code replaces your old one. Save it — you can use it to verify your vote or replace your ballot again before the election closes.{" "}<a href={`/verify/${voter.electionId}`} className="underline" style={{ color: "var(--vh-accent)" }}>Verify now →</a></>
                : <>Save this code — you can use it to verify your vote was counted.{" "}<a href={`/verify/${voter.electionId}`} className="underline" style={{ color: "var(--vh-accent)" }}>Verify now →</a></>
              }
            </p>
          </div>
        )}

        <p className="mt-8 text-[12px] text-vh-muted">
          🔒 Recorded anonymously · You may close this window
        </p>
      </div>
    </div>
  )
}
