"use client"

import { useEffect, useState } from "react"
import { passwordStrength, STRENGTH_COLOR } from "@/lib/password-strength"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SecurityPanel({ role }: { role: string }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const strength = passwordStrength(newPassword)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setStatus("error")
      setErrorMsg("New passwords do not match")
      return
    }
    setSaving(true)
    setStatus("idle")
    setErrorMsg("")
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus("saved")
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
        setTimeout(() => setStatus("idle"), 4000)
      } else {
        setStatus("error")
        setErrorMsg(data.error ?? "Failed to change password")
      }
    } catch {
      setStatus("error")
      setErrorMsg("Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Change password</h2>
        <p className="text-zinc-500 text-sm mb-4">
          Enter your current password to set a new one. You will receive a confirmation email after saving.
        </p>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-white max-w-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="bg-white max-w-sm"
            />
            {newPassword.length > 0 && (
              <div className="max-w-sm">
                <div className="flex gap-1 mt-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex-1 h-1 rounded-full transition-colors"
                      style={{ background: i <= strength.segments ? STRENGTH_COLOR[strength.segments] : "var(--vh-surface-3)" }}
                    />
                  ))}
                </div>
                <p className="text-xs text-zinc-400 mt-1">{strength.label} — at least 8 characters</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="bg-white max-w-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Change password"}
            </Button>
            {status === "saved" && <span className="text-sm text-green-600">Password updated. A confirmation email has been sent.</span>}
            {status === "error" && <span className="text-sm text-red-600">{errorMsg}</span>}
          </div>
        </form>
      </div>

      {role === "ADMIN" && (
        <>
          <hr className="border-zinc-200" />
          <AdminSecuritySettings />
        </>
      )}
    </div>
  )
}

function AdminSecuritySettings() {
  const [notifyAdmins, setNotifyAdmins] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")

  useEffect(() => {
    fetch("/api/settings/security")
      .then((r) => r.json())
      .then((d) => { setNotifyAdmins(d.notifyAdminsOnReset ?? false); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleToggle(checked: boolean) {
    setSaving(true)
    setStatus("idle")
    try {
      const res = await fetch("/api/settings/security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyAdminsOnReset: checked }),
      })
      if (res.ok) {
        setNotifyAdmins(checked)
        setStatus("saved")
        setTimeout(() => setStatus("idle"), 3000)
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Security notifications</h2>
      <p className="text-zinc-500 text-sm mb-4">
        When enabled, all administrators will receive an email whenever a password reset is requested or completed by any user.
        Useful as an audit signal for security-conscious installations. Off by default.
      </p>
      {loading ? (
        <p className="text-zinc-400 text-sm">Loading…</p>
      ) : (
        <div className="flex items-start gap-3">
          <button
            role="switch"
            aria-checked={notifyAdmins}
            disabled={saving}
            onClick={() => handleToggle(!notifyAdmins)}
            className="mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-60"
            style={{ background: notifyAdmins ? "var(--vh-accent)" : "var(--vh-surface-3)" }}
          >
            <span
              className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              style={{ transform: notifyAdmins ? "translateX(16px)" : "translateX(0)" }}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-zinc-700">Email administrators about password reset activity</p>
            {status === "saved" && <p className="text-xs text-green-600 mt-0.5">Saved.</p>}
            {status === "error" && <p className="text-xs text-red-600 mt-0.5">Failed to save.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
