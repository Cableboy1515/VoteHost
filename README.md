# VoteHost

VoteHost is a self-hosted election platform for organizations that need secure, private voting without relying on third-party services. Admins manage elections and voters through a web panel; voters receive a magic link by email and cast their ballot anonymously without creating an account.

Designed to run on a Raspberry Pi, mini PC, or any Linux server — single `docker compose up` and you're live.

---

## Features

- **Secret ballot** — votes are recorded anonymously; no one can link a submitted ballot to a voter
- **Magic link voting** — voters click a link in their email, no account or password required
- **Multiple question types** — single choice, multiple choice (with optional seat limit), ranked choice, and free-text write-in
- **Candidate profiles** — photo avatars, bio text, and website links; voters expand details inline
- **Per-voter option randomization** — eliminates primacy bias with a deterministic shuffle seeded by each voter's token
- **Email invitations and reminders** — configurable early reminder and a 24-hour final reminder; each voter receives at most one of each regardless of how often the cron runs
- **Results announcement** — one-click results email with charts sent to all voters after the election closes
- **Customizable email branding** — per-election subject, message body, header logo, and footer
- **Image retention** — uploaded logos and avatars are automatically replaced with a transparent placeholder after a configurable number of days, reducing long-term server load from old inbox links
- **Admin roles** — ADMIN (full access including user management and settings) and ORGANIZER (election management only)
- **SMTP or Resend** — bring your own email provider; configured through the admin settings panel

---

## Requirements

- A Linux machine (Raspberry Pi 4/5, mini PC, VPS, Proxmox LXC, etc.) with at least 1 GB RAM
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

The wizard will ask which tunnel option you're using, prompt for the relevant token, and then offer to run `docker compose up` for you. Once the containers are healthy, follow the link it prints to `/admin/setup` to create your first admin account.

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
| `NEXTAUTH_URL` | Your public URL, e.g. `https://vote.example.com` |
| `CRON_SECRET` | `openssl rand -hex 32` |

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

You should see `Postgres is ready`, `Schema applied`, and `Starting VoteHost` within about 30 seconds.

**5. Create your admin account**

Visit `https://your-domain.com/admin/setup` (or `http://localhost:3000/admin/setup` for a local test).

---

## Tunnel options

The app binds only to `127.0.0.1:3000` on the host. To make it reachable from the internet, use one of the profiles below.

### Cloudflare Tunnel

Requires a domain you control on Cloudflare DNS. The tunnel is free; domain registration is typically around $10/year.

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → Networks → Tunnels → Create a tunnel
2. Choose Docker, copy the token from the `docker run` command shown
3. Add to your `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=<your-token>
   NEXTAUTH_URL=https://vote.example.com
   ```
4. In the Cloudflare dashboard, configure a Public Hostname pointing your domain to `http://localhost:3000`
5. Start with the cloudflare profile:
   ```bash
   docker compose --profile cloudflare up -d
   ```

### Tailscale Funnel

No domain required. Gives you a stable `https://<hostname>.<tailnet>.ts.net` URL that's publicly reachable.

1. Go to [Tailscale admin](https://login.tailscale.com/admin/settings/keys) → Settings → Keys → Generate auth key
2. Add to your `.env`:
   ```
   TS_AUTHKEY=<your-key>
   TS_HOSTNAME=votehost
   ```
3. Start with the tailscale profile:
   ```bash
   docker compose --profile tailscale up -d
   ```
4. Check the Tailscale logs for your full public URL:
   ```bash
   docker compose logs tailscale
   ```
5. Update `NEXTAUTH_URL` in `.env` with the `*.ts.net` address, then restart the app:
   ```bash
   docker compose restart app
   ```

### Own reverse proxy

Leave the tunnel profiles unused. The app is at `http://127.0.0.1:3000` on the host. Point your nginx, Caddy, or Traefik config at it and handle TLS yourself.

---

## Email setup

VoteHost sends email for ballot invitations, reminders, and results announcements. Configure email in the admin panel under **Settings** after your first login.

### SMTP (recommended for most self-hosters)

Any standard SMTP provider works. Tested options:

| Provider | Host | Port | Daily limit | Notes |
|---|---|---|---|---|
| iCloud Mail | `smtp.mail.me.com` | 587 | ~1,000 | Requires an [app-specific password](https://support.apple.com/en-us/102654), not your Apple ID password |
| Gmail | `smtp.gmail.com` | 587 | 500 | Requires an [app password](https://myaccount.google.com/apppasswords) with 2FA enabled |
| Brevo | `smtp-relay.brevo.com` | 587 | 300 (free) | Free tier; create account at brevo.com |
| Fastmail | `smtp.fastmail.com` | 587 | No daily limit | Paid service |

In the admin panel: **Settings → Email → SMTP settings**. Enter the host, port, username, and password. Use the "Send test email" button to confirm delivery before your first election.

### Resend

If you prefer an API-based approach:

1. Create an account at [resend.com](https://resend.com) and generate an API key
2. In the admin panel: **Settings → Email → Resend API key**

The Resend free tier allows 100 emails/day and 3,000/month — sufficient for small elections. For elections with more than 100 voters, use SMTP or a paid Resend plan.

---

## First run checklist

After setup and email configuration, run through these before your first election:

1. **Proxy guard** — open an incognito window and navigate to `/admin/dashboard`. You must be redirected to `/admin/login`.
2. **API guard** — `curl -X GET https://your-domain.com/api/users` must return `403`.
3. **Secure cookie** — log in, open browser DevTools → Application → Cookies → confirm `vh_session` has `Secure` and `HttpOnly` set.
4. **Email test** — Settings → Email → Send test email. Confirm it arrives.
5. **Cron test** — confirm the reminder endpoint responds:
   ```bash
   source .env
   curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://your-domain.com/api/reminders/run | jq
   ```
   Should return `{ "elections": 0, "sent": 0, "purged": 0, "errors": [] }`.

---

## Image storage

Election logos and candidate photos are uploaded through the admin panel and stored in `public/uploads/` on the host, mounted as a Docker volume so files survive container restarts and rebuilds.

- Avatars are resized to 256×256 px JPEG in the browser before upload; logos are scaled to max 1120 px wide.
- Uploaded images are served with a one-year `Cache-Control: immutable` header. After the first load, browsers and email-client caches (Gmail, Outlook) serve them locally.
- After an election closes, the hourly cron automatically replaces image files with a 1×1 transparent GIF once the configured retention period has passed (default: 30 days). The URLs stay valid — old emails show a blank area rather than a broken-image icon. Change the retention period under **Settings → Storage & Retention**.

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

The database lives in a named Docker volume. Back it up with `pg_dump`:

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

`npm run dev` starts Prisma's development server alongside Next.js. Visit `http://localhost:3000/admin/setup` to create a local admin account.

Database schema changes are applied with:

```bash
npx prisma db push
```

This project does not use migration files — `prisma db push` is the source of truth for schema state.
