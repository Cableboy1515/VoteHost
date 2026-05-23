import { getDisplayTimeZone } from "@/lib/timezone"
import { TimezoneProvider } from "@/components/TimezoneProvider"
import AuthedLayoutClient from "@/components/admin/AuthedLayoutClient"

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const tz = await getDisplayTimeZone()
  return (
    <TimezoneProvider value={tz}>
      <AuthedLayoutClient>
        {children}
      </AuthedLayoutClient>
    </TimezoneProvider>
  )
}
