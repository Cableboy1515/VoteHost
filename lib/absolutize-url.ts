export function absolutizeUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "")
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`
}
