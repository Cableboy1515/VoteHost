import { db } from "@/lib/db"

export const SETTING_KEY = "display_time_zone"

// Neutral default — admins can set their region via System Settings → General.
// The DISPLAY_TIME_ZONE env var acts as a first-boot override if set.
const FALLBACK_TZ = "UTC"

let cachedTz: string | null = null

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Server-only. Lookup order: in-memory cache → DB → env → fallback.
// Single-instance cache — multi-instance deployments would need pub/sub invalidation.
export async function getDisplayTimeZone(): Promise<string> {
  if (cachedTz) return cachedTz

  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } })
  if (row?.value && isValidTimeZone(row.value)) {
    cachedTz = row.value
    return cachedTz
  }

  const envTz = process.env.DISPLAY_TIME_ZONE
  if (envTz && isValidTimeZone(envTz)) {
    cachedTz = envTz
    return cachedTz
  }

  cachedTz = FALLBACK_TZ
  return cachedTz
}

export function invalidateTimezoneCache(): void {
  cachedTz = null
}

const DEFAULT_DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
}

export function formatDateInTz(
  date: string | Date,
  tz: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString("en-US", { ...DEFAULT_DATE_TIME_OPTS, ...opts, timeZone: tz })
}

export function formatDateOnlyInTz(date: string | Date, tz: string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: tz,
  })
}

export const COMMON_TIMEZONES: string[] = [
  "UTC",
  // United States
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  // Canada
  "America/St_Johns",
  "America/Halifax",
  "America/Toronto",
  "America/Winnipeg",
  "America/Edmonton",
  "America/Vancouver",
  // Europe
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Moscow",
  // Middle East / Africa
  "Asia/Dubai",
  "Africa/Johannesburg",
  // Asia / Pacific
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Pacific/Auckland",
]
