#!/bin/sh
set -e

echo "Waiting for Postgres..."
until nc -z db 5432 2>/dev/null; do
  sleep 1
done
echo "Postgres is ready."

# Data migration: if an existing database has the old plaintext 'token' column on
# Voter, backfill a SHA-256 'tokenHash' before db push drops the original column.
# This script is a no-op on fresh installs (table doesn't exist yet).
echo "Running pre-push data migrations..."
node -e "
const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const hasToken = await c.query(
      \"SELECT 1 FROM information_schema.columns WHERE table_name='Voter' AND column_name='token' LIMIT 1\"
    );
    if (hasToken.rowCount > 0) {
      await c.query('ALTER TABLE \"Voter\" ADD COLUMN IF NOT EXISTS \"tokenHash\" TEXT');
      await c.query(
        'UPDATE \"Voter\" SET \"tokenHash\" = encode(sha256(token::bytea), \\'hex\\') WHERE \"tokenHash\" IS NULL'
      );
      console.log('Voter.token → Voter.tokenHash backfill complete');
    }
  } catch (e) {
    // Table does not exist yet (fresh install) — safe to ignore
  }
  await c.end();
}
main().catch(err => { console.error('Pre-push migration error:', err); process.exit(1); });
"

echo "Applying database schema..."
node node_modules/prisma/build/index.js db push --accept-data-loss
echo "Schema applied."

echo "Starting VoteHost Elections..."
exec node server.js
