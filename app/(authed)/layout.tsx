export const dynamic = "force-dynamic"

import { getDisplayTimeZone } from "@/lib/timezone"
import { TimezoneProvider } from "@/components/TimezoneProvider"
import AuthedLayoutClient from "@/components/admin/AuthedLayoutClient"
import ScheduledStartBanner from "@/components/admin/ScheduledStartBanner"

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const tz = await getDisplayTimeZone()
  return (
    <TimezoneProvider value={tz}>
      <AuthedLayoutClient>
        <ScheduledStartBanner />
        {children}
      </AuthedLayoutClient>
    </TimezoneProvider>
  )
}
