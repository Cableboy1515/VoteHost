# Security Policy

## Threat model

VoteHost is designed for **small-organisation elections** (HOAs, clubs, small nonprofits) where one or more of the following threats are realistic:

- A voter who tries to cast a ballot more than once
- An insider with read access to the database who tries to impersonate another voter
- An internet attacker who finds the admin login page

It is **not** designed to defend against:

- Nation-state adversaries or targeted APTs
- Coercion attacks (vote-buying or voter intimidation)
- Malicious server administrators (VoteHost uses a *server-trust model* — whoever operates the server can see the underlying data)

## What this platform is and is not

| Property | VoteHost |
|---|---|
| Ballot anonymity | ✓ — votes are not linked to voter identity in the database |
| Voter authenticity | ✓ — magic-link tokens are SHA-256 hashed; plain tokens are never stored |
| Tally integrity | ✓ — SHA-256 tally hash published at election close; anyone can recompute from the audit export |
| End-to-end verifiability | ✗ — not provided; see Helios or Belenios for E2E-verifiable voting |
| Coercion resistance | ✗ — not provided |
| Multi-admin collusion resistance | ✗ — not provided (server-trust model) |

VoteHost is similar in model to a **trusted ballot box** administered by a known organisation, not a cryptographic voting protocol.

## Weighted voting and anonymity

When weighted voting is enabled, each `Vote` row stores the voter's weight at cast time. The weight is denormalized onto the anonymous vote — no `voterId` is ever written to the `Vote` table, so the core anonymity guarantee holds.

**Caveat:** if voter weights are near-unique (e.g. every voter has a distinct fractional share), a third party with read access to the vote table could potentially narrow down which ballot belongs to which voter by matching the weight value. To reduce this risk:

- Prefer grouped/bucketed weights (e.g. 1, 2, 5, 10) rather than unique fractional values.
- The audit export surfaces weighted *aggregates* only — it never reveals per-ballot weight in a way that can be directly matched to a named voter.
- This risk is inherent to any weighted ballot system and is documented here for transparency.

## Supported versions

Only the latest release is supported with security fixes.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities. Use GitHub's private vulnerability reporting feature from the repository's **Security** tab to send a private report instead.

Include:
- A description of the vulnerability and its impact
- Steps to reproduce
- Any proof-of-concept code

We aim to acknowledge reports within 48 hours and resolve critical issues within 14 days. We follow a **90-day disclosure policy**: if a fix is not released within 90 days of the initial report, you are free to disclose publicly.

## Implemented hardening (since initial release)

- **TOTP 2FA** — recommended for ADMIN and ORGANIZER roles; optional for all
- **Voter token hashing** — SHA-256 hash stored, plain UUID never persisted
- **HTTP security headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **CSRF fail-closed** — state-changing requests without an Origin header are rejected
- **Magic-byte file validation** — uploaded images validated against actual file contents, not client-supplied MIME type
- **Sealed election tally** — completed elections cannot be reopened; tally hash is immutable
- **8-hour session TTL** — sessions expire after 8 hours of inactivity
- **Session revocation** — token version bump immediately invalidates all active sessions

## Known accepted advisories

The following advisories appear in `npm audit` but have been triaged and accepted. Revisit when upstream packages release fixes.

| Advisory | Package | Reason accepted |
|---|---|---|
| GHSA-w5hq-g745-h8pq (`uuid` bounds check) | `exceljs → uuid@8` | Only affects `uuid.v3/v5/v6` when a `buf` argument is provided. `exceljs` uses `uuid.v4` (random) internally; this code path is not reachable. |
| GHSA-92pp-h63x-v22m (`@hono/node-server` path bypass) | `prisma → @prisma/dev → @hono/node-server` | `@prisma/dev` is the WASM-Postgres dev server used only by `prisma dev` (local development). Production deployments use `@prisma/client` + `prisma db push`, which do not load `@hono/node-server`. |
