export type ActivationProgressState = {
  running: boolean
  sent: number
  failed: number
  total: number
  stopped: boolean
  stopReason?: "quota" | "consecutive_failures"
  lastError?: string
  startedAt: number
}

const tracker = new Map<string, ActivationProgressState>()

export function startProgress(electionId: string, total: number): void {
  tracker.set(electionId, {
    running: true,
    sent: 0,
    failed: 0,
    total,
    stopped: false,
    startedAt: Date.now(),
  })
}

export function recordSent(electionId: string): void {
  const p = tracker.get(electionId)
  if (p) p.sent++
}

export function recordFailed(electionId: string): void {
  const p = tracker.get(electionId)
  if (p) p.failed++
}

export function finishProgress(
  electionId: string,
  result: { sent: number; failed: number; stopped: boolean; stopReason?: "quota" | "consecutive_failures"; lastError?: string },
): void {
  const p = tracker.get(electionId)
  if (!p) return
  p.running = false
  p.sent = result.sent
  p.failed = result.failed
  p.stopped = result.stopped
  p.stopReason = result.stopReason
  p.lastError = result.lastError
}

export function getProgress(electionId: string): ActivationProgressState | null {
  return tracker.get(electionId) ?? null
}
