"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import ElectionTestEmailButton from "@/components/admin/ElectionTestEmailButton"
import { useUnsavedChangesGuard } from "@/components/admin/UnsavedChangesGuard"
import ImageUploadField from "@/components/admin/ImageUploadField"
import ActivationConfirmDialog from "@/components/admin/ActivationConfirmDialog"
import EmailPreviewDialog from "@/components/admin/EmailPreviewDialog"
import { useDisplayTimeZone } from "@/components/TimezoneProvider"

interface Props {
  electionId?: string
  closedAt?: string | null
  closedByEmail?: string | null
  questionCount?: number
  voterCount?: number
  uninvitedCount?: number
  initialValues?: {
    title: string
    description?: string | null
    status: string
    startsAt?: string | null
    endsAt?: string | null
    emailSubject?: string | null
    emailMessage?: string | null
    emailLogoUrl?: string | null
    emailLogoDeleteUrl?: string | null
    emailFooter?: string | null
    firstReminderDays?: number | null
    autoActivate?: boolean | null
    autoSendResults?: boolean | null
    resultsEmailSentAt?: string | null
    firstVoteAt?: string | null
    weightingEnabled?: boolean | null
    quorumType?: string | null
    quorumValue?: number | null
  }
}

// TODO: These helpers use browser-local getHours()/getMinutes(), so the datetime-local <input>
// round-trip is in the browser's timezone, not the configured display timezone. Fixing this
// requires parsing "YYYY-MM-DDTHH:mm" as if it were in the configured tz and converting to UTC.
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dateOnly(localStr: string): string {
  return localStr.slice(0, 10)
}

function isMidnightLocal(iso: string): boolean {
  const d = new Date(iso)
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
}

function isEndOfDayLocal(iso: string): boolean {
  const d = new Date(iso)
  return d.getHours() === 23 && d.getMinutes() === 59 && d.getSeconds() === 59
}

function buildPreviewHtml(opts: {
  electionTitle: string
  emailLogoUrl: string
  emailMessage: string
  emailFooter: string
}) {
  const { electionTitle, emailLogoUrl, emailMessage, emailFooter } = opts
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:oklch(0.985 0.003 250);">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:24px auto;padding:0 16px;">
      <div style="background:#fff;border-radius:16px;padding:32px;border:1px solid oklch(0.92 0.006 250);">
        ${emailLogoUrl ? `<img src="${emailLogoUrl}" alt="" style="max-width:100%;margin-bottom:24px;display:block;border-radius:8px;" />` : ""}
        <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;letter-spacing:-0.02em;color:oklch(0.18 0.012 255);">You're invited to vote</h1>
        <p style="color:oklch(0.52 0.008 255);margin:0 0 20px;font-size:14px;">
          You've been invited to vote in <strong style="color:oklch(0.32 0.012 255);">${electionTitle || "[Election Title]"}</strong>
        </p>
        ${emailMessage ? `<p style="margin-bottom:20px;font-size:14px;color:oklch(0.32 0.012 255);">${emailMessage}</p>` : ""}
        <a href="#" style="display:inline-block;background:#3F66D9;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
          Vote now →
        </a>
        <p style="color:oklch(0.52 0.008 255);font-size:12px;margin-top:28px;padding-top:20px;border-top:1px solid oklch(0.92 0.006 250);">
          This link is unique to you. Do not share it. It can only be used once.
        </p>
        ${emailFooter ? `<p style="color:oklch(0.52 0.008 255);font-size:12px;margin-top:8px;">${emailFooter}</p>` : ""}
      </div>
    </div>
  </body></html>`
}

const STATUSES = ["DRAFT", "ACTIVE"] as const
type Status = typeof STATUSES[number]
const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Draft", ACTIVE: "Active",
}

const inputCls = "w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors"
const inputStyle = {
  border: "1px solid var(--vh-line-strong)",
  background: "var(--vh-surface)",
  color: "var(--vh-ink)",
  outline: "none",
}
function onFocusIn(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--vh-accent)"
  e.target.style.boxShadow = "var(--vh-ring)"
}
function onFocusOut(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--vh-line-strong)"
  e.target.style.boxShadow = "none"
}

function VhLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[13px] font-medium mb-1.5"
      style={{ color: "var(--vh-ink-soft)" }}
    >
      {children}
    </label>
  )
}

function VhCard({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div
      className="bg-vh-surface rounded-[16px] p-4 sm:p-[22px]"
      style={{ border: "1px solid var(--vh-line)" }}
    >
      {title && (
        <h3 className="text-[14px] font-semibold mb-3.5">{title}</h3>
      )}
      {children}
    </div>
  )
}

export default function ElectionForm({
  electionId,
  closedAt,
  closedByEmail,
  questionCount = 0,
  voterCount = 0,
  uninvitedCount = 0,
  initialValues,
}: Props) {
  const router = useRouter()
  const tz = useDisplayTimeZone()
  const [title, setTitle] = useState(initialValues?.title ?? "")
  const [description, setDescription] = useState(initialValues?.description ?? "")
  const [status, setStatus] = useState(initialValues?.status ?? "DRAFT")
  const [startsAt, setStartsAt] = useState(initialValues?.startsAt ? toLocalInput(initialValues.startsAt) : "")
  const [endsAt, setEndsAt] = useState(initialValues?.endsAt ? toLocalInput(initialValues.endsAt) : "")
  const [emailSubject, setEmailSubject] = useState(initialValues?.emailSubject ?? "")
  const [emailMessage, setEmailMessage] = useState(initialValues?.emailMessage ?? "")
  const [emailLogoUrl, setEmailLogoUrl] = useState(initialValues?.emailLogoUrl ?? "")
  const [emailLogoDeleteUrl, setEmailLogoDeleteUrl] = useState(initialValues?.emailLogoDeleteUrl ?? "")
  const [emailFooter, setEmailFooter] = useState(initialValues?.emailFooter ?? "")
  const [firstReminderDays, setFirstReminderDays] = useState(
    initialValues?.firstReminderDays != null ? String(initialValues.firstReminderDays) : ""
  )
  const [autoActivate, setAutoActivate] = useState(initialValues?.autoActivate ?? true)
  const [autoSendResults, setAutoSendResults] = useState(initialValues?.autoSendResults ?? false)
  const [startsAtAllDay, setStartsAtAllDay] = useState(
    initialValues?.startsAt ? isMidnightLocal(initialValues.startsAt) : true
  )
  const [endsAtAllDay, setEndsAtAllDay] = useState(
    initialValues?.endsAt ? isEndOfDayLocal(initialValues.endsAt) : true
  )
  const [weightingEnabled, setWeightingEnabled] = useState(initialValues?.weightingEnabled ?? false)
  const [quorumType, setQuorumType] = useState<"NONE" | "PERCENT" | "COUNT">(
    (initialValues?.quorumType as "NONE" | "PERCENT" | "COUNT") ?? "NONE"
  )
  const [quorumValue, setQuorumValue] = useState(
    initialValues?.quorumValue != null ? String(initialValues.quorumValue) : ""
  )
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [confirmActivateOpen, setConfirmActivateOpen] = useState(false)
  const [confirmActivating, setConfirmActivating] = useState(false)
  const [pastStartConfirmOpen, setPastStartConfirmOpen] = useState(false)

  const previewHtml = buildPreviewHtml({ electionTitle: title, emailLogoUrl, emailMessage, emailFooter })

  function snapshot() {
    return JSON.stringify({
      title: title.trim(),
      description: description.trim(),
      status,
      startsAt,
      endsAt,
      emailSubject: emailSubject.trim(),
      emailMessage: emailMessage.trim(),
      emailLogoUrl: emailLogoUrl.trim(),
      emailLogoDeleteUrl: emailLogoDeleteUrl.trim(),
      emailFooter: emailFooter.trim(),
      firstReminderDays,
      autoActivate,
      autoSendResults,
      startsAtAllDay,
      endsAtAllDay,
      weightingEnabled,
      quorumType,
      quorumValue,
    })
  }

  const baseline = useRef(snapshot())
  const isDirty = () => snapshot() !== baseline.current
  const skipResetOnNextClose = useRef(false)

  async function save(overrideStatus?: string): Promise<string | false> {
    setSaving(true)
    setError("")

    const payload = {
      title,
      description: description || undefined,
      status: overrideStatus ?? status,
      startsAt: startsAt
        ? (startsAtAllDay
            ? new Date(`${dateOnly(startsAt)}T00:00:00`).toISOString()
            : new Date(startsAt).toISOString())
        : null,
      endsAt: endsAt
        ? (endsAtAllDay
            ? new Date(`${dateOnly(endsAt)}T23:59:59.999`).toISOString()
            : new Date(endsAt).toISOString())
        : null,
      emailSubject: emailSubject || null,
      emailMessage: emailMessage || null,
      emailLogoUrl: emailLogoUrl || null,
      emailLogoDeleteUrl: emailLogoDeleteUrl || null,
      emailFooter: emailFooter || null,
      firstReminderDays: firstReminderDays !== "" ? parseInt(firstReminderDays, 10) : null,
      autoActivate,
      autoSendResults,
      weightingEnabled,
      quorumType,
      quorumValue: quorumType !== "NONE" && quorumValue !== "" ? parseInt(quorumValue, 10) : null,
    }

    const url = electionId ? `/api/elections/${electionId}` : "/api/elections"
    const method = electionId ? "PATCH" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    setSaving(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const issues: Array<{ path: (string | number)[]; message: string }> = Array.isArray(body?.error) ? body.error : []
      if (issues.length > 0) {
        const LABELS: Record<string, string> = {
          title: "Title",
          description: "Description",
          startsAt: "Start date",
          endsAt: "End date",
          emailSubject: "Email subject",
          emailMessage: "Email message",
          emailLogoUrl: "Header image URL",
          emailLogoDeleteUrl: "Header image delete URL",
          emailFooter: "Email footer",
          firstReminderDays: "First reminder",
        }
        setError(
          issues
            .map((i) => `${LABELS[String(i.path[0])] ?? String(i.path[0])}: ${i.message}`)
            .join(" · ")
        )
      } else {
        setError("Failed to save election")
      }
      return false
    }

    const data = await res.json()
    baseline.current = snapshot()
    return electionId ?? data.id
  }

  useUnsavedChangesGuard({ isDirty, save: async () => !!(await save()) })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (initialValues?.status === "DRAFT" && status === "ACTIVE") {
      setConfirmActivateOpen(true)
      return
    }
    if (
      initialValues?.status === "DRAFT" &&
      status === "DRAFT" &&
      autoActivate &&
      effectiveStartsAtMoment != null &&
      !isStartsAtFuture
    ) {
      setPastStartConfirmOpen(true)
      return
    }
    const id = await save()
    if (!id) return
    router.push(`/elections/${id}/ballot`)
  }

  function handleConfirmActivateOpenChange(next: boolean) {
    if (!next) {
      if (skipResetOnNextClose.current) {
        skipResetOnNextClose.current = false
      } else {
        setStatus(initialValues?.status ?? "DRAFT")
      }
    }
    setConfirmActivateOpen(next)
  }

  async function handleConfirmActivate() {
    skipResetOnNextClose.current = true
    setConfirmActivating(true)
    const id = await save()
    setConfirmActivating(false)
    setConfirmActivateOpen(false)
    if (!id) return
    router.push(`/elections/${id}/ballot`)
  }

  async function handleConfirmPastStart() {
    setConfirmActivating(true)
    const id = await save("ACTIVE")
    setConfirmActivating(false)
    setPastStartConfirmOpen(false)
    if (!id) return
    router.push(`/elections/${id}/ballot`)
  }

  const effectiveStartsAtMoment = startsAt
    ? (startsAtAllDay
        ? new Date(`${dateOnly(startsAt)}T00:00:00`)
        : new Date(startsAt))
    : null
  const isStartsAtFuture = effectiveStartsAtMoment != null && effectiveStartsAtMoment > new Date()
  const isActive = initialValues?.status === "ACTIVE"
  const isCompleted = initialValues?.status === "COMPLETED"
  const firstVoteAt = initialValues?.firstVoteAt ?? null
  const settingsLocked = isCompleted || !!firstVoteAt
  const opensLocked = isActive || (status === "ACTIVE" && initialValues?.status === "DRAFT")
  const closesMinIso = isActive && initialValues?.endsAt ? toLocalInput(initialValues.endsAt) : undefined

  const firstReminderDaysNum = parseInt(firstReminderDays, 10)
  const endsAtDate = endsAt
    ? new Date(endsAtAllDay ? `${dateOnly(endsAt)}T23:59:59` : endsAt)
    : null
  const reminderSendDate =
    endsAtDate && !isNaN(firstReminderDaysNum) && firstReminderDaysNum > 0
      ? new Date(endsAtDate.getTime() - firstReminderDaysNum * 86_400_000)
      : null
  const reminderDateStr = reminderSendDate
    ? reminderSendDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz })
    : null

  return (
    <div className="max-w-[800px]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {settingsLocked && (
          <div
            className="rounded-[10px] px-4 py-3 text-[13px]"
            style={{
              background: "var(--vh-surface-2)",
              color: "var(--vh-ink-soft)",
              border: "1px solid var(--vh-line-strong)",
            }}
          >
            {isCompleted
              ? "This election is completed and its record is locked. To run another vote, create a new election."
              : "Voting has started — settings are locked except the close date. Push Closes later if you need more time, or use Discard & Reopen to restart."}
          </div>
        )}
        {/* Basics */}
        <VhCard title="Basics">
          <div className="flex flex-col gap-3.5">
            <div>
              <VhLabel htmlFor="title">Title</VhLabel>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoComplete="off"
                placeholder="Election title"
                disabled={settingsLocked}
                className={inputCls}
                style={{ ...inputStyle, ...(settingsLocked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />
            </div>
            <div>
              <VhLabel htmlFor="description">Description (optional)</VhLabel>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Shown to voters at the top of their ballot"
                disabled={settingsLocked}
                className={inputCls}
                style={{ ...inputStyle, resize: "none", ...(settingsLocked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />
            </div>
            <div>
              <VhLabel>Status</VhLabel>
              {status === "COMPLETED" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-[12.5px] font-medium border"
                    style={{
                      background: "var(--vh-accent-soft)",
                      color: "var(--vh-accent-strong)",
                      borderColor: "oklch(0.85 0.05 255)",
                    }}
                  >
                    Completed
                  </span>
                  <span className="text-[12.5px]" style={{ color: "var(--vh-muted)" }}>
                    {closedAt && closedByEmail
                      ? `Closed early on ${new Date(closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz })} by ${closedByEmail}.`
                      : closedAt
                      ? `Closed early on ${new Date(closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz })}.`
                      : "Auto-closed at scheduled end date."}
                    {" "}The record is locked — to run another vote, create a new election.
                  </span>
                </div>
              ) : (
                <div className="flex gap-1.5 flex-wrap items-center">
                  {STATUSES.map((s) => {
                    const active = status === s
                    // Disable the ACTIVE pill if preconditions aren't met.
                    const activating = s === "ACTIVE" && status === "DRAFT"
                    const disabledReason = activating && questionCount === 0
                      ? "Add at least one race on the Ballot tab before activating"
                      : activating && voterCount === 0
                      ? "Add at least one voter before activating"
                      // Disable the DRAFT pill while the election is active — use Cancel Activation instead.
                      : s === "DRAFT" && initialValues?.status === "ACTIVE"
                      ? "To return this election to Draft, use Cancel Activation in the Danger Zone below"
                      : undefined
                    const isDisabled = !!disabledReason
                    const pill = (
                      <button
                        key={s}
                        type="button"
                        onClick={isDisabled ? undefined : () => {
                          setStatus(s)
                          if (s === "ACTIVE" && status === "DRAFT") {
                            setStartsAt(toLocalInput(new Date().toISOString()))
                          }
                        }}
                        disabled={isDisabled}
                        className="px-3.5 py-2 rounded-full text-[12.5px] font-medium transition-colors"
                        style={{
                          border: `1px solid ${active ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
                          background: active ? "var(--vh-accent)" : "var(--vh-surface)",
                          color: active ? "white" : "var(--vh-ink-soft)",
                          cursor: isDisabled ? "not-allowed" : "pointer",
                          opacity: isDisabled ? 0.4 : 1,
                        }}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    )
                    if (!isDisabled || !disabledReason) return pill
                    return (
                      <span key={s} className="relative group inline-flex">
                        {pill}
                        <span
                          role="tooltip"
                          className="pointer-events-none opacity-0 group-hover:opacity-100 absolute bottom-full left-0 mb-2 w-max max-w-[280px] whitespace-normal rounded-[6px] px-2.5 py-1.5 text-[12px] leading-snug text-white"
                          style={{ background: "var(--vh-ink)" }}
                        >
                          {disabledReason}
                          <span
                            className="absolute top-full left-4 border-4 border-transparent"
                            style={{ borderTopColor: "var(--vh-ink)" }}
                          />
                        </span>
                      </span>
                    )
                  })}
                  {status === "DRAFT" && questionCount > 0 && voterCount > 0 && (
                    <p className="text-[12px] w-full mt-0.5" style={{ color: "var(--vh-muted)" }}>
                      Saving as Active will prompt you to confirm before opening voting and sending invitations.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </VhCard>

        {/* Schedule */}
        <VhCard title="Schedule">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <VhLabel htmlFor="startsAt">Opens</VhLabel>
              {startsAtAllDay ? (
                <input
                  id="startsAt"
                  type="date"
                  value={dateOnly(startsAt)}
                  onChange={(e) => setStartsAt(e.target.value ? `${e.target.value}T00:00` : "")}
                  disabled={opensLocked || settingsLocked}
                  className={inputCls}
                  style={{ ...inputStyle, ...(opensLocked || settingsLocked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                  onFocus={onFocusIn}
                  onBlur={onFocusOut}
                />
              ) : (
                <input
                  id="startsAt"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  disabled={opensLocked || settingsLocked}
                  className={inputCls}
                  style={{ ...inputStyle, ...(opensLocked || settingsLocked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                  onFocus={onFocusIn}
                  onBlur={onFocusOut}
                />
              )}
              <div className="mt-1.5 flex items-center gap-3 text-[12px]" style={{ color: "var(--vh-muted)" }}>
                <label
                  className="flex items-center gap-1.5"
                  style={{ cursor: opensLocked || settingsLocked ? "not-allowed" : "pointer", opacity: opensLocked || settingsLocked ? 0.5 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={startsAtAllDay}
                    onChange={(e) => setStartsAtAllDay(e.target.checked)}
                    disabled={opensLocked || settingsLocked}
                    className="flex-shrink-0"
                  />
                  All day
                </label>
                {startsAt && !opensLocked && !settingsLocked && (
                  <button type="button" onClick={() => setStartsAt("")} className="underline">
                    Clear
                  </button>
                )}
              </div>
              {opensLocked && (
                <p className="mt-1.5 text-[12px]" style={{ color: "var(--vh-muted)" }}>
                  {isActive
                    ? "Locked — election is in progress. To change, use Cancel Activation (if no votes cast) or Discard & Reopen at the bottom of this page."
                    : "Activating this election will start it immediately on save."}
                </p>
              )}
            </div>
            <div>
              <VhLabel htmlFor="endsAt">Closes</VhLabel>
              {endsAtAllDay ? (
                <input
                  id="endsAt"
                  type="date"
                  value={dateOnly(endsAt)}
                  onChange={(e) => setEndsAt(e.target.value ? `${e.target.value}T00:00` : "")}
                  min={closesMinIso ? dateOnly(closesMinIso) : undefined}
                  disabled={isCompleted}
                  className={inputCls}
                  style={{ ...inputStyle, ...(isCompleted ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                  onFocus={onFocusIn}
                  onBlur={onFocusOut}
                />
              ) : (
                <input
                  id="endsAt"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  min={closesMinIso}
                  disabled={isCompleted}
                  className={inputCls}
                  style={{ ...inputStyle, ...(isCompleted ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                  onFocus={onFocusIn}
                  onBlur={onFocusOut}
                />
              )}
              <div className="mt-1.5 flex items-center gap-3 text-[12px]" style={{ color: "var(--vh-muted)" }}>
                <label
                  className="flex items-center gap-1.5"
                  style={{ cursor: isActive || isCompleted ? "not-allowed" : "pointer", opacity: isActive || isCompleted ? 0.5 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={endsAtAllDay}
                    onChange={(e) => setEndsAtAllDay(e.target.checked)}
                    disabled={isActive || isCompleted}
                    className="flex-shrink-0"
                  />
                  All day
                </label>
                {endsAt && !isActive && !isCompleted && (
                  <button type="button" onClick={() => setEndsAt("")} className="underline">
                    Clear
                  </button>
                )}
              </div>
              {isActive && (
                <p className="mt-1.5 text-[12px]" style={{ color: "var(--vh-muted)" }}>
                  Election is in progress — Closes can only be extended to a later time. Voters who haven&apos;t voted yet will be notified.
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--vh-line)" }}>
            <label
              className="flex items-center gap-2.5"
              style={{
                opacity: isStartsAtFuture && !settingsLocked ? 1 : 0.5,
                cursor: isStartsAtFuture && !settingsLocked ? "pointer" : "not-allowed",
              }}
            >
              <input
                type="checkbox"
                checked={autoActivate}
                disabled={!isStartsAtFuture || settingsLocked}
                onChange={(e) => setAutoActivate(e.target.checked)}
                className="flex-shrink-0"
              />
              <span className="text-[13px]" style={{ color: "var(--vh-ink-soft)" }}>
                Auto-start — activate and send invitations automatically when the Opens {startsAtAllDay ? "date" : "date and time"} arrives
              </span>
            </label>
            {!isStartsAtFuture && (
              <p className="mt-1.5 pl-6 text-[12px]" style={{ color: "var(--vh-muted)" }}>
                {!startsAt
                  ? "Pick an Opens date to enable auto-start."
                  : opensLocked
                  ? "Auto-start isn't needed — saving as Active will start this election immediately."
                  : "Auto-start requires a future Opens time. Use Activate now from the Voters tab to start immediately."}
              </p>
            )}
          </div>
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--vh-line)" }}>
            {(() => {
              const alreadySent = !!initialValues?.resultsEmailSentAt
              return (
                <>
                  <label
                    className="flex items-center gap-2.5"
                    style={{
                      opacity: alreadySent ? 0.5 : 1,
                      cursor: alreadySent ? "not-allowed" : "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={autoSendResults}
                      disabled={alreadySent}
                      onChange={(e) => setAutoSendResults(e.target.checked)}
                      className="flex-shrink-0"
                    />
                    <span className="text-[13px]" style={{ color: "var(--vh-ink-soft)" }}>
                      Auto-send results — email results to voters automatically when the election closes
                    </span>
                  </label>
                  {alreadySent && (
                    <p className="mt-1.5 pl-6 text-[12px]" style={{ color: "var(--vh-muted)" }}>
                      Results email already sent on{" "}
                      {new Date(initialValues!.resultsEmailSentAt!).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: tz,
                      })}
                      .
                    </p>
                  )}
                </>
              )
            })()}
          </div>
        </VhCard>

        {/* Reminders */}
        <VhCard title="Voter reminders">
          <div>
            <VhLabel htmlFor="firstReminderDays">First reminder (days before close)</VhLabel>
            <div className="flex items-center gap-3">
              <input
                id="firstReminderDays"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="Leave blank for no early reminder"
                value={firstReminderDays}
                onChange={(e) => setFirstReminderDays(e.target.value)}
                disabled={!endsAt || settingsLocked}
                className={inputCls}
                style={{ ...inputStyle, maxWidth: 200, opacity: !endsAt || settingsLocked ? 0.5 : 1 }}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />
              {reminderDateStr && (
                <span className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
                  Sends {reminderDateStr}
                </span>
              )}
            </div>
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--vh-muted)" }}>
              {!endsAt
                ? "Add an end date in the Schedule section to enable reminders."
                : "Sends a reminder to non-voters this many days before close. A 24-hour final notice always fires automatically."}
            </p>
          </div>
        </VhCard>

        {/* Weighted voting */}
        <VhCard title="Weighted voting">
          <div className="flex flex-col gap-3">
            <label
              className="flex items-center gap-2.5"
              style={{ cursor: settingsLocked ? "not-allowed" : "pointer", opacity: settingsLocked ? 0.5 : 1 }}
            >
              <input
                type="checkbox"
                checked={weightingEnabled}
                disabled={settingsLocked}
                onChange={(e) => setWeightingEnabled(e.target.checked)}
                className="flex-shrink-0"
              />
              <span className="text-[13px]" style={{ color: "var(--vh-ink-soft)" }}>
                Enable weighted voting — each voter can carry a different vote weight
              </span>
            </label>
            <p className="text-[12.5px]" style={{ color: "var(--vh-muted)" }}>
              {weightingEnabled
                ? "Weights are set per-voter on the Voters tab. Tallies, quorum, and exports will all use weighted totals. Lock-in at first vote — weights cannot change once a voter has cast their ballot."
                : "Off by default. Turn on for HOA unit-based voting, shareholder votes, co-op allocations, or any election where voters should carry unequal weight."}
            </p>
          </div>
        </VhCard>

        {/* Quorum */}
        <VhCard title="Quorum">
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5 flex-wrap">
              {(["NONE", "PERCENT", "COUNT"] as const).map((t) => {
                const labels = { NONE: "No quorum", PERCENT: "% of voters", COUNT: "Fixed count" }
                const active = quorumType === t
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={settingsLocked}
                    onClick={() => { setQuorumType(t); if (t === "NONE") setQuorumValue("") }}
                    className="px-2.5 py-1.5 rounded-[8px] text-[12.5px] transition-colors"
                    style={{
                      border: `1px solid ${active ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
                      background: active ? "var(--vh-accent-soft)" : "var(--vh-surface)",
                      color: active ? "var(--vh-accent-strong)" : "var(--vh-ink-soft)",
                      fontWeight: active ? 500 : 400,
                      cursor: settingsLocked ? "not-allowed" : "pointer",
                      opacity: settingsLocked ? 0.6 : 1,
                    }}
                  >
                    {labels[t]}
                  </button>
                )
              })}
            </div>

            {quorumType !== "NONE" && (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={quorumType === "PERCENT" ? 100 : undefined}
                  inputMode="numeric"
                  placeholder={quorumType === "PERCENT" ? "e.g. 50" : "e.g. 10"}
                  value={quorumValue}
                  onChange={(e) => setQuorumValue(e.target.value)}
                  disabled={settingsLocked}
                  className={inputCls}
                  style={{ ...inputStyle, maxWidth: 120, opacity: settingsLocked ? 0.5 : 1 }}
                  onFocus={onFocusIn}
                  onBlur={onFocusOut}
                />
                <span className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
                  {quorumType === "PERCENT" ? "% of eligible voters must participate" : "voters must participate"}
                </span>
              </div>
            )}

            <p className="text-[12.5px]" style={{ color: "var(--vh-muted)" }}>
              {quorumType === "NONE"
                ? "No minimum participation required. Results are valid regardless of turnout."
                : quorumType === "PERCENT"
                ? "Results will show whether the required participation threshold was met. The election closes and results are reported either way — quorum is informational."
                : "A fixed number of voters must participate for the quorum indicator to show as met."}
            </p>
          </div>
        </VhCard>

        {/* Email */}
        <VhCard>
          <h3 className="text-[14px] font-semibold mb-3.5">
            Email customization{" "}
            <span className="font-normal text-[13px]" style={{ color: "var(--vh-muted)" }}>(optional)</span>
          </h3>
          <div className="flex flex-col gap-3.5">
            <div>
              <VhLabel htmlFor="emailSubject">Subject line</VhLabel>
              <input
                id="emailSubject"
                placeholder={`You're invited to vote: ${title || "election title"}`}
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                autoComplete="off"
                disabled={settingsLocked}
                className={inputCls}
                style={{ ...inputStyle, ...(settingsLocked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />
            </div>
            <div>
              <VhLabel>Header image</VhLabel>
              <ImageUploadField
                preset="logo"
                url={emailLogoUrl}
                setUrl={setEmailLogoUrl}
                deleteUrl={emailLogoDeleteUrl}
                setDeleteUrl={setEmailLogoDeleteUrl}
                disabled={saving || settingsLocked}
              />
            </div>
            <div>
              <VhLabel htmlFor="emailMessage">Intro message</VhLabel>
              <textarea
                id="emailMessage"
                placeholder="Custom text shown above the Vote Now button"
                rows={3}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                disabled={settingsLocked}
                className={inputCls}
                style={{ ...inputStyle, resize: "none", ...(settingsLocked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />
            </div>
            <div>
              <VhLabel htmlFor="emailFooter">Footer text</VhLabel>
              <textarea
                id="emailFooter"
                placeholder="e.g. Questions? Contact us at hello@example.com"
                rows={2}
                value={emailFooter}
                onChange={(e) => setEmailFooter(e.target.value)}
                disabled={settingsLocked}
                className={inputCls}
                style={{ ...inputStyle, resize: "none", ...(settingsLocked ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
                style={{
                  border: "1px solid var(--vh-line-strong)",
                  background: "var(--vh-surface)",
                  color: "var(--vh-ink-soft)",
                }}
              >
                Preview email
              </button>
              {electionId && <ElectionTestEmailButton electionId={electionId} />}
            </div>
          </div>
        </VhCard>

        {error && (
          <p className="text-[13px]" style={{ color: "var(--vh-danger)" }}>{error}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-5 py-2.5 rounded-[10px] text-[14px] font-medium text-white transition-colors disabled:opacity-60"
            style={{ background: "var(--vh-accent)" }}
            onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-accent)" }}
          >
            {saving ? "Saving…" : electionId ? "Save changes" : "Create & continue"}
          </button>
          {electionId && (
            <button
              type="button"
              onClick={() => router.back()}
              className="w-full sm:w-auto px-5 py-2.5 rounded-[10px] text-[14px] transition-colors"
              style={{
                border: "1px solid var(--vh-line-strong)",
                background: "var(--vh-surface)",
                color: "var(--vh-ink-soft)",
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <EmailPreviewDialog open={showPreview} onOpenChange={setShowPreview} html={previewHtml} />

      <ActivationConfirmDialog
        open={confirmActivateOpen}
        onOpenChange={handleConfirmActivateOpenChange}
        electionTitle={title}
        uninvitedCount={uninvitedCount}
        onConfirm={handleConfirmActivate}
        confirming={confirmActivating}
      />

      <ActivationConfirmDialog
        open={pastStartConfirmOpen}
        onOpenChange={setPastStartConfirmOpen}
        electionTitle={title}
        uninvitedCount={uninvitedCount}
        onConfirm={handleConfirmPastStart}
        confirming={confirmActivating}
      />
    </div>
  )
}
