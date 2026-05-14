"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import ElectionTestEmailButton from "@/components/admin/ElectionTestEmailButton"
import { useUnsavedChangesGuard } from "@/components/admin/UnsavedChangesGuard"
import ImageUploadField from "@/components/admin/ImageUploadField"

interface Props {
  electionId?: string
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
  }
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
        <a href="#" style="display:inline-block;background:oklch(0.36 0.10 255);color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
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

const STATUSES = ["DRAFT", "ACTIVE", "CLOSED", "COMPLETED"] as const
type Status = typeof STATUSES[number]
const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Draft", ACTIVE: "Active", CLOSED: "Closed", COMPLETED: "Completed",
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

export default function ElectionForm({ electionId, initialValues }: Props) {
  const router = useRouter()
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
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

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
    })
  }

  const baseline = useRef(snapshot())
  const isDirty = () => snapshot() !== baseline.current

  async function save(): Promise<string | false> {
    setSaving(true)
    setError("")

    const payload = {
      title,
      description: description || undefined,
      status,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      emailSubject: emailSubject || null,
      emailMessage: emailMessage || null,
      emailLogoUrl: emailLogoUrl || null,
      emailLogoDeleteUrl: emailLogoDeleteUrl || null,
      emailFooter: emailFooter || null,
      firstReminderDays: firstReminderDays !== "" ? parseInt(firstReminderDays, 10) : null,
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
    const id = await save()
    if (!id) return
    router.push(`/admin/elections/${id}/ballot`)
  }

  return (
    <div className="max-w-[800px]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
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
                placeholder="Election title"
                className={inputCls}
                style={inputStyle}
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
                className={inputCls}
                style={{ ...inputStyle, resize: "none" }}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />
            </div>
            <div>
              <VhLabel>Status</VhLabel>
              <div className="flex gap-1.5 flex-wrap">
                {STATUSES.map((s) => {
                  const active = status === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className="px-3.5 py-2 rounded-full text-[12.5px] font-medium cursor-pointer transition-colors"
                      style={{
                        border: `1px solid ${active ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
                        background: active ? "var(--vh-accent)" : "var(--vh-surface)",
                        color: active ? "white" : "var(--vh-ink-soft)",
                      }}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </VhCard>

        {/* Schedule */}
        <VhCard title="Schedule">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <VhLabel htmlFor="startsAt">Opens</VhLabel>
              <input
                id="startsAt"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={inputCls}
                style={inputStyle}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />
            </div>
            <div>
              <VhLabel htmlFor="endsAt">Closes</VhLabel>
              <input
                id="endsAt"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={inputCls}
                style={inputStyle}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />
            </div>
          </div>
        </VhCard>

        {/* Reminders */}
        <VhCard title="Voter reminders">
          <div>
            <VhLabel htmlFor="firstReminderDays">First reminder (days before close)</VhLabel>
            <input
              id="firstReminderDays"
              type="number"
              min={1}
              placeholder="Leave blank for no early reminder"
              value={firstReminderDays}
              onChange={(e) => setFirstReminderDays(e.target.value)}
              className={inputCls}
              style={{ ...inputStyle, maxWidth: 200 }}
              onFocus={onFocusIn}
              onBlur={onFocusOut}
            />
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--vh-muted)" }}>
              Sends a reminder to non-voters this many days before close. A 24-hour final notice always fires automatically.
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
                className={inputCls}
                style={inputStyle}
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
                disabled={saving}
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
                className={inputCls}
                style={{ ...inputStyle, resize: "none" }}
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
                className={inputCls}
                style={{ ...inputStyle, resize: "none" }}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
                style={{
                  border: "1px solid var(--vh-line-strong)",
                  background: "var(--vh-surface)",
                  color: "var(--vh-ink-soft)",
                }}
              >
                {showPreview ? "Hide preview" : "Preview email"}
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

      {showPreview && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] font-medium" style={{ color: "var(--vh-ink-soft)" }}>Email preview</p>
            <p className="text-[12px]" style={{ color: "var(--vh-muted)" }}>Approximate — clients may vary</p>
          </div>
          <iframe
            srcDoc={previewHtml}
            className="w-full rounded-[14px]"
            style={{ height: 480, border: "1px solid var(--vh-line)" }}
            sandbox=""
            title="Email preview"
          />
        </div>
      )}
    </div>
  )
}
