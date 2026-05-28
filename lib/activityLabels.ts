import type { ActivityAction } from "@/lib/recordActivity"

export const ACTION_LABELS: Record<ActivityAction, string> = {
  "voter.add":                "Voter added",
  "voter.edit":               "Voter edited",
  "voter.delete":             "Voter deleted",
  "voter.bulk_delete":        "Voters deleted (bulk)",
  "voter.csv_import":         "Voters imported (CSV)",
  "voter.invite_resent":      "Invitation resent",
  "voter.bulk_invite":        "Invitations sent (bulk)",
  "voter.recovery_issued":    "Recovery link issued",
  "election.create":          "Election created",
  "election.update":          "Election settings updated",
  "election.activate":        "Election activated",
  "election.cancel_activation": "Activation cancelled",
  "election.close":           "Election closed",
  "election.reopen":          "Election reopened",
  "election.archive":         "Election archived",
  "election.unarchive":       "Election unarchived",
  "election.ballot_update":   "Ballot updated",
  "election.ballot_reset":    "Ballot reset",
  "election.delete":          "Election deleted",
  "election.auto_activate":          "Auto-activated",
  "election.auto_activate_failed":   "Auto-activate failed",
  "election.auto_invite_batch":      "Initial invitations sent",
  "election.auto_complete":          "Auto-closed",
  "election.first_reminder_batch":   "First reminder sent",
  "election.final_reminder_batch":   "Final reminder sent",
  "election.closing_soon_notice":    "Closing-soon notice sent",
  "election.starting_soon_notice":   "Starting-soon notice sent",
  "election.full_turnout_notice":    "Full-turnout notice sent",
  "election.completion_notice":      "Completion notice sent",
  "election.results_email_auto_sent": "Results email sent (auto)",
  "election.results_email_sent":     "Results email sent",
  "election.images_purged":          "Images purged",
  "user.invite":              "User invited",
  "user.role_change":         "User role changed",
  "user.delete":              "User deleted",
  "settings.general_update":  "General settings updated",
  "settings.email_update":    "Email settings updated",
  "settings.security_update": "Security settings updated",
  "twofa.enable":             "2FA enabled",
  "twofa.disable":            "2FA disabled",
  "admin.backup_download":    "Backup downloaded",
  "admin.restore":            "Backup restored",
}

export type ActionCategory = "voters" | "email" | "lifecycle" | "settings" | "all"

export const ACTION_CATEGORIES: Record<ActivityAction, ActionCategory> = {
  "voter.add":                "voters",
  "voter.edit":               "voters",
  "voter.delete":             "voters",
  "voter.bulk_delete":        "voters",
  "voter.csv_import":         "voters",
  "voter.invite_resent":      "email",
  "voter.bulk_invite":        "email",
  "voter.recovery_issued":    "email",
  "election.create":          "lifecycle",
  "election.update":          "lifecycle",
  "election.activate":        "lifecycle",
  "election.cancel_activation": "lifecycle",
  "election.close":           "lifecycle",
  "election.reopen":          "lifecycle",
  "election.archive":         "lifecycle",
  "election.unarchive":       "lifecycle",
  "election.ballot_update":   "lifecycle",
  "election.ballot_reset":    "lifecycle",
  "election.delete":          "lifecycle",
  "election.auto_activate":          "lifecycle",
  "election.auto_activate_failed":   "lifecycle",
  "election.auto_invite_batch":      "email",
  "election.auto_complete":          "lifecycle",
  "election.first_reminder_batch":   "email",
  "election.final_reminder_batch":   "email",
  "election.closing_soon_notice":    "lifecycle",
  "election.starting_soon_notice":   "lifecycle",
  "election.full_turnout_notice":    "lifecycle",
  "election.completion_notice":      "lifecycle",
  "election.results_email_auto_sent": "email",
  "election.results_email_sent":     "email",
  "election.images_purged":          "lifecycle",
  "user.invite":              "settings",
  "user.role_change":         "settings",
  "user.delete":              "settings",
  "settings.general_update":  "settings",
  "settings.email_update":    "settings",
  "settings.security_update": "settings",
  "twofa.enable":             "settings",
  "twofa.disable":            "settings",
  "admin.backup_download":    "settings",
  "admin.restore":            "settings",
}

export function formatAction(action: string): string {
  return ACTION_LABELS[action as ActivityAction] ?? action
}

export function actionCategory(action: string): ActionCategory {
  return ACTION_CATEGORIES[action as ActivityAction] ?? "all"
}

export const FIELD_LABELS: Record<string, string> = {
  // Election fields
  title:              "Title",
  description:        "Description",
  startsAt:           "Start date",
  endsAt:             "End date",
  status:             "Status",
  archived:           "Archived",
  emailSubject:       "Email subject",
  emailMessage:       "Email message",
  emailLogoUrl:       "Email logo",
  emailLogoDeleteUrl: "Email logo",
  emailFooter:        "Email footer",
  firstReminderDays:  "Reminder days",
  autoActivate:       "Auto-activate",
  heroColor:          "Accent color",
  autoSendResults:    "Auto-send results",
  // General settings
  image_retention_days: "Image retention",
  display_time_zone:    "Display time zone",
  // Security settings
  notifyAdminsOnReset:  "Notify admins on reset",
  // Email settings
  email_provider:        "Email provider",
  email_preset:          "Email preset",
  resend_api_key:        "Resend API key",
  resend_webhook_secret: "Resend webhook secret",
  email_from_address:    "From address",
  email_from_name:       "From name",
  smtp_host:             "SMTP host",
  smtp_port:             "SMTP port",
  smtp_user:             "SMTP user",
  smtp_pass:             "SMTP password",
  smtp_secure:           "SMTP secure",
}

export function formatField(key: string): string {
  return FIELD_LABELS[key] ?? key
}

export function formatRole(role: string): string {
  const r = String(role)
  return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()
}

export function formatValue(_key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !isNaN(Date.parse(value)))
      return new Date(value).toLocaleString()
    if (value.length > 60) return value.slice(0, 60) + "…"
    return value
  }
  return String(value)
}
