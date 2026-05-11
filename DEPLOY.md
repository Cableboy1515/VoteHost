# Deployment checklist

## Required environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | JWT signing secret — generate with `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Full public URL of the app (e.g. `https://vote.example.com`) |
| `RESEND_API_KEY` | Optional; can be configured via admin Settings panel instead |
| `CRON_SECRET` | Shared secret for the reminder cron endpoint — generate with `openssl rand -hex 32` |

**The app will refuse to start if `NEXTAUTH_SECRET` is missing.**

## Pre-launch smoke tests

Run these before opening the app to the public:

1. **Proxy guard** — open an incognito window and navigate to `/admin/dashboard`. You must be redirected to `/admin/login`, not shown the dashboard.
2. **API guard** — `curl -X GET https://your-domain.com/api/users` must return `403`, not user data.
3. **Secure cookie** — log in, open browser DevTools → Application → Cookies → confirm `vh_session` has the **Secure** and **HttpOnly** flags set.
4. **First-run setup** — on a fresh DB, navigate to `/admin/setup`. After creating the first admin, confirm that a second visit to `/admin/setup` redirects to `/admin/login`.
5. **SMTP/Resend secrets** — after configuring email settings, do `GET /api/settings/email` (with an admin session). Confirm that `smtp_pass` and `resend_api_key` show `***`, not the actual values.

## Voter reminder cron job

VoteHost does not run a background scheduler — reminders are triggered by an external cron job calling a protected endpoint. Set up a system cron to run every hour:

```
# Edit with: crontab -e
0 * * * * curl -fsS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/reminders/run \
  >> /var/log/votehost-reminders.log 2>&1
```

- Set `CRON_SECRET` in both your `.env` and the cron environment (or inline the value).
- The endpoint returns `{ elections, sent, errors }` — pipe to a log file for monitoring.
- Reminder emails go only to voters where `hasVoted = false` and `invitedAt IS NOT NULL`. They are de-duplicated: each voter receives at most one early reminder and one 24-hour reminder regardless of how often the cron runs.

## Image storage

Election logo images and candidate avatar photos are uploaded through VoteHost's own server and stored in `public/uploads/` on disk. No external image host, API key, or account is required.

**Image sizes:** avatars are resized to 256×256 px JPEG; email logos are scaled to a max width of 1120 px JPEG before upload. Resizing happens in the browser — no large originals are stored.

**Cleanup:** removing an image in the admin panel deletes the file from disk immediately. Deleting an election also deletes all of its associated uploaded images.

**Email images and `NEXTAUTH_URL`:** image URLs in outgoing emails are constructed using `NEXTAUTH_URL`. For images to display in voters' inboxes, your `NEXTAUTH_URL` must be a publicly-reachable URL (the same constraint that already applies to magic links). On a local dev box where `NEXTAUTH_URL=http://localhost:3000`, email recipients won't be able to load images — but the rest of the app still works.

**Cache headers:** uploaded images are served with `Cache-Control: public, max-age=31536000, immutable`. Browsers and email-client proxy caches (Gmail, Outlook) will serve images from cache after the first fetch, reducing repeat server hits to near zero.

## Image retention (reducing long-tail server load)

After an election closes, old emails (invites, reminders, results) may continue to trigger image loads for months as voters revisit their inbox. VoteHost reduces this automatically:

**Automatic sweep (cron-driven):** the existing hourly cron at `/api/reminders/run` also scans for closed elections whose `endsAt` is older than the configured retention period. For each, it overwrites the image files on disk with a 1×1 transparent GIF (~70 bytes). The image URLs remain valid — voters see a blank area instead of a broken-image icon — and cache headers ensure even those 70 bytes are only transferred once per client.

**Configure retention:** go to **Settings → Storage & Retention** in the admin panel. Default is 30 days. Set blank to disable the automatic sweep.

**Purge immediately:** on any closed election's Settings page, an "Uploaded images" card with a **Purge images** button lets you tombstone images on demand without waiting for the cron. The button is disabled and replaced by a "purged on …" timestamp once done.

**This is irreversible.** Once an image is tombstoned, the original file is gone from disk. If you want to keep originals, download them before the retention window or before clicking Purge.

## Database migrations

This project uses `prisma db push` (schema-first, no migration files). After any schema change:

```bash
npx prisma db push
```

## Generating a strong secret

```bash
openssl rand -hex 32
```
