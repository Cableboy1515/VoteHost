/**
 * Tests for lib/emailVerify.ts — pure functions, no network.
 * Run with: npx tsx lib/emailVerify.test.ts
 */
import assert from "node:assert/strict"
import { mapSmtpError, mapResendError, emailConfigFingerprint } from "./emailVerify.js"

// ─── mapSmtpError ─────────────────────────────────────────────────────────────

// EAUTH generic → auth_failed, no preset hint
{
  const r = mapSmtpError({ code: "EAUTH", message: "Invalid login" }, { host: "smtp.example.com", port: 587, secure: false })
  assert.equal(r.code, "auth_failed", "EAUTH → auth_failed")
  assert.equal(r.ok, false, "EAUTH ok=false")
}

// EAUTH + gmail preset → auth hint mentions App Password
{
  const r = mapSmtpError({ code: "EAUTH", message: "Invalid login" }, { host: "smtp.gmail.com", port: 587, secure: false, preset: "gmail" })
  assert.equal(r.code, "auth_failed", "gmail preset EAUTH → auth_failed")
  assert.ok(r.hint?.includes("App Password"), "gmail preset → App Password hint: " + r.hint)
}

// EAUTH host-sniffed gmail hint (no preset)
{
  const r = mapSmtpError({ code: "EAUTH", message: "Bad credentials" }, { host: "smtp.gmail.com", port: 587, secure: false })
  assert.equal(r.code, "auth_failed", "gmail host-sniff → auth_failed")
  assert.ok(r.hint?.includes("App Password"), "gmail host-sniff → App Password hint: " + r.hint)
}

// 534 application-specific-password → gmail hint even without preset
{
  const r = mapSmtpError(
    { responseCode: 534, response: "5.7.9 Application-specific password required" },
    { host: "smtp.example.com", port: 587, secure: false },
  )
  assert.equal(r.code, "auth_failed", "534 app-specific → auth_failed")
  assert.ok(r.hint?.includes("App Password"), "534 app-specific → gmail hint")
}

// 535 responseCode → auth_failed
{
  const r = mapSmtpError({ responseCode: 535, response: "Username and password not accepted" }, { host: "smtp.gmail.com", port: 587, secure: false })
  assert.equal(r.code, "auth_failed", "535 → auth_failed")
}

// ENOTFOUND → host_not_found
{
  const r = mapSmtpError({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND bad.host" }, { host: "bad.host", port: 587, secure: false })
  assert.equal(r.code, "host_not_found", "ENOTFOUND → host_not_found")
  assert.ok(r.message.includes("bad.host"), "message contains host name")
}

// ECONNREFUSED → connection_refused
{
  const r = mapSmtpError({ code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:9999" }, { host: "smtp.example.com", port: 9999, secure: false })
  assert.equal(r.code, "connection_refused", "ECONNREFUSED → connection_refused")
  assert.ok(r.message.includes("9999"), "message contains port")
}

// ETIMEDOUT with port 465 + secure=false → timed_out with TLS hint
{
  const r = mapSmtpError({ code: "ETIMEDOUT", message: "connect ETIMEDOUT" }, { host: "smtp.example.com", port: 465, secure: false })
  assert.equal(r.code, "timed_out", "ETIMEDOUT port 465 no-secure → timed_out")
  assert.ok(r.hint?.includes("Implicit TLS"), "port-465 timeout hint mentions Implicit TLS: " + r.hint)
}

// ETIMEDOUT with normal port → timed_out, no hint
{
  const r = mapSmtpError({ code: "ETIMEDOUT", message: "connect ETIMEDOUT" }, { host: "smtp.example.com", port: 587, secure: false })
  assert.equal(r.code, "timed_out", "ETIMEDOUT port 587 → timed_out")
  assert.ok(!r.hint, "normal timeout → no hint")
}

// ESOCKET + "wrong version number" → tls_wrong_mode with STARTTLS hint
{
  const r = mapSmtpError(
    { code: "ESOCKET", message: "wrong version number" },
    { host: "smtp.example.com", port: 587, secure: true },
  )
  assert.equal(r.code, "tls_wrong_mode", "ESOCKET wrong-version port 587 secure → tls_wrong_mode")
  assert.ok(r.hint?.includes("STARTTLS"), "tls_wrong_mode port 587 → STARTTLS hint: " + r.hint)
}

// Certificate error
{
  const r = mapSmtpError({ code: "DEPTH_ZERO_SELF_SIGNED_CERT", message: "self signed certificate" }, { host: "smtp.example.com", port: 587, secure: false })
  assert.equal(r.code, "tls_cert", "self-signed cert → tls_cert")
}

// Unknown fallthrough
{
  const r = mapSmtpError({ message: "some completely unexpected error" }, { host: "smtp.example.com", port: 587, secure: false })
  assert.equal(r.code, "unknown", "unknown error → unknown code")
  assert.equal(r.ok, false, "unknown → ok=false")
}

// ─── mapResendError ───────────────────────────────────────────────────────────

// invalid_api_key
{
  const r = mapResendError({ name: "invalid_api_key", statusCode: 403, message: "Invalid API Key" })
  assert.equal(r.code, "invalid_api_key", "invalid_api_key → invalid_api_key")
  assert.equal(r.ok, false, "invalid_api_key → ok=false")
  assert.ok(r.hint?.includes("resend.com/api-keys"), "invalid_api_key → resend hint")
}

// restricted_api_key → ok
{
  const r = mapResendError({ name: "restricted_api_key", statusCode: 403, message: "Restricted key" })
  assert.equal(r.code, "ok_restricted_key", "restricted_api_key → ok_restricted_key")
  assert.equal(r.ok, true, "restricted_api_key → ok=true")
}

// network / FetchError
{
  const r = mapResendError({ name: "FetchError", message: "fetch failed" })
  assert.equal(r.code, "network", "FetchError → network")
  assert.equal(r.ok, false, "network → ok=false")
}

// ─── emailConfigFingerprint ───────────────────────────────────────────────────

// Stable across from-address/name changes (not included in fingerprint)
{
  const a = emailConfigFingerprint({ provider: "smtp", host: "smtp.example.com", port: 587, user: "u", pass: "p", secure: false })
  const b = emailConfigFingerprint({ provider: "smtp", host: "smtp.example.com", port: 587, user: "u", pass: "p", secure: false })
  assert.equal(a, b, "fingerprint stable for same config")
}

// Changes when password changes
{
  const a = emailConfigFingerprint({ provider: "smtp", host: "smtp.example.com", port: 587, user: "u", pass: "old", secure: false })
  const b = emailConfigFingerprint({ provider: "smtp", host: "smtp.example.com", port: 587, user: "u", pass: "new", secure: false })
  assert.notEqual(a, b, "fingerprint changes on pass change")
}

// Changes when host changes
{
  const a = emailConfigFingerprint({ provider: "smtp", host: "smtp.example.com", port: 587, user: "u", pass: "p", secure: false })
  const b = emailConfigFingerprint({ provider: "smtp", host: "mail.example.com", port: 587, user: "u", pass: "p", secure: false })
  assert.notEqual(a, b, "fingerprint changes on host change")
}

// Changes when port changes
{
  const a = emailConfigFingerprint({ provider: "smtp", host: "smtp.example.com", port: 587, user: "u", pass: "p", secure: false })
  const b = emailConfigFingerprint({ provider: "smtp", host: "smtp.example.com", port: 465, user: "u", pass: "p", secure: false })
  assert.notEqual(a, b, "fingerprint changes on port change")
}

// Changes when secure changes
{
  const a = emailConfigFingerprint({ provider: "smtp", host: "smtp.example.com", port: 587, user: "u", pass: "p", secure: false })
  const b = emailConfigFingerprint({ provider: "smtp", host: "smtp.example.com", port: 587, user: "u", pass: "p", secure: true })
  assert.notEqual(a, b, "fingerprint changes on secure change")
}

// Resend: changes on apiKey change
{
  const a = emailConfigFingerprint({ provider: "resend", apiKey: "re_abc123" })
  const b = emailConfigFingerprint({ provider: "resend", apiKey: "re_xyz789" })
  assert.notEqual(a, b, "resend fingerprint changes on apiKey change")
}

// Resend: stable for same key
{
  const a = emailConfigFingerprint({ provider: "resend", apiKey: "re_abc123" })
  const b = emailConfigFingerprint({ provider: "resend", apiKey: "re_abc123" })
  assert.equal(a, b, "resend fingerprint stable for same key")
}

console.log("emailVerify: all tests passed")
