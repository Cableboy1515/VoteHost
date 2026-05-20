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

export function getHeroColor(key: string | null | undefined): HeroColor {
  return HERO_COLORS.find((c) => c.key === key) ?? HERO_COLORS[0]
}
