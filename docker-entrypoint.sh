#!/bin/sh
set -e

echo "Waiting for Postgres..."
until nc -z db 5432 2>/dev/null; do
  sleep 1
done
echo "Postgres is ready."

echo "Applying database schema..."
node node_modules/.bin/prisma db push --skip-generate
echo "Schema applied."

echo "Starting VoteHost..."
exec node server.js
