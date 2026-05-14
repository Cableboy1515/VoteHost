export function passwordStrength(pw: string): { segments: number; label: string } {
  if (!pw) return { segments: 0, label: "" }
  const hasUpper = /[A-Z]/.test(pw)
  const hasNumber = /[0-9]/.test(pw)
  const hasSpecial = /[^A-Za-z0-9]/.test(pw)
  if (pw.length >= 12 && hasUpper && hasNumber && hasSpecial) return { segments: 4, label: "Strong" }
  if (pw.length >= 12 && (hasUpper || hasNumber)) return { segments: 3, label: "Good" }
  if (pw.length >= 8) return { segments: 2, label: "Fair" }
  return { segments: 1, label: "Weak" }
}

export const STRENGTH_COLOR: Record<number, string> = {
  1: "var(--vh-danger)",
  2: "var(--vh-warn)",
  3: "oklch(0.60 0.13 155)",
  4: "var(--vh-success)",
}
