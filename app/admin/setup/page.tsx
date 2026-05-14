export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import SetupForm from "@/components/admin/SetupForm"

export default async function SetupPage() {
  const [setupRow, count] = await Promise.all([
    db.setting.findUnique({ where: { key: "setup_completed" } }),
    db.adminUser.count(),
  ])
  if (setupRow || count > 0) redirect("/admin/login")

  if (!process.env.SETUP_TOKEN) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
        <div className="max-w-md w-full rounded-xl border border-zinc-200 bg-white p-8 shadow-sm space-y-3">
          <h1 className="text-lg font-semibold text-zinc-900">Setup token not configured</h1>
          <p className="text-sm text-zinc-600">
            First-time admin creation requires a <code className="font-mono bg-zinc-100 px-1 rounded break-all">SETUP_TOKEN</code> in your{" "}
            <code className="font-mono bg-zinc-100 px-1 rounded">.env</code> file.
          </p>
          <ol className="text-sm text-zinc-600 list-decimal list-inside space-y-1 break-words">
            <li>Generate a token: <code className="font-mono bg-zinc-100 px-1 rounded break-all">openssl rand -hex 32</code></li>
            <li>Add <code className="font-mono bg-zinc-100 px-1 rounded break-all">SETUP_TOKEN=&lt;value&gt;</code> to <code className="font-mono bg-zinc-100 px-1 rounded">.env</code></li>
            <li>Restart the app: <code className="font-mono bg-zinc-100 px-1 rounded break-all">docker compose restart app</code></li>
            <li>Reload this page</li>
          </ol>
          <p className="text-sm text-zinc-500">
            Or re-run <code className="font-mono bg-zinc-100 px-1 rounded break-all">scripts/install.sh</code> — the wizard generates the token and creates the admin account for you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <SetupForm />
    </div>
  )
}
