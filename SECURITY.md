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

## Ballot replacement and receipt codes

When ballot replacement is enabled for an election (the default), a voter's receipt code is a **bearer credential**. The following properties must be understood:

- Anyone who holds a receipt code can learn the content of that ballot by cross-referencing the code against the published audit export.
- Anyone who holds a receipt code can replace the corresponding ballot **using any valid voting link for that election** — they do not need the original voter's own link. This means a leaked receipt code allows an attacker to silently delete another voter's ballot while the attacker's own ballot remains (effectively a double-count suppression). This cannot be prevented without breaking ballot anonymity, since the system cannot link a receipt to a specific voter at replacement time.
- Voters should keep their receipt confirmation emails strictly private. A compromised mailbox typically exposes both the magic link and the receipt code, which together give full control of that ballot.
- A voter is notified by email whenever their ballot is replaced — this is the detection channel for an unexpected replacement. (The `/verify` page deliberately does not reveal replacement; see below.)
- This feature improves coercion resistance: a voter who was coerced into voting a certain way can privately replace their ballot using their own receipt code before the election closes.
- The system does not provide receipt-freeness. Voters can prove how they voted to a third party by sharing their receipt code.
- Organizers can disable ballot replacement mid-election (via the election settings) if a receipt leak is suspected — this is exactly when the kill switch matters.
- There is **no recovery for a lost receipt code**. Receipts are not linked to voters (that is the anonymity guarantee), so an organizer cannot look one up or reset a single voter's ballot. The original ballot still counts; it simply can no longer be replaced. The only administrative remedy is the election-wide ballot reset, which deletes every ballot and re-invites every voter.

### Deniable replacement

When a ballot is replaced, the old receipt is **superseded, not deleted**: the public `/verify` endpoint keeps answering "found" for it, attesting only that *a ballot with this receipt was recorded* — never whether it is still the counted one. A coercer who collected a voter's receipt code at vote time therefore cannot detect, by polling the verify page, that the voter later replaced their ballot.

Residual limitations, accepted and documented rather than solved (full coercion resistance would require JCJ-style fake credentials):

- An **active** attacker holding the old receipt code *and* a valid voting link can learn of supersession by attempting a replacement, which fails with a distinct error. Replacement attempts are rate-limited (3/hour per voter) and require the voting-link credential, a far higher bar than polling a public endpoint.
- The post-election **audit export** lists only current receipts (superseded receipts would reference deleted ballots and break the receipts↔ballots invariant; only an aggregate `supersededReceiptCount` is included). If an organizer publishes the audit export, a coercer can check whether a collected code appears in it. Deniability therefore holds during the voting window — when re-voting decisions are made — but not against an adversary who obtains a published post-election export.

Organizers who want to eliminate the replacement credential risk entirely can disable ballot replacement in the election settings before or after voting starts.

## Known accepted advisories

The following advisories appear in `npm audit` but have been triaged and accepted. Revisit when upstream packages release fixes.

| Advisory | Package | Reason accepted |
|---|---|---|
| GHSA-w5hq-g745-h8pq (`uuid` bounds check) | `exceljs → uuid@8` | Only affects `uuid.v3/v5/v6` when a `buf` argument is provided. `exceljs` uses `uuid.v4` (random) internally; this code path is not reachable. |
| GHSA-92pp-h63x-v22m (`@hono/node-server` path bypass) | `prisma → @prisma/dev → @hono/node-server` | `@prisma/dev` is the WASM-Postgres dev server used only by `prisma dev` (local development). Production deployments use `@prisma/client` + `prisma db push`, which do not load `@hono/node-server`. |
| GHSA-wwfh-h76j-fc44 (`hono` serve-static Windows path traversal) | `prisma → @prisma/dev → hono` and `shadcn → @modelcontextprotocol/sdk → hono` | Both chains are dev tooling (`@prisma/dev` local dev server; `shadcn` is a devDependency). Neither loads in the production container. Windows-only path anyway. |
| GHSA-88fw-hqm2-52qc (`hono` CORS wildcard reflects credentials) | same chains as above | Dev tooling only — not loaded in production. |
| GHSA-j6c9-x7qj-28xf (`hono` AWS Lambda Set-Cookie merge) | same chains as above | Dev tooling only; also not applicable (not deployed on AWS Lambda). |
| GHSA-wgpf-jwqj-8h8p (`hono` Lambda@Edge header dedup) | same chains as above | Dev tooling only; also not applicable (not deployed on Lambda@Edge). |
| GHSA-rv63-4mwf-qqc2 (`hono` Body Limit bypass on Lambda) | same chains as above | Dev tooling only; also not applicable (not deployed on AWS Lambda). |
| GHSA-4x5r-pxfx-6jf8 (`@babel/core` sourceMappingURL file read) | `eslint-config-next → eslint-plugin-react-hooks → @babel/core` and `shadcn → @babel/core` | Both chains are devDependencies (linting and scaffolding tooling). Not present in the production build or container image. |
| GHSA-h67p-54hq-rp68 (`js-yaml` merge key DoS) | `eslint → @eslint/eslintrc → js-yaml` and `shadcn → cosmiconfig → js-yaml` | Both chains are devDependencies. Not present in the production build or container image. |
