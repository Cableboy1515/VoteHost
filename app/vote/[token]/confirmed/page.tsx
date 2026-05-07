import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { BrandMark } from "@/components/ui/brand-mark"

export default async function ConfirmedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const voter = await db.voter.findUnique({
    where: { token },
    include: { election: true },
  })

  if (!voter || !voter.hasVoted) notFound()

  return (
    <div className="min-h-screen bg-vh-bg flex flex-col">
      <header className="px-6 py-5 border-b border-vh-line bg-vh-surface">
        <BrandMark size={22} />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span
          className="inline-grid place-items-center text-4xl mb-6 bg-vh-success-soft"
          style={{ width: 72, height: 72, borderRadius: 18 }}
          aria-hidden
        >
          ✓
        </span>

        <h1 className="text-2xl font-semibold text-vh-ink mb-3 max-w-sm">
          Your vote has been recorded
        </h1>
        <p className="text-[15px] text-vh-muted max-w-xs leading-relaxed">
          Thank you for participating in{" "}
          <strong className="text-vh-ink-soft">{voter.election.title}</strong>.
          Your ballot is anonymous and cannot be changed.
        </p>

        <p className="mt-8 text-[12px] text-vh-muted">
          🔒 Recorded anonymously · You may close this window
        </p>
      </div>
    </div>
  )
}
