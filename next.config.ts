import type { NextConfig } from "next"
import { execSync } from "child_process"
import { version as appVersion } from "./package.json"

const gitSha = (() => {
  if (process.env.NEXT_PUBLIC_GIT_SHA) return process.env.NEXT_PUBLIC_GIT_SHA
  try {
    return execSync("git rev-parse --short HEAD").toString().trim()
  } catch {
    return "dev"
  }
})()

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfkit", "archiver", "unzipper"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
}

export default nextConfig
