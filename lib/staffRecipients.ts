import { db } from "@/lib/db"

export type StaffRecipient = { email: string }

export async function getStaffRecipients(): Promise<StaffRecipient[]> {
  return db.adminUser.findMany({
    where: { role: { in: ["ADMIN", "ORGANIZER"] } },
    select: { email: true },
  })
}
