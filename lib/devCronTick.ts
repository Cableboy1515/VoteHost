import { autoActivateElections } from "@/lib/autoActivateElections"
import { autoCompleteElections } from "@/lib/autoCompleteElections"

const TICK_MS = 60_000

declare global {
  // eslint-disable-next-line no-var
  var __vhDevCronTick: NodeJS.Timeout | undefined
}

export function startDevCronTick() {
  if (globalThis.__vhDevCronTick) return // already running (e.g. after HMR)

  const tick = async () => {
    try {
      const activated = await autoActivateElections()
      if (activated.length > 0) {
        console.log(`[dev-cron] auto-activated ${activated.length} election(s): ${activated.join(", ")}`)
      }
    } catch (err) {
      console.error("[dev-cron] autoActivateElections error:", err)
    }
    try {
      const completed = await autoCompleteElections()
      if (completed.length > 0) {
        console.log(`[dev-cron] auto-completed ${completed.length} election(s): ${completed.join(", ")}`)
      }
    } catch (err) {
      console.error("[dev-cron] autoCompleteElections error:", err)
    }
  }

  globalThis.__vhDevCronTick = setInterval(tick, TICK_MS)
  console.log(`[dev-cron] tick scheduled (${TICK_MS / 1000}s interval)`)
}
