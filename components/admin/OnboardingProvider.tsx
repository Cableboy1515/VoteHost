"use client"

import { createContext, useContext, useEffect, useState } from "react"
import EmailNotConfiguredBanner from "@/components/admin/EmailNotConfiguredBanner"
import EmailSetupWizard from "@/components/admin/EmailSetupWizard"

type OnboardingContextValue = {
  openWizard: () => void
}

const OnboardingContext = createContext<OnboardingContextValue>({ openWizard: () => {} })
export const useOnboarding = () => useContext(OnboardingContext)

type Status = {
  emailConfigured: boolean
  wizardSeen: boolean
  role: string
  email: string
}

export default function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Status | null) => {
        if (!d) return
        setStatus(d)
        if (!d.emailConfigured && !d.wizardSeen && d.role === "ADMIN") {
          setWizardOpen(true)
        }
      })
      .catch(() => {})
  }, [])

  function openWizard() {
    setWizardOpen(true)
  }

  function handleWizardClose(configured: boolean) {
    setWizardOpen(false)
    if (configured && status) {
      setStatus({ ...status, emailConfigured: true })
    }
  }

  return (
    <OnboardingContext.Provider value={{ openWizard }}>
      {status && !status.emailConfigured && (
        <EmailNotConfiguredBanner role={status.role} />
      )}
      <EmailSetupWizard
        open={wizardOpen}
        onClose={handleWizardClose}
        adminEmail={status?.email ?? ""}
      />
      {children}
    </OnboardingContext.Provider>
  )
}
