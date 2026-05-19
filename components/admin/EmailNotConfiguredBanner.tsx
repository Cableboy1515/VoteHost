"use client"

import { useOnboarding } from "@/components/admin/OnboardingProvider"

export default function EmailNotConfiguredBanner({ role }: { role: string }) {
  const { openWizard } = useOnboarding()
  const isAdmin = role === "ADMIN"

  return (
    <div
      className="flex items-start gap-3 px-[18px] py-3.5 mx-4 mt-4 rounded-[14px]"
      style={{
        background: "var(--vh-warn-soft)",
        border: "1px solid oklch(0.85 0.08 80)",
      }}
    >
      <span className="flex-shrink-0 text-[16px] leading-[22px]">📭</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-medium" style={{ color: "var(--vh-ink)" }}>
          No outbound email is set up.
        </p>
        <p className="text-[13px] mt-0.5" style={{ color: "var(--vh-ink-soft)" }}>
          {isAdmin
            ? "Voters won't receive invitations or reminders until this is configured."
            : "Voters won't receive invitations or reminders. Ask an administrator to set this up."}
        </p>
      </div>
      {isAdmin && (
        <button
          onClick={openWizard}
          className="flex-shrink-0 text-[13px] font-medium rounded-[8px] px-3 py-1.5 transition-colors"
          style={{
            background: "var(--vh-accent)",
            color: "#fff",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.9" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}
        >
          Set up email
        </button>
      )}
    </div>
  )
}
