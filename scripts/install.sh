#!/bin/sh
# VoteHost Elections install wizard — interactive first-time setup
# Creates .env and optionally starts the stack.
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

ask() {
  # ask <prompt> <default>
  printf "${BOLD}%s${NC}" "$1"
  if [ -n "$2" ]; then printf " [%s]" "$2"; fi
  printf ": "
  read -r REPLY
  if [ -z "$REPLY" ] && [ -n "$2" ]; then REPLY="$2"; fi
}

# ── Preflight ──────────────────────────────────────────────────────────────────
printf "\n${BOLD}VoteHost Elections Setup${NC}\n\n"

command -v docker >/dev/null 2>&1 || die "Docker not found. Install Docker Engine: https://docs.docker.com/engine/install/"

COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  die "Docker Compose not found. Install it: https://docs.docker.com/compose/install/"
fi
ok "Docker and Compose found ($COMPOSE_CMD)"

if [ -f .env ]; then
  warn ".env already exists. This script will overwrite it."
  ask "Continue? (y/N)" "N"
  case "$REPLY" in [yY]*) ;; *) die "Aborted."; esac
fi

command -v openssl >/dev/null 2>&1 || die "openssl not found — needed to generate secrets."

# ── Generate secrets ──────────────────────────────────────────────────────────
NEXTAUTH_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
SETUP_TOKEN=$(openssl rand -hex 32)
ok "Secrets generated"

# ── Database credentials ───────────────────────────────────────────────────────
POSTGRES_USER=votehost
POSTGRES_DB=votehost

# ── Public URL / tunnel ────────────────────────────────────────────────────────
printf "\n${BOLD}How will VoteHost Elections be reachable from the internet?${NC}\n"
printf "  1) Cloudflare Tunnel  (recommended — requires a domain on Cloudflare DNS)\n"
printf "  2) Tailscale Funnel   (free, no domain needed — uses *.ts.net URL)\n"
printf "  3) My own reverse proxy / LAN only (I'll set up the URL myself)\n\n"
ask "Choose [1/2/3]" "1"
TUNNEL_CHOICE="$REPLY"

PROFILE=""
CLOUDFLARE_TUNNEL_TOKEN=""
TS_AUTHKEY=""
TS_HOSTNAME="votehost"
NEXTAUTH_URL=""

case "$TUNNEL_CHOICE" in
  1)
    say "\nCloudflare Tunnel selected."
    say "Create a tunnel at: https://one.dash.cloudflare.com → Networks → Tunnels"
    say "The dashboard shows a 'docker run' command. You only need the long token"
    say "at the end (the part after --token, starting with 'eyJ')."
    say "Do NOT paste the entire docker run command — token only."
    ask "Paste only the token" ""
    CLOUDFLARE_TUNNEL_TOKEN="$REPLY"
    [ -z "$CLOUDFLARE_TUNNEL_TOKEN" ] && die "Tunnel token is required."
    case "$CLOUDFLARE_TUNNEL_TOKEN" in
      *" "*|docker*|*--token*)
        die "That looks like the full docker run command, not just the token. Re-run and paste only the long string after --token (starts with 'eyJ').";;
    esac
    ask "Your public URL (e.g. https://vote.example.com)" ""
    NEXTAUTH_URL="$REPLY"
    [ -z "$NEXTAUTH_URL" ] && die "Public URL is required."
    PROFILE="cloudflare"
    ;;
  2)
    say "\nTailscale Funnel selected."
    say "Generate an auth key at: https://login.tailscale.com/admin/settings/keys"
    ask "Paste your Tailscale auth key" ""
    TS_AUTHKEY="$REPLY"
    [ -z "$TS_AUTHKEY" ] && die "Auth key is required."
    ask "Hostname for this machine in your tailnet" "votehost"
    TS_HOSTNAME="$REPLY"
    say "Your public URL will be: https://${TS_HOSTNAME}.<tailnet>.ts.net"
    say "(Update NEXTAUTH_URL in .env once Tailscale shows your full *.ts.net address)"
    NEXTAUTH_URL="https://${TS_HOSTNAME}.example.ts.net"
    PROFILE="tailscale"
    ;;
  *)
    ask "Your public URL (e.g. https://vote.example.com)" ""
    NEXTAUTH_URL="$REPLY"
    [ -z "$NEXTAUTH_URL" ] && die "Public URL is required."
    ;;
esac

# ── First admin account ────────────────────────────────────────────────────────
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
printf "\n${BOLD}Create your first admin account during install?${NC}\n"
say "Recommended — the wizard creates it automatically after the stack starts."
say "If you skip, visit ${NEXTAUTH_URL}/admin/setup and paste the SETUP_TOKEN from .env."
ask "Create admin now? (Y/n)" "Y"
case "$REPLY" in
  [nN]*)
    ADMIN_EMAIL=""
    ADMIN_PASSWORD=""
    ;;
  *)
    ask "Admin email" ""
    ADMIN_EMAIL="$REPLY"
    [ -z "$ADMIN_EMAIL" ] && die "Email is required."
    printf "${BOLD}Admin password (min 8 chars)${NC}: "
    stty -echo; read -r ADMIN_PASSWORD; stty echo; printf "\n"
    [ ${#ADMIN_PASSWORD} -lt 8 ] && die "Password must be at least 8 characters."
    printf "${BOLD}Confirm password${NC}: "
    stty -echo; read -r ADMIN_PASSWORD_CONFIRM; stty echo; printf "\n"
    [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ] && die "Passwords do not match."
    ;;
esac

# ── Write .env ─────────────────────────────────────────────────────────────────
cat > .env <<EOF
# Generated by scripts/install.sh
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}

NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=${NEXTAUTH_URL}

CRON_SECRET=${CRON_SECRET}

CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
TS_AUTHKEY=${TS_AUTHKEY}
TS_HOSTNAME=${TS_HOSTNAME}

SETUP_TOKEN=${SETUP_TOKEN}
EOF
chmod 600 .env
ok ".env written (mode 600)"

# ── Launch ─────────────────────────────────────────────────────────────────────
printf "\n${BOLD}Ready to start VoteHost Elections.${NC}\n"
if [ -n "$PROFILE" ]; then
  COMPOSE_UP="${COMPOSE_CMD} --profile ${PROFILE} up -d"
else
  COMPOSE_UP="${COMPOSE_CMD} up -d"
fi

ask "Start VoteHost Elections now? (y/N)" "y"
case "$REPLY" in
  [yY]*)
    say "Building and starting containers..."
    eval "$COMPOSE_UP --build"
    ok "VoteHost Elections is running!"
    if [ "$TUNNEL_CHOICE" = "2" ]; then
      warn "Tailscale: check '${COMPOSE_CMD} logs tailscale' for your full *.ts.net URL, then update NEXTAUTH_URL in .env."
    fi
    printf "\n"
    if [ -n "$ADMIN_EMAIL" ]; then
      say "Waiting for app to become healthy (up to 120s)..."
      i=0
      while [ $i -lt 60 ]; do
        if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
          break
        fi
        sleep 2
        i=$((i + 1))
      done
      if ! curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
        warn "App did not become healthy in time. Check: ${COMPOSE_CMD} logs app"
        warn "Bootstrap manually: visit ${NEXTAUTH_URL}/admin/setup and paste SETUP_TOKEN from .env"
      else
        say "Creating admin account..."
        HTTP_CODE=$(curl -s -o /tmp/votehost-bootstrap.json -w "%{http_code}" \
          -X POST -H 'Content-Type: application/json' \
          --data "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\",\"role\":\"ADMIN\",\"setupToken\":\"${SETUP_TOKEN}\"}" \
          http://127.0.0.1:3000/api/users)
        if [ "$HTTP_CODE" = "201" ]; then
          ok "Admin account created for ${ADMIN_EMAIL}"
          say "Login at: ${NEXTAUTH_URL}/admin/login"
        else
          warn "Bootstrap returned HTTP ${HTTP_CODE}:"
          cat /tmp/votehost-bootstrap.json; printf "\n"
          warn "Finish manually: visit ${NEXTAUTH_URL}/admin/setup and paste SETUP_TOKEN from .env"
        fi
        rm -f /tmp/votehost-bootstrap.json
      fi
    else
      say "Next step: visit ${NEXTAUTH_URL}/admin/setup"
      say "Paste the SETUP_TOKEN from your .env file to create your admin account."
    fi
    ;;
  *)
    printf "\nWhen ready, run:\n  ${COMPOSE_UP} --build\n"
    if [ -n "$ADMIN_EMAIL" ]; then
      say "After starting, re-run this script or visit ${NEXTAUTH_URL}/admin/setup (paste SETUP_TOKEN from .env)."
    fi
    ;;
esac
