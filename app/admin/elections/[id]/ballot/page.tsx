import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import BallotBuilder from "@/components/admin/BallotBuilder"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default async function BallotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const election = await db.election.findUnique({
    where: { id },
    include: {
      questions: {
        include: { options: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!election) notFound()

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ballot Builder</h1>
          <p className="text-zinc-500 text-sm">{election.title}</p>
        </div>
        <div className="flex gap-2 ml-auto">
          <Link href={`/admin/elections/${id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Settings</Link>
          <Link href={`/admin/elections/${id}/voters`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Voters →</Link>
        </div>
      </div>
      <BallotBuilder
        electionId={id}
        initialQuestions={election.questions.map((q) => ({
          id: q.id,
          text: q.text,
          type: q.type,
          order: q.order,
          required: q.required,
          options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order })),
        }))}
      />
    </div>
  )
}
