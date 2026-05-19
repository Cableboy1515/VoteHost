"use client"

import { useState, useRef } from "react"
import { BRAND_NAME } from "@/lib/branding"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { EyeIcon, EyeOffIcon } from "lucide-react"

const MAGIC = "VHBK"
// Must stay in sync with FORMAT_VERSION in lib/backup/format.ts
const MAX_FORMAT_VERSION = 2

type ParsedHeader = {
  type: "full" | "elections"
  createdAt: string
  schemaVersion: string
  counts: {
    elections: number
    voters: number
    votes: number
    adminUsers?: number
  }
}

function parseHeaderFromBytes(buf: ArrayBuffer): ParsedHeader {
  const view = new DataView(buf)
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  )
  if (magic !== MAGIC) throw new Error(`Not a ${BRAND_NAME} backup file`)
  const version = view.getUint16(4, false)
  if (version < 1 || version > MAX_FORMAT_VERSION) throw new Error(`Unsupported format version: ${version}`)
  const headerLen = view.getUint16(6, false)
  const jsonBytes = new Uint8Array(buf, 8, headerLen)
  const jsonStr = new TextDecoder().decode(jsonBytes)
  return JSON.parse(jsonStr) as ParsedHeader
}

function PassphraseInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Enter passphrase"}
        autoComplete="new-password"
        className="bg-white pr-9"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
        tabIndex={-1}
        aria-label={show ? "Hide passphrase" : "Show passphrase"}
      >
        {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}

type BackupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: "full" | "elections"
  hasActiveElections: boolean
}

function BackupDialog({ open, onOpenChange, type, hasActiveElections }: BackupDialogProps) {
  const [passphrase, setPassphrase] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const title = type === "full" ? "Full Backup" : "Elections Archive"
  const description =
    type === "full"
      ? "Exports all elections, voters, votes, admin users, and settings into a single encrypted archive."
      : "Exports elections, voters, votes, questions, and options only. Admin users and settings are not included."

  async function handleGenerate() {
    setError("")
    if (!passphrase) { setError("Passphrase is required."); return }
    if (passphrase !== confirm) { setError("Passphrases do not match."); return }
    setLoading(true)
    try {
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, passphrase }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Server error ${res.status}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const cd = res.headers.get("content-disposition") ?? ""
      const match = cd.match(/filename="([^"]+)"/)
      a.href = url
      a.download = match?.[1] ?? `votehost-${type}-backup.vhbak`
      a.click()
      URL.revokeObjectURL(url)
      onOpenChange(false)
      setPassphrase("")
      setConfirm("")
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-zinc-500">{description}</p>

        {hasActiveElections && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            There is an active election. The backup will include in-progress data. Voters who
            have not yet cast their ballot will have their tokens included in the archive.
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`passphrase-${type}`}>Passphrase</Label>
            <PassphraseInput
              id={`passphrase-${type}`}
              value={passphrase}
              onChange={setPassphrase}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`confirm-${type}`}>Confirm passphrase</Label>
            <PassphraseInput
              id={`confirm-${type}`}
              value={confirm}
              onChange={setConfirm}
              placeholder="Confirm passphrase"
            />
          </div>
          <p className="text-xs text-zinc-400">
            The archive is encrypted with AES-256-GCM. The passphrase cannot be recovered — store
            it somewhere safe.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter showCloseButton>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? "Generating…" : "Generate backup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type RestoreDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function RestoreDialog({ open, onOpenChange }: RestoreDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsedHeader, setParsedHeader] = useState<ParsedHeader | null>(null)
  const [fileParseError, setFileParseError] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [passphrase, setPassphrase] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  function reset() {
    setParsedHeader(null)
    setFileParseError("")
    setSelectedFile(null)
    setPassphrase("")
    setConfirmText("")
    setError("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setParsedHeader(null)
    setFileParseError("")
    setSelectedFile(file)
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const buf = ev.target?.result
      if (!(buf instanceof ArrayBuffer)) { setFileParseError("Could not read file."); return }
      try {
        const header = parseHeaderFromBytes(buf)
        setParsedHeader(header)
      } catch (err) {
        setFileParseError((err as Error).message)
      }
    }
    // Read first 512 bytes to parse the plaintext header
    reader.readAsArrayBuffer(file.slice(0, 512))
  }

  async function handleRestore() {
    setError("")
    if (!selectedFile) { setError("Please select a backup file."); return }
    if (!passphrase) { setError("Passphrase is required."); return }
    if (confirmText.toUpperCase() !== "RESTORE") {
      setError("Type RESTORE to confirm.")
      return
    }

    setLoading(true)
    try {
      const fd = new FormData()
      fd.append("file", selectedFile)
      fd.append("passphrase", passphrase)

      const res = await fetch("/api/admin/restore", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? `Server error ${res.status}`)
        return
      }

      if (data.type === "full") {
        window.location.href = "/login"
      } else {
        onOpenChange(false)
        reset()
        window.location.reload()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const canRestore =
    !!selectedFile &&
    !!parsedHeader &&
    !!passphrase &&
    confirmText.toUpperCase() === "RESTORE"

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restore from Backup</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <strong>Warning:</strong> Restoring will permanently overwrite the current data with the
          contents of the archive. This cannot be undone.
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="restore-file">Backup file (.vhbak)</Label>
            <Input
              ref={fileInputRef}
              id="restore-file"
              type="file"
              accept=".vhbak"
              onChange={handleFileChange}
              className="bg-white cursor-pointer"
            />
            {fileParseError && (
              <p className="text-xs text-red-600">{fileParseError}</p>
            )}
          </div>

          {parsedHeader && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm space-y-1">
              <div className="font-medium text-zinc-700">Archive details</div>
              <div className="text-zinc-600">
                <span className="font-medium">Type:</span>{" "}
                {parsedHeader.type === "full" ? "Full backup" : "Elections archive"}
              </div>
              <div className="text-zinc-600">
                <span className="font-medium">Created:</span>{" "}
                {new Date(parsedHeader.createdAt).toLocaleString()}
              </div>
              <div className="text-zinc-600">
                <span className="font-medium">Elections:</span> {parsedHeader.counts.elections}
                {" · "}
                <span className="font-medium">Voters:</span> {parsedHeader.counts.voters}
                {" · "}
                <span className="font-medium">Votes:</span> {parsedHeader.counts.votes}
                {typeof parsedHeader.counts.adminUsers === "number" && (
                  <>
                    {" · "}
                    <span className="font-medium">Admins:</span> {parsedHeader.counts.adminUsers}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="restore-passphrase">Passphrase</Label>
            <PassphraseInput
              id="restore-passphrase"
              value={passphrase}
              onChange={setPassphrase}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restore-confirm">
              Type <span className="font-mono font-semibold">RESTORE</span> to confirm
            </Label>
            <Input
              id="restore-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESTORE"
              className="bg-white font-mono"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            onClick={handleRestore}
            disabled={!canRestore || loading}
          >
            {loading ? "Restoring…" : "Restore"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Props = {
  hasActiveElections: boolean
}

export default function BackupRestorePanel({ hasActiveElections }: Props) {
  const [backupType, setBackupType] = useState<"full" | "elections" | null>(null)
  const [restoreOpen, setRestoreOpen] = useState(false)

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Backup &amp; Restore</h2>
      <p className="text-zinc-500 text-sm mb-4">
        Create an encrypted archive of your {BRAND_NAME} data, or restore from a previous backup. All
        archives are encrypted with AES-256-GCM using a passphrase you choose.
      </p>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold mb-1">Create a backup</h3>
          <p className="text-zinc-500 text-sm mb-3">
            A <strong>Full backup</strong> includes everything: elections, voters, votes, admin
            accounts, and settings. An <strong>Elections archive</strong> includes only election
            data — useful for migrating elections to a different server while keeping its admin
            accounts and settings intact.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBackupType("full")}>
              Full backup
            </Button>
            <Button variant="outline" onClick={() => setBackupType("elections")}>
              Elections archive
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-1">Restore</h3>
          <p className="text-zinc-500 text-sm mb-3">
            Upload a <code className="font-mono text-xs">.vhbak</code> file to restore data. The
            restore operation will wipe the data covered by the archive type before importing.
            Restores are refused while any election is active.
          </p>
          <Button variant="outline" onClick={() => setRestoreOpen(true)}>
            Restore from backup
          </Button>
        </div>
      </div>

      <BackupDialog
        open={backupType !== null}
        onOpenChange={(o) => { if (!o) setBackupType(null) }}
        type={backupType ?? "full"}
        hasActiveElections={hasActiveElections}
      />

      <RestoreDialog open={restoreOpen} onOpenChange={setRestoreOpen} />
    </div>
  )
}
