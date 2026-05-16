export const MAGIC = Buffer.from("VHBK", "ascii")
export const FORMAT_VERSION = 1
export const CURRENT_SCHEMA_VERSION = "1"
export const GCM_TAG_LENGTH = 16

export type BackupType = "full" | "elections"

export type BackupCounts = {
  elections: number
  questions: number
  options: number
  voters: number
  votes: number
  adminUsers?: number
  settings?: number
}

export type BackupHeader = {
  type: BackupType
  schemaVersion: string
  voteHostVersion: string
  createdAt: string
  kdf: {
    name: "scrypt"
    N: number
    r: number
    p: number
    saltB64: string
  }
  ivB64: string
  counts: BackupCounts
}

export function packHeader(header: BackupHeader): Buffer {
  const headerJson = Buffer.from(JSON.stringify(header), "utf8")
  const headerLen = headerJson.length

  // magic(4) + version(2) + headerLen(2) + headerJson
  const out = Buffer.allocUnsafe(4 + 2 + 2 + headerLen)
  MAGIC.copy(out, 0)
  out.writeUInt16BE(FORMAT_VERSION, 4)
  out.writeUInt16BE(headerLen, 6)
  headerJson.copy(out, 8)
  return out
}

export function unpackHeader(buf: Buffer): { header: BackupHeader; dataOffset: number } {
  if (buf.length < 8) throw new Error("File too small to be a VoteHost backup")

  const magic = buf.slice(0, 4)
  if (!magic.equals(MAGIC)) throw new Error("Not a VoteHost backup file (bad magic bytes)")

  const version = buf.readUInt16BE(4)
  if (version !== FORMAT_VERSION) throw new Error(`Unsupported backup format version: ${version}`)

  const headerLen = buf.readUInt16BE(6)
  if (buf.length < 8 + headerLen) throw new Error("Backup file is truncated (header incomplete)")

  const headerJson = buf.slice(8, 8 + headerLen).toString("utf8")
  const header = JSON.parse(headerJson) as BackupHeader

  return { header, dataOffset: 8 + headerLen }
}
