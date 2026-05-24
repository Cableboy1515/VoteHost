import { StateScreen } from "@/components/ui/state-screen"

interface Config {
  icon: string
  iconBg: string
  title: string
  body: string
  primaryLabel?: string
  primaryHref?: string
}

const CONFIGS: Record<string, Config> = {
  invalid: {
    icon: "⚠",
    iconBg: "bg-vh-danger-soft",
    title: "Invalid voting link",
    body: "This link is not valid. Please check your email for the correct link, or request a new one from the election organizer.",
    primaryLabel: "Contact organizer",
    primaryHref: "mailto:",
  },
  "already-voted": {
    icon: "🗳",
    iconBg: "bg-vh-accent-soft",
    title: "Already voted",
    body: "You've already submitted your vote for this election. Thank you for participating!",
  },
  closed: {
    icon: "✓",
    iconBg: "bg-vh-success-soft",
    title: "Voting has closed",
    body: "This election is no longer accepting votes.",
  },
  "draft-pending": {
    icon: "🕐",
    iconBg: "bg-vh-warn-soft",
    title: "Election hasn't opened yet",
    body: "Check back shortly, or contact the organizer if you were expecting it to be open.",
    primaryLabel: "Contact organizer",
    primaryHref: "mailto:",
  },
  "not-open": {
    icon: "🕐",
    iconBg: "bg-vh-warn-soft",
    title: "Election hasn't started yet",
    body: "This election is not open for voting yet. Please check back when it opens.",
  },
}

export default function ErrorScreen({ type, startsAt, timeZone = "UTC" }: { type: string; startsAt?: string; timeZone?: string }) {
  const cfg = CONFIGS[type] ?? CONFIGS.invalid
  let body = cfg.body
  if (type === "not-open" && startsAt) {
    const formatted = new Date(startsAt).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZone,
    })
    body = `Voting opens ${formatted}. Save this link — it will activate then.`
  }
  return (
    <StateScreen
      icon={cfg.icon}
      iconBg={cfg.iconBg}
      title={cfg.title}
      body={body}
      primaryLabel={cfg.primaryLabel}
      primaryHref={cfg.primaryHref}
      secondaryLinkLabel={type === "invalid" ? "Lost your link? Request a fresh one →" : undefined}
      secondaryLinkHref={type === "invalid" ? "/vote/recover" : undefined}
    />
  )
}
