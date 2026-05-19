"use client"

import { useState } from "react"
import { BRAND_NAME } from "@/lib/branding"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export default function SetupForm() {
  const router = useRouter()
  const [token, setToken] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    setLoading(true)
    setError("")

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role: "ADMIN", setupToken: token }),
    })

    setLoading(false)
    if (res.ok) {
      router.push("/login")
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Failed to create account")
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Set up {BRAND_NAME}</CardTitle>
        <p className="text-sm text-zinc-500">
          Create your admin account. The setup token is the <code className="font-mono bg-zinc-100 px-0.5 rounded text-xs">SETUP_TOKEN</code> value in your server&apos;s <code className="font-mono bg-zinc-100 px-0.5 rounded text-xs">.env</code> file.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="setup-token">Setup token</Label>
            <Input
              id="setup-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              autoFocus
              autoComplete="off"
              placeholder="Paste from .env — SETUP_TOKEN=..."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create admin account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
