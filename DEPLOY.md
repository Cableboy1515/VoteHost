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

## Image hosting (ImgLink)

Election logo images and candidate avatar photos are uploaded directly from the browser to [ImgLink](https://imglink.io) using their anonymous API. No API key or account is required — images are hosted for free and no additional environment variables are needed.

**Delete URLs:** when an image is uploaded, VoteHost stores a delete URL alongside the image URL. This URL is shown to admins in the UI. If you remove an image in the admin panel, VoteHost calls the delete URL automatically. If you need to delete an image manually, open the delete URL in a browser.

**Proxy fallback (advanced):** if your hosting environment blocks outbound browser requests to ImgLink (e.g. strict CSP or Content Security Policy), open `lib/imageHost.ts` and set `USE_PROXY = true`. This routes uploads through the Next.js server at `/api/upload/image` instead. The server-side request is unrestricted, so it will always work. No environment variable needed — it is a compile-time constant.

**Image sizes:** avatars are resized to 256×256 px JPEG; email logos are scaled to a max width of 1120 px JPEG. Resizing happens entirely in the browser before upload — no large originals are ever sent.

## Database migrations

This project uses `prisma db push` (schema-first, no migration files). After any schema change:

```bash
npx prisma db push
```

## Generating a strong secret

```bash
openssl rand -hex 32
```
