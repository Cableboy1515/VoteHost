import { writeFile } from "node:fs/promises"
import { join, basename } from "node:path"
import { db } from "@/lib/db"

const UPLOADS_DIR = join(process.cwd(), "public", "uploads")

// 1×1 transparent GIF — 70 bytes. Written in-place over uploaded images
// so email src attributes stay valid but transfer nearly nothing.
const TOMBSTONE = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
)

function filenameFromUrl(url: string): string | null {
  // Accepts relative `/uploads/foo.jpg` and absolute URLs.
  const path = url.startsWith("/") ? url : (() => {
    try { return new URL(url).pathname } catch { return null }
  })()
  if (!path) return null
  const name = basename(path.split(/[?#]/)[0])
  if (!name || name.includes("..")) return null
  return name
}

async function tombstoneFile(url: string): Promise<void> {
  const filename = filenameFromUrl(url)
  if (!filename) return
  const path = join(UPLOADS_DIR, filename)
  await writeFile(path, TOMBSTONE).catch(() => undefined)
}

export async function purgeElectionImages(electionId: string): Promise<void> {
  const election = await db.election.findUnique({
    where: { id: electionId },
    select: {
      imagesPurgedAt: true,
      emailLogoUrl: true,
      questions: { select: { options: { select: { photoUrl: true } } } },
    },
  })

  if (!election || election.imagesPurgedAt) return

  const urls: string[] = []
  if (election.emailLogoUrl) urls.push(election.emailLogoUrl)
  for (const q of election.questions) {
    for (const o of q.options) {
      if (o.photoUrl) urls.push(o.photoUrl)
    }
  }

  await Promise.allSettled(urls.map(tombstoneFile))

  await db.election.update({
    where: { id: electionId },
    data: { imagesPurgedAt: new Date() },
  })
}
