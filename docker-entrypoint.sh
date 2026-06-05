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

echo "Running pre-push migration: voter token history backfill..."
node -e "
const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const hasTokenHash = await c.query(
      \"SELECT 1 FROM information_schema.columns WHERE table_name='Voter' AND column_name='tokenHash' LIMIT 1\"
    );
    const hasHistory = await c.query(
      \"SELECT 1 FROM information_schema.tables WHERE table_name='VoterTokenHistory' LIMIT 1\"
    );
    if (hasTokenHash.rowCount > 0 && hasHistory.rowCount === 0) {
      await c.query(\`
        CREATE TABLE \"VoterTokenHistory\" (
          \"id\" TEXT PRIMARY KEY,
          \"voterId\" TEXT NOT NULL REFERENCES \"Voter\"(\"id\") ON DELETE CASCADE,
          \"tokenHash\" TEXT NOT NULL UNIQUE,
          \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      \`);
      await c.query('CREATE INDEX \"VoterTokenHistory_voterId_idx\" ON \"VoterTokenHistory\"(\"voterId\")');
      await c.query(\`
        INSERT INTO \"VoterTokenHistory\" (\"id\", \"voterId\", \"tokenHash\", \"createdAt\")
        SELECT
          'mig_' || md5(\"id\" || '_' || \"tokenHash\"),
          \"id\",
          \"tokenHash\",
          COALESCE(\"invitedAt\", NOW())
        FROM \"Voter\"
        WHERE \"tokenHash\" IS NOT NULL
      \`);
      console.log('Voter.tokenHash to VoterTokenHistory backfill complete');
    }
  } catch (e) {
    // Table does not exist yet (fresh install) - safe to ignore
  }
  await c.end();
}
main().catch(err => { console.error('Pre-push history migration error:', err); process.exit(1); });
"

echo "Running pre-push migration: QuestionType WRITE_IN → COMMENT rename..."
node -e "
const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const hasOld = await c.query(
      \"SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='QuestionType' AND e.enumlabel='WRITE_IN' LIMIT 1\"
    );
    const hasNew = await c.query(
      \"SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='QuestionType' AND e.enumlabel='COMMENT' LIMIT 1\"
    );
    if (hasOld.rowCount > 0 && hasNew.rowCount === 0) {
      await c.query('ALTER TYPE \"QuestionType\" RENAME VALUE \\'WRITE_IN\\' TO \\'COMMENT\\'');
      console.log('QuestionType WRITE_IN → COMMENT rename complete');
    } else {
      console.log('QuestionType WRITE_IN → COMMENT: no action needed');
    }
  } catch (e) {
    // Type does not exist yet (fresh install) — safe to ignore
  }
  await c.end();
}
main().catch(err => { console.error('Pre-push enum migration error:', err); process.exit(1); });
"

echo "Applying database schema..."
node node_modules/prisma/build/index.js db push --accept-data-loss
echo "Schema applied."

echo "Starting VoteHost Elections..."
exec node server.js
