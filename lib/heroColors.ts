export type HeroColor = {
  key: string
  label: string
  base: string
  strong: string
}

export const HERO_COLORS: HeroColor[] = [
  { key: "blue",    label: "Blue",    base: "#3F66D9", strong: "#2D4DBA" },
  { key: "teal",    label: "Teal",    base: "#0D9488", strong: "#0F766E" },
  { key: "emerald", label: "Emerald", base: "#059669", strong: "#047857" },
  { key: "amber",   label: "Amber",   base: "#D97706", strong: "#B45309" },
  { key: "rose",    label: "Rose",    base: "#E11D48", strong: "#BE123C" },
  { key: "violet",  label: "Violet",  base: "#7C3AED", strong: "#6D28D9" },
  { key: "slate",   label: "Slate",   base: "#475569", strong: "#334155" },
]

export const HERO_COLOR_KEYS = HERO_COLORS.map((c) => c.key) as [string, ...string[]]

export const DEFAULT_HERO_COLOR_KEY = "blue"

function darkenHex(hex: string, factor = 0.82): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor)
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor)
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

export function isCustomHex(key: string | null | undefined): key is string {
  return typeof key === "string" && /^#[0-9a-fA-F]{6}$/i.test(key)
}

export function getHeroColor(key: string | null | undefined): HeroColor {
  if (!key) return HERO_COLORS[0]
  const preset = HERO_COLORS.find((c) => c.key === key)
  if (preset) return preset
  if (isCustomHex(key)) return { key, label: "Custom", base: key, strong: darkenHex(key) }
  return HERO_COLORS[0]
}
