import { db } from "@/lib/db"

export type StaffRecipient = { email: string }

export async function getStaffRecipients(): Promise<StaffRecipient[]> {
  return db.adminUser.findMany({
    where: { role: { in: ["ADMIN", "ORGANIZER"] } },
    select: { email: true },
  })
}

export async function getViewerPlusRecipients(): Promise<StaffRecipient[]> {
  return db.adminUser.findMany({
    where: { role: { in: ["ADMIN", "ORGANIZER", "VIEWER"] } },
    select: { email: true },
  })
}
