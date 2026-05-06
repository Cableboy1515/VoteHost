import { db } from "@/lib/db"

export async function autoCompleteElections() {
  await db.election.updateMany({
    where: { status: "ACTIVE", endsAt: { lt: new Date() } },
    data: { status: "COMPLETED" },
  })
}
