import { db } from "@/lib/db"
import { notFound } from "next/navigation"

export default async function ConfirmedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const voter = await db.voter.findUnique({
    where: { token },
    include: { election: true },
  })

  if (!voter || !voter.hasVoted) notFound()

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="max-w-md text-center p-8">
        <div className="text-5xl mb-4">✓</div>
        <h1 className="text-2xl font-bold mb-2">Vote submitted</h1>
        <p className="text-zinc-500">
          Thank you for participating in{" "}
          <strong>{voter.election.title}</strong>.
          Your vote has been recorded.
        </p>
      </div>
    </div>
  )
}
