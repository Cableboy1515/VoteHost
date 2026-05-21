#!/bin/sh
# Refresh NEXTAUTH_URL in .env after a Tailscale FQDN change.
# Needed when: tailscale_state volume is reset, TS_HOSTNAME changes, or you switch tailnets.
# Run from the VoteHost directory: bash scripts/refresh-tailscale-url.sh
set -e

BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

say()  { printf "${CYAN}%s${NC}\n" "$1"; }
ok()   { printf "${GREEN}✓ %s${NC}\n" "$1"; }
warn() { printf "${YELLOW}! %s${NC}\n" "$1"; }
die()  { printf "${RED}✗ %s${NC}\n" "$1"; exit 1; }

[ -f .env ] || die "No .env found. Run this script from the VoteHost directory."

COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  die "Docker Compose not found."
fi

say "Waiting for Tailscale to authenticate (up to 180s)..."
TS_FQDN=""
_i=0
while [ "$_i" -lt 60 ]; do
  if command -v jq >/dev/null 2>&1; then
    TS_FQDN=$(${COMPOSE_CMD} exec -T tailscale tailscale status --json 2>/dev/null \
               | jq -r '.Self.DNSName // empty' 2>/dev/null \
               | sed 's/\.$//')
  else
    TS_FQDN=$(${COMPOSE_CMD} exec -T tailscale tailscale status --json 2>/dev/null \
               | grep '"DNSName"' | head -1 \
               | sed 's/.*"DNSName" *: *"\([^"]*\)".*/\1/' | sed 's/\.$//')
  fi
  [ -n "$TS_FQDN" ] && [ "$TS_FQDN" != "null" ] && break
  sleep 3
  _i=$((_i + 1))
done

if [ -z "$TS_FQDN" ] || [ "$TS_FQDN" = "null" ]; then
  die "Could not detect Tailscale hostname. Is the tailscale container running? Check: ${COMPOSE_CMD} logs tailscale"
fi

NEXTAUTH_URL="https://${TS_FQDN}"
sed -i.bak "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=${NEXTAUTH_URL}|" .env && rm -f .env.bak
ok "NEXTAUTH_URL updated to ${NEXTAUTH_URL}"

say "Restarting app and cron..."
${COMPOSE_CMD} restart app cron
ok "Done. Your VoteHost URL: ${NEXTAUTH_URL}"
