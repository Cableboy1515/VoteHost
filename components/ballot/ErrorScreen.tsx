import { StateScreen } from "@/components/ui/state-screen"

interface Config {
  icon: string
  iconBg: string
  title: string
  body: string
  primaryLabel?: string
  primaryHref?: string
  /** If true, render a "Contact organizer" secondary button using contactEmail prop */
  showContactButton?: boolean
  /** If true, render a "Request a new link" primary button and contact is secondary */
  showRecoverPrimary?: boolean
}

const CONFIGS: Record<string, Config> = {
  invalid: {
    icon: "⚠",
    iconBg: "bg-vh-danger-soft",
    title: "Invalid voting link",
    body: "This link is not valid. Please check your email for the correct link, or request a new one below.",
    showRecoverPrimary: true,
    showContactButton: true,
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
    showContactButton: true,
  },
  "not-open": {
    icon: "🕐",
    iconBg: "bg-vh-warn-soft",
    title: "Election hasn't started yet",
    body: "This election is not open for voting yet. Please check back when it opens.",
  },
}

export default function ErrorScreen({
  type,
  startsAt,
  timeZone = "UTC",
  contactEmail,
}: {
  type: string
  startsAt?: string
  timeZone?: string
  contactEmail?: string
}) {
  const cfg = CONFIGS[type] ?? CONFIGS.invalid
  let body = cfg.body
  if (type === "not-open" && startsAt) {
    const formatted = new Date(startsAt).toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZone,
    })
    body = `Voting opens ${formatted}. Save this link — it will activate then.`
  }

  const contactHref = contactEmail ? `mailto:${contactEmail}` : undefined

  if (cfg.showRecoverPrimary) {
    return (
      <StateScreen
        icon={cfg.icon}
        iconBg={cfg.iconBg}
        title={cfg.title}
        body={body}
        primaryLabel="Request a new link"
        primaryHref="/vote/recover"
        secondaryButtonLabel={contactHref ? "Contact organizer" : undefined}
        secondaryButtonHref={contactHref}
      />
    )
  }

  return (
    <StateScreen
      icon={cfg.icon}
      iconBg={cfg.iconBg}
      title={cfg.title}
      body={body}
      primaryLabel={cfg.showContactButton && contactHref ? "Contact organizer" : cfg.primaryLabel}
      primaryHref={cfg.showContactButton && contactHref ? contactHref : cfg.primaryHref}
    />
  )
}
