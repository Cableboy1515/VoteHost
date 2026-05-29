# VoteHost Elections

VoteHost Elections is a self-hosted election platform for organizations that need secure, private voting without relying on third-party services. Admins manage elections and voters through a web panel; voters receive a magic link by email and cast their ballot anonymously without creating an account.

Designed to run on a Raspberry Pi, mini PC, VPS, or Proxmox LXC.


>Note from Cableboy1515: Hey all! This is a vibe-coded election software project I wanted to create beacuse an organization I participate in was wanting to hold electronic elections, but all platforms required paying for a service if you have over 20 or so voters. We have over 150, so I decided to see what I could create with my buddy, Claude. I tried to take careful consideration while building this platform with over 240 commits, but the reality is that I am not a coder. I'm hopeful that this is a good start and the community can analyze, offer suggestionss and help this platform grow.
>
>I plan on running some large-scale tests with my organization soon. In addition to the audit system that's built, I will ask my organization to vote in a test election and email results that they vote for as additonal testing and verification.
>
>Hopefully together we can make an excellent open-source project!

Source code lives at [github.com/Cableboy1515/VoteHost](https://github.com/Cableboy1515/VoteHost) — the repository keeps the original short name.

Copyright © 2026 Christopher Dewald. Licensed under the [AGPL-3.0-or-later](./LICENSE).

---

## Features

- **Secret ballot** — votes are recorded anonymously; no one can link a submitted ballot to a voter
- **Magic link voting** — voters click a link in their email, no account or password required
- **Multiple question types** — single choice, multiple choice (with optional seat limit), preference ranking (per-rank breakdown, no IRV), and free-text write-in
- **Candidate profiles** — photo avatars, bio text, and website links; voters expand details inline
- **Per-voter option randomization** — eliminates primacy bias with a deterministic shuffle seeded by a per-voter value
- **Email invitations and reminders** — configurable early reminder and a 24-hour final reminder; each voter receives at most one of each regardless of how often the cron runs
- **Results announcement** — one-click results email with charts sent to all voters after the election closes
- **Customizable email branding** — per-election subject, message body, header logo, and footer
- **Image retention** — uploaded logos and avatars are automatically replaced with a transparent placeholder after a configurable number of days, reducing long-term server load from old inbox links
- **Admin roles** — ADMIN (full access including user management, settings, and election deletion), ORGANIZER (election management only), and VIEWER (read-only access to elections and results); elections must be archived before they can be deleted, and only ADMIN can delete them
- **SMTP or Resend** — bring your own email provider; configured through the admin settings panel
- **Election activation** — one-click activation sends invites immediately; elections with a scheduled start time activate and deliver invitations automatically
- **Results exports** — download results as CSV, XLSX, or PDF; a full anonymised audit package (JSON) is also available for independent verification
- **Activity log** — every admin and organizer action is recorded and viewable per election
- **Voter ballot recovery** — voters who lose their magic link can request a fresh one without contacting an admin
- **Admin controls** — admins can close an election early or archive completed elections

---

## Requirements

- A Linux machine (Raspberry Pi 4/5, mini PC, VPS, Proxmox LXC, etc.) with at least 2 GB RAM recommended (1 GB minimum)
- Docker Engine and Docker Compose v2 (`docker compose version`)
- For public access over the internet, one of:
  - A **Cloudflare Tunnel** token — requires a domain on Cloudflare DNS (free tunnel, ~$10/yr domain)
  - A **Tailscale auth key** — free, no domain needed, gives you a stable `*.ts.net` URL
  - Your own reverse proxy (nginx, Caddy, Traefik) if you handle TLS and routing yourself

---

## Quick start

The install script generates secrets, writes your `.env`, and starts the stack.

```bash
git clone https://github.com/Cableboy1515/VoteHost.git
cd VoteHost
./scripts/install.sh
```

The wizard will ask which tunnel option you're using, prompt for your admin email and password, and then build and start the stack. Once the containers are healthy, the wizard creates your admin account automatically — no browser step required. If you skip the in-wizard admin creation, it shows the `/setup` URL to finish from the browser — your `SETUP_TOKEN` is in the generated `.env` file.

---

## Proxmox one-command install

If you're running Proxmox VE, a single command creates an unprivileged Debian 12 LXC, installs Docker, clones VoteHost, and runs the install wizard — no manual container setup required.

Run this on your **Proxmox host** (as root):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Cableboy1515/VoteHost/main/scripts/proxmox.sh)"
```

The script walks you through a short set of prompts (container ID, hostname, storage, access mode, admin account) and then handles everything else automatically. Total time is roughly 4–8 minutes depending on your connection speed.

**Recommended LXC sizing**

| Resource | Recommended | Minimum |
|---|---|---|
| vCPU | 2 | 1 |
| RAM | 2 GB | 1 GB |
| Disk | 15 GB | 8 GB |

Docker images for this stack total around 3 GB. Postgres and uploaded images grow over time, so 15 GB gives comfortable headroom.

**Access modes**

The script offers the same three access options as the standard install:

- **Cloudflare Tunnel** *(default)* — paste your tunnel token; the script configures the profile automatically. No port forwarding needed.
- **Tailscale Funnel** — paste a Tailscale auth key; the script adds the required `/dev/net/tun` device passthrough to the LXC config for you.
- **LAN only** — the app binds on port 3000 of the LXC's IP address; point your own reverse proxy at it.

**After install**

- For Tailscale: check the container logs for your `*.ts.net` URL, then update `NEXTAUTH_URL` in `/opt/votehost/.env` and restart the app:
  ```bash
  pct exec <CTID> -- sh -c 'cd /opt/votehost && docker compose logs tailscale'
  # update NEXTAUTH_URL in /opt/votehost/.env, then:
  pct exec <CTID> -- sh -c 'cd /opt/votehost && docker compose restart app'
  ```
- To enter the container: `pct exec <CTID> -- bash`
- To view live logs: `pct exec <CTID> -- sh -c 'cd /opt/votehost && docker compose logs -f'`
- To upgrade: `pct exec <CTID> -- sh -c 'cd /opt/votehost && git pull && docker compose up -d --build'`

---

## Manual setup

If you prefer to configure things yourself:

**1. Copy the environment template**

```bash
cp .env.example .env
```

**2. Fill in the required values**

Open `.env` and set:

| Variable | How to get it |
|---|---|
| `POSTGRES_PASSWORD` | Any strong password, or `openssl rand -hex 16` |
| `DATABASE_URL` | Set to `postgresql://votehost:<POSTGRES_PASSWORD>@db:5432/votehost` |
| `NEXTAUTH_SECRET` | `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Your public URL, e.g. `https://vote.example.com`. Comma-separated for multiple origins: `https://a.example.com,https://b.example.com` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `SETUP_TOKEN` | `openssl rand -hex 32` — required to create the first admin account; can be removed from `.env` after bootstrap |

**3. Build and start**

```bash
docker compose build
docker compose up -d
```

The app container will wait for Postgres to be ready, apply the database schema automatically, then start on port 3000 (bound to `127.0.0.1` — expose it via a tunnel or reverse proxy).

**4. Check the logs**

```bash
docker compose logs -f app
```

You should see `Postgres is ready`, `Schema applied`, and `Starting VoteHost Elections` within about 30 seconds.

**5. Create your admin account**

Visit `https://your-domain.com/setup`. The form asks for a **setup token** — paste the `SETUP_TOKEN` value from your `.env` file. This prevents anyone on the internet from racing you for the admin account while the server is first starting up.

Once the admin account is created, you can optionally remove `SETUP_TOKEN` from `.env` and run `docker compose restart app` — it is never checked again after the first admin exists.

> **Tip — SSH port-forward**: if you need to reach the setup page before your tunnel/DNS is live, `ssh -L 3000:localhost:3000 user@your-server` lets you browse `http://localhost:3000/setup` from your workstation. The forward closes when you exit the session.

---

## Tunnel options

The app binds only to `127.0.0.1:3000` on the host. To make it reachable from the internet, use one of the profiles below.

### Cloudflare Tunnel

Requires a domain you control on Cloudflare DNS. The tunnel is free; domain registration is typically around $10/year.

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com) → Networks → Tunnels → Create a tunnel
2. Choose Docker. The dashboard shows a `docker run ... --token eyJ...` command — copy **only** the long token after `--token`, not the whole command.
3. Add to your `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=<paste only the eyJ... token>
   NEXTAUTH_URL=https://vote.example.com
   ```
4. In the Cloudflare dashboard, configure a Public Hostname for your domain. Set the origin **URL** to `http://app:3000` — `app` is the docker-compose service name. Do **not** use `http://localhost:3000`; inside the cloudflared container, `localhost` refers to cloudflared itself, not VoteHost Elections.
5. Start with the cloudflare profile:
   ```bash
   docker compose --profile cloudflare up -d
   ```

### Tailscale Funnel

No domain required. Gives you a stable `https://<hostname>.<tailnet>.ts.net` URL that's publicly reachable. The install wizard walks you through this interactively; the steps below are the manual equivalent.

**Prerequisites — one-time tailnet setup** ([Tailscale admin](https://login.tailscale.com/admin)):

1. **Enable HTTPS certificates** at `admin/dns` → "Enable HTTPS"

2. **Choose an isolation mode** (see [Security and threat model](#security-and-threat-model) for the tradeoff):

   **Isolated (recommended):** VoteHost joins as a tagged device with no peer access to the rest of your tailnet.

   Open the [policy file](https://login.tailscale.com/admin/acls/file).

   *New Tailscale user / untouched policy file* — **replace the entire file** with this and Save:
   ```jsonc
   {
     "tagOwners": {
       "tag:votehost": ["autogroup:admin"]
     },
     "nodeAttrs": [
       { "target": ["tag:votehost"], "attr": ["funnel"] }
     ],
     "grants": [
       { "src": ["autogroup:member"],
         "dst": ["autogroup:member"],
         "ip":  ["*"] }
     ]
   }
   ```
   The `grants` entry replaces the default wildcard — your other devices still reach each other; `tag:votehost` is excluded.

   *Existing tailnet* (you have custom groups, ACL rules, SSH rules, tests, etc.) — add `tagOwners` and `nodeAttrs` as **top-level keys** (siblings of `grants`/`acls`, **not** nested inside the array), and replace the default wildcard grant with the member-only entry above.

   **Legacy `acls`-based tailnet?** Older accounts use `"acls"` instead of `"grants"` (the two can't coexist). Substitute this for the `grants` block:
   ```jsonc
   "acls": [
     { "action": "accept",
       "src":    ["autogroup:member"],
       "dst":    ["autogroup:member:*"] }
   ]
   ```
   `tagOwners` and `nodeAttrs` stay at the top level either way.

   **Non-isolated (simpler):** VoteHost is a normal tailnet peer.

   *Easiest:* in [Access controls](https://login.tailscale.com/admin/acls), expand the **Funnel** section and click **Add Funnel to policy**. Done.

   *Or* edit the [policy file](https://login.tailscale.com/admin/acls/file) directly:
   - *New Tailscale user:* replace the whole file with `{ "nodeAttrs": [{ "target": ["autogroup:member"], "attr": ["funnel"] }] }`.
   - *Existing tailnet:* add `nodeAttrs` as a **top-level key** (sibling of `grants`/`acls`, not nested inside):
   ```jsonc
   "nodeAttrs": [
     { "target": ["autogroup:member"], "attr": ["funnel"] }
   ]
   ```

3. **Generate a Reusable auth key** at `admin/settings/keys` and add to `.env`:
   ```
   TS_AUTHKEY=tskey-auth-...
   TS_HOSTNAME=votehost
   # Isolated mode (recommended) — or leave TS_EXTRA_ARGS unset for the same effect
   TS_EXTRA_ARGS=--advertise-tags=tag:votehost
   # Non-isolated mode — set to empty
   # TS_EXTRA_ARGS=
   ```

4. Start with the tailscale profile:
   ```bash
   docker compose --profile tailscale up -d
   ```

5. Run the URL helper after the container authenticates — it detects your full `*.ts.net` hostname, patches `NEXTAUTH_URL` in `.env`, and recreates the app container:
   ```bash
   bash scripts/refresh-tailscale-url.sh
   ```

**Verify isolation** (isolated mode only):
```bash
docker compose exec tailscale tailscale status   # self line should include tag:votehost
tailscale ping votehost                          # from your laptop — should fail (that's success)
```

**Switching modes later:**

To go from non-isolated → isolated: apply the three-snippet policy above, edit `.env` to set `TS_EXTRA_ARGS=--advertise-tags=tag:votehost`, delete the existing untagged device at `admin/machines`, then `docker compose --profile tailscale up -d --force-recreate tailscale`.

To go from isolated → non-isolated: set `TS_EXTRA_ARGS=` (empty) in `.env`, optionally revert the ACL, delete the tagged device, and recreate the container.

### Own reverse proxy

Leave the tunnel profiles unused. The app is at `http://127.0.0.1:3000` on the host. Point your nginx, Caddy, or Traefik config at it and handle TLS yourself.

---

## Email setup

VoteHost Elections sends email for ballot invitations, reminders, and results announcements. Configure email in the admin panel under **System Settings** after your first login.

### SMTP (recommended for most self-hosters)

Any standard SMTP provider works. Tested options:

| Provider | Host | Port | Daily limit | Notes |
|---|---|---|---|---|
| iCloud Mail | `smtp.mail.me.com` | 587 | ~1,000 | Requires an [app-specific password](https://support.apple.com/en-us/102654), not your Apple ID password |
| Gmail | `smtp.gmail.com` | 587 | 500 | Requires an [app password](https://myaccount.google.com/apppasswords) with 2FA enabled |
| Microsoft 365 / Outlook | `smtp.office365.com` | 587 | Varies | Use your full email as username; may require [enabling Authenticated SMTP](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission) in your tenant |
| Yahoo Mail | `smtp.mail.yahoo.com` | 465 | Varies | Requires an [App Password](https://login.yahoo.com/account/security) with 2-step verification enabled |

In the admin panel: **System Settings → Email → SMTP settings**. Enter the host, port, username, and password. Use the "Send test email" button to confirm delivery before your first election.

### Resend

If you prefer an API-based approach:

1. Create an account at [resend.com](https://resend.com) and generate an API key
2. In the admin panel: **System Settings → Email → Resend API key**

The Resend free tier allows 100 emails/day and 3,000/month — sufficient for small elections. For elections with more than 100 voters, use SMTP or a paid Resend plan.

---

## Election activation

Elections are created in **DRAFT** status. Once an election has at least one question, at least one voter, and an end date in the future, an **Activate** button appears in the election editor.

- **One-click activate** — clicking Activate publishes the election immediately and sends invitation emails to all voters.
- **Scheduled start** — set a `Starts at` time when creating the election. The election stays in DRAFT until that time arrives, then auto-activates and sends invites automatically. The per-minute cron handles this without any manual action.

If voters are added to an already-active election, use **Resume invitations** from the Voters tab to send them their magic links.

---

## First run checklist

After setup and email configuration, run through these before your first election:

1. **Proxy guard** — open an incognito window and navigate to `/dashboard`. You must be redirected to `/login`.
2. **API guard** — `curl -X GET https://your-domain.com/api/users` must return `403`.
3. **Secure cookie** — log in, open browser DevTools → Application → Cookies → confirm `vh_session` has `Secure` and `HttpOnly` set.
4. **Email test** — System Settings → Email → Send test email. Confirm it arrives.
5. **Cron test** — confirm the reminder endpoint responds:
   ```bash
   source .env
   curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://your-domain.com/api/reminders/run | jq
   ```
   Should return something like:
   ```json
   { "elections": 0, "sent": 0, "completionsSent": 0, "draftRemindersSent": 0, "fullTurnoutNoticesSent": 0, "purged": 0, "errors": [] }
   ```

> **Troubleshooting — admin actions return "Forbidden"**: The browser's hostname doesn't match `NEXTAUTH_URL` in your `.env`. Fix by updating `NEXTAUTH_URL` to match exactly what's in your browser's address bar (scheme, host, no trailing slash), then `docker compose restart app`. Alternatively, you can append the browser host as a second comma-separated value: `NEXTAUTH_URL=https://original.example.com,https://actual.example.com`.

---

## Image storage

Election logos and candidate photos are uploaded through the admin panel and stored in `public/uploads/` on the host, mounted as a Docker volume so files survive container restarts and rebuilds.

- Avatars are resized to 256×256 px JPEG in the browser before upload; logos are scaled to max 1120 px wide.
- Uploaded images are served with a one-year `Cache-Control: immutable` header. After the first load, browsers and email-client caches (Gmail, Outlook) serve them locally.
- After an election closes, the per-minute cron automatically replaces image files with a 1×1 transparent GIF once the configured retention period has passed (default: 30 days); the image-retention sweep itself is throttled to run at most once per hour. The URLs stay valid — old emails show a blank area rather than a broken-image icon. Change the retention period under **System Settings → Storage & Retention**.

---

## Upgrading

Pull the latest code, rebuild the image, and restart. The entrypoint applies any schema changes automatically on startup.

```bash
git pull
docker compose build
docker compose up -d
```

Check the logs after restart to confirm the schema applied cleanly:

```bash
docker compose logs app | grep -E "Schema|Starting|error"
```

---

## Backups

### In-app backup and restore

Admins can create and download an encrypted backup of the entire database directly from **System Settings → Backup & Restore**, and restore from the same page. This is the simplest option for most self-hosters.

### Manual backup with pg_dump

For scripted or off-site backups, use `pg_dump` against the database volume directly:

```bash
# One-time backup
docker compose exec db pg_dump -U votehost votehost > votehost-$(date +%Y%m%d).sql

# Restore from a backup
docker compose exec -T db psql -U votehost votehost < votehost-20250101.sql
```

For automated nightly backups, add this to your host crontab (`crontab -e`), adjusting paths:

```
0 3 * * * cd /opt/votehost && docker compose exec -T db pg_dump -U votehost votehost > /backups/votehost-$(date +\%Y\%m\%d).sql
```

Uploaded images (logos, avatars) live in the `uploads` Docker volume at `/var/lib/docker/volumes/votehost_uploads`. Include that directory in any filesystem backup you already run.

---

## Election verification

VoteHost Elections uses a layered verification system so that any interested party — not just administrators — can confirm that the published results are accurate and complete.

### How it works

**Ballot receipts** — when a voter submits their ballot, the server generates a unique receipt code (e.g. `ABCD-EFGH-IJKL-MNOP`) and returns it on the confirmation screen and by email. The code does not reveal what the voter chose; it only proves that a ballot was recorded. Anyone can enter a code at `/verify/[electionId]` to confirm it exists in the election ledger.

**Tally hash** — when an election closes, the server computes a SHA-256 hash of every vote record in canonical form and stores it with the election. This hash is displayed on the admin results page and embedded in every export (PDF footer, CSV header comment, XLSX "Verification" sheet). Because the hash is derived from the raw votes, any after-the-fact change to the database — even a single vote — would produce a different hash.

**Audit export** — administrators can download a full anonymised audit package (JSON) from the results page under **Export → Audit export (JSON)**. It contains every vote record (with `ballotId` grouping, but no voter identity), every ballot receipt hash, the tally hash, and the algorithm description needed to recompute it independently.

### What an independent auditor can verify

| Claim | How to verify |
|---|---|
| The tally hash hasn't changed since the election closed | Recompute the hash from the audit export and compare to the published value |
| The vote counts match the raw data | Re-tally the `votes` array in the audit export and compare to the displayed results |
| Every ballot receipt corresponds to a real ballot | Compute each ballot's hash from the audit export and confirm it appears in `ballotReceipts` |
| No extra ballots were silently added | The number of unique `ballotId` values in `votes` must equal the length of `ballotReceipts` |

### Step-by-step audit

**1. Get the published tally hash**

On the admin results page, copy the `sha256:` hash from the "Tally verification" section. The same hash appears on the public verification page at `/verify/[electionId]`.

**2. Download the audit export**

On the admin results page: **Export → Audit export (JSON)**. Save it as `audit.json`.

**3. Run the verification script**

Save the following as `verify.mjs` in the same directory as `audit.json`, then run `node verify.mjs`:

```js
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const audit = JSON.parse(readFileSync("audit.json", "utf8"))

// ── Helper: canonical sort matching the server's algorithm ──────────────────
function sortVotes(votes) {
  return [...votes].sort((a, b) => {
    if (a.questionId !== b.questionId) return a.questionId.localeCompare(b.questionId)
    const ao = a.optionId ?? ""
    const bo = b.optionId ?? ""
    if (ao !== bo) return ao.localeCompare(bo)
    return (a.rank ?? 0) - (b.rank ?? 0)
  })
}

function sha256(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex")
}

// ── 1. Recompute the tally hash ─────────────────────────────────────────────
const canonical = sortVotes(audit.votes).map(v => ({
  ballotId:    v.ballotId,
  questionId:  v.questionId,
  optionId:    v.optionId,
  rank:        v.rank,
  writeInText: v.writeInText,
}))
const computed = "sha256:" + sha256(canonical)
const published = audit.tallyHash
console.log("Published hash:", published)
console.log("Computed hash: ", computed)
console.log("Hash match:    ", computed === published ? "YES ✓" : "NO ✗ — results may have been altered")

// ── 2. Re-tally votes ───────────────────────────────────────────────────────
console.log("\nVote counts by question → option:")
const tally = {}
for (const v of audit.votes) {
  const q = audit.questions.find(q => q.id === v.questionId)?.text ?? v.questionId
  const o = audit.questions.flatMap(q => q.options).find(o => o.id === v.optionId)?.text ?? v.optionId ?? v.writeInText ?? "(write-in)"
  const key = `${q} → ${o}`
  tally[key] = (tally[key] ?? 0) + 1
}
for (const [k, n] of Object.entries(tally)) console.log(`  ${n.toString().padStart(4)}  ${k}`)

// ── 3. Verify ballot receipts ───────────────────────────────────────────────
const groups = Map.groupBy(audit.votes, v => v.ballotId)
let receiptMismatches = 0
for (const [ballotId, ballotVotes] of groups) {
  const ballotCanonical = sortVotes(ballotVotes).map(v => ({
    questionId:  v.questionId,
    optionId:    v.optionId,
    rank:        v.rank,
    writeInText: v.writeInText,
  }))
  const ballotHash = sha256(ballotCanonical)
  if (!audit.ballotReceipts.some(r => r.ballotHash === ballotHash)) {
    console.error(`  No receipt found for ballotId ${ballotId}`)
    receiptMismatches++
  }
}
const uniqueBallots = groups.size
const receiptCount = audit.ballotReceipts.length
console.log(`\nBallot receipt check:`)
console.log(`  Unique ballots in votes: ${uniqueBallots}`)
console.log(`  Receipts in ledger:      ${receiptCount}`)
console.log(`  Counts match:            ${uniqueBallots === receiptCount ? "YES ✓" : "NO ✗"}`)
console.log(`  All ballots have a receipt: ${receiptMismatches === 0 ? "YES ✓" : `NO ✗ — ${receiptMismatches} missing`}`)
```

> **Node.js version note:** `Map.groupBy` requires Node.js 21+. On older versions, replace it with:
> ```js
> const groups = new Map()
> for (const v of audit.votes) {
>   if (!groups.has(v.ballotId)) groups.set(v.ballotId, [])
>   groups.get(v.ballotId).push(v)
> }
> ```

**4. Interpret the results**

- **Hash match: YES** — the vote records in the audit export are identical to what was hashed when the election closed. The results have not been altered.
- **Hash match: NO** — the database was modified after closing. Treat the published results as unverified.
- **Ballot receipt check: YES** — every recorded ballot has a corresponding receipt in the ledger, and the counts match. No ballots were silently added or removed.
- **Vote counts** — compare the tally printed by the script against the results shown in the admin panel. They must match exactly.

### What this cannot prove

If the server itself recorded a different choice than the one a voter submitted (i.e. the server binary lied at the moment of submission), the receipt would still look valid. Closing this gap fully requires browser-side encryption, which is incompatible with ranked-choice and write-in question types. For most organizational elections — where the threat is database tampering or a rogue admin fudging results after the fact — the hash-and-receipt system described above is sufficient.

---

## Security and threat model

VoteHost is designed for small-organisation elections (HOAs, clubs, small nonprofits). Its security model is:

- **Ballot anonymity** — votes are not linked to voter identity in the database
- **Voter authenticity** — magic-link tokens are SHA-256 hashed; plain tokens are never stored
- **Tally integrity** — a SHA-256 hash of the final tally is published at election close; anyone can recompute it from the audit export (see [Election verification](#election-verification))
- **Admin 2FA** — TOTP two-factor authentication is available for all roles; ADMIN and ORGANIZER users are prompted to enrol on first login (dismissible, not enforced at the gate)

VoteHost uses a **server-trust model** — the organisation running the server is trusted. It is not end-to-end verifiable like [Helios](https://heliosvoting.org/) or [Belenios](https://www.belenios.org/). If you need a cryptographically verifiable ballot, those platforms are better suited.

**Tailnet isolation (Tailscale deployments)** — by default the installer joins VoteHost to your tailnet as a tagged device (`tag:votehost`) that is excluded from all peer-to-peer tailnet ACL rules. Funnel traffic from the public internet still reaches it, but a compromise of the app cannot pivot laterally to your laptop, NAS, or other tailnet devices. This is a defense-in-depth measure: the realistic compromise path (web RCE in the app) lands the attacker in the app container, which has no Tailscale credentials or socket. The isolation closes the narrower risk of a tailscaled vulnerability or a future config change exposing that socket. You can opt out at install time; see [Tailscale Funnel](#tailscale-funnel) for both modes and how to switch between them.

For vulnerability reports, see [SECURITY.md](./SECURITY.md).

---

## Development

Requires Node.js 22+ and a local PostgreSQL database.

```bash
git clone https://github.com/Cableboy1515/VoteHost.git
cd VoteHost
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL to your local Postgres, fill in NEXTAUTH_SECRET and CRON_SECRET
npm run dev
```

`npm run dev` starts Prisma's development server alongside Next.js. Visit `http://localhost:3000/setup` to create a local admin account.

Database schema changes are applied with:

```bash
npx prisma db push
```

This project does not use migration files — `prisma db push` is the source of truth for schema state.

---

## License

VoteHost Elections is licensed under the **GNU Affero General Public License v3.0 or later** (AGPL-3.0-or-later). See [LICENSE](./LICENSE) for the full text.

In plain English:
- You are free to use, study, modify, and share VoteHost.
- If you modify VoteHost and run it as a service (including offering paid hosting to others), you must publish your modifications under the AGPL-3.0.
- Derivative works must also be AGPL-3.0-or-later.

"VoteHost" and "VoteHost Elections" are the names of this project. The license covers the source code; it does not grant rights to use these names to promote derivative products without permission.
