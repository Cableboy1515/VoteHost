export type ActivationProgressState = {
  running: boolean
  sent: number
  failed: number
  total: number
  stopped: boolean
  stopReason?: "quota" | "consecutive_failures" | "manual"
  lastError?: string
  startedAt: number
  stopRequested: boolean
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
    stopRequested: false,
  })
}

export function requestStop(electionId: string): void {
  const p = tracker.get(electionId)
  if (p) p.stopRequested = true
}

export function isStopRequested(electionId: string): boolean {
  return tracker.get(electionId)?.stopRequested ?? false
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
  result: { sent: number; failed: number; stopped: boolean; stopReason?: "quota" | "consecutive_failures" | "manual"; lastError?: string },
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
