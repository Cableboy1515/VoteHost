"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;">
    <div style="font-family: sans-serif; max-width: 600px; margin: 24px auto; padding: 24px; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
      ${emailLogoUrl ? `<img src="${emailLogoUrl}" alt="" style="max-width: 100%; margin-bottom: 24px; display: block;" />` : ""}
      <h1 style="font-size: 24px; margin-bottom: 8px; margin-top: 0;">You're invited to vote</h1>
      <p style="color: #555; margin-bottom: 24px;">Hi [Voter Name],</p>
      <p style="margin-bottom: 24px;">
        You've been invited to participate in the election: <strong>${electionTitle || "[Election Title]"}</strong>
      </p>
      ${emailMessage ? `<p style="margin-bottom: 24px;">${emailMessage}</p>` : ""}
      <a href="#" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
        Vote Now
      </a>
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        This link is unique to you. Do not share it with others. It can only be used once.
      </p>
      ${emailFooter ? `<p style="color: #888; font-size: 12px; margin-top: 8px;">${emailFooter}</p>` : ""}
    </div>
  </body></html>`
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
  const [emailFooter, setEmailFooter] = useState(initialValues?.emailFooter ?? "")
  const [firstReminderDays, setFirstReminderDays] = useState(
    initialValues?.firstReminderDays != null ? String(initialValues.firstReminderDays) : ""
  )
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const previewHtml = buildPreviewHtml({ electionTitle: title, emailLogoUrl, emailMessage, emailFooter })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
      setError("Failed to save election")
      return
    }

    const data = await res.json()
    const id = electionId ?? data.id
    router.push(`/admin/elections/${id}/ballot`)
  }

  return (
    <div className="space-y-4 max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => { if (v !== null) setStatus(v) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="startsAt">Starts at (optional)</Label>
                <Input
                  id="startsAt"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="endsAt">Ends at (optional)</Label>
                <Input
                  id="endsAt"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voter reminders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <Label htmlFor="firstReminderDays">First reminder (days before close)</Label>
              <Input
                id="firstReminderDays"
                type="number"
                min={1}
                placeholder="Leave blank for no early reminder"
                value={firstReminderDays}
                onChange={(e) => setFirstReminderDays(e.target.value)}
              />
              <p className="text-xs text-zinc-400">
                Sends a &quot;you haven&apos;t voted yet&quot; email to non-voters this many days before the election ends. A second reminder always fires automatically 24 hours before close. Requires an end date.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Email customization <span className="text-zinc-400 font-normal text-sm">(optional)</span></CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="emailSubject">Subject line</Label>
              <Input
                id="emailSubject"
                placeholder={`You're invited to vote: ${title || "election title"}`}
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emailLogoUrl">Header image URL</Label>
              <Input
                id="emailLogoUrl"
                type="url"
                placeholder="https://example.com/logo.png"
                value={emailLogoUrl}
                onChange={(e) => setEmailLogoUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emailMessage">Intro message</Label>
              <Textarea
                id="emailMessage"
                placeholder="Custom text shown above the Vote Now button"
                rows={3}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emailFooter">Footer text</Label>
              <Textarea
                id="emailFooter"
                placeholder="e.g. Questions? Contact us at hello@example.com"
                rows={2}
                value={emailFooter}
                onChange={(e) => setEmailFooter(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Hide preview" : "Preview email"}
            </Button>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : electionId ? "Save Changes" : "Create & Continue"}
          </Button>
          {electionId && (
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      {showPreview && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-700">Email preview</p>
            <p className="text-xs text-zinc-400">Approximate — email clients may render slightly differently</p>
          </div>
          <iframe
            srcDoc={previewHtml}
            className="w-full rounded-lg border bg-white"
            style={{ height: 480 }}
            sandbox=""
            title="Email preview"
          />
        </div>
      )}
    </div>
  )
}
