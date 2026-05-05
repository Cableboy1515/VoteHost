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
  }
}

export default function ElectionForm({ electionId, initialValues }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initialValues?.title ?? "")
  const [description, setDescription] = useState(initialValues?.description ?? "")
  const [status, setStatus] = useState(initialValues?.status ?? "DRAFT")
  const [startsAt, setStartsAt] = useState(initialValues?.startsAt?.slice(0, 16) ?? "")
  const [endsAt, setEndsAt] = useState(initialValues?.endsAt?.slice(0, 16) ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

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
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{electionId ? "Edit Election" : "New Election"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
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
      </CardContent>
    </Card>
  )
}
