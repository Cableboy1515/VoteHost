# Contributing to VoteHost Elections

Thank you for your interest in contributing! This guide covers local setup,
development workflow, and the conventions used in the codebase.

## Prerequisites

- **Node.js 22+** (`.nvmrc` pins `22`)
- **PostgreSQL 15+** running locally (or via Docker)
- A Resend account or SMTP credentials for email testing (optional — most features work without email in dev)

## Local setup

```bash
git clone https://github.com/Cableboy1515/VoteHost.git
cd VoteHost
npm install
cp .env.example .env
```

Edit `.env` and fill in at minimum:

```
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/votehost
NEXTAUTH_SECRET=<run: openssl rand -hex 32>
CRON_SECRET=<run: openssl rand -hex 32>
SETUP_TOKEN=<run: openssl rand -hex 32>
```

Then start the development server:

```bash
npm run dev
```

Visit `http://localhost:3000/setup` to create your local admin account. Delete
or clear `SETUP_TOKEN` from `.env` once setup is complete.

## Database schema changes

This project uses `prisma db push` as the schema source of truth:

```bash
npx prisma db push          # apply schema.prisma changes to the local DB
npx prisma studio           # optional — browse data in a GUI
```

Edit `prisma/schema.prisma` directly; do not create migration files.

## Lint and build

```bash
npm run lint    # ESLint (eslint-config-next)
npm run build   # Next.js production build (output: standalone)
```

Both must pass before a PR is merged.

## Pull request conventions

- **Target `main`** for all PRs.
- Keep commits focused; squash fixup commits before requesting review.
- Write a short description of _what_ and _why_ — reviewers read the diff for _how_.
- Breaking changes to the self-hosting install flow need a corresponding README
  update in the same PR.

## Contributor License Agreement

By submitting a pull request you agree that your contribution will be licensed
under the [AGPL-3.0-or-later](./LICENSE), the same license as this project.
For the AGPL this also means: if you run a modified version as a network service,
you must provide users access to the modified source.
