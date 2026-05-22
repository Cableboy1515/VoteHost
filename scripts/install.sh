#!/bin/sh
# VoteHost Elections install wizard — interactive first-time setup
# Creates .env and optionally starts the stack.
#
# Unattended mode: set VOTEHOST_UNATTENDED=1 plus:
#   VOTEHOST_TUNNEL_MODE              — cloudflare | tailscale | lan
#   VOTEHOST_PUBLIC_URL               — required for cloudflare and lan modes
#   VOTEHOST_CLOUDFLARE_TUNNEL_TOKEN  — required for cloudflare mode
#   VOTEHOST_TS_AUTHKEY               — required for tailscale mode
#   VOTEHOST_TS_HOSTNAME              — tailscale hostname (default: votehost)
#   VOTEHOST_TAILSCALE_ISOLATE        — 1 (default) to tag+isolate from tailnet, 0 to skip
#   VOTEHOST_ADMIN_EMAIL              — optional; skips admin bootstrap if unset
#   VOTEHOST_ADMIN_PASSWORD           — required when VOTEHOST_ADMIN_EMAIL is set
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

_validate_ts_authkey() {
  # Accepts optional arg; falls back to $TS_AUTHKEY. Trims whitespace, checks prefix.
  _key="${1:-$TS_AUTHKEY}"
  _key=$(printf '%s' "$_key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [ -z "$_key" ] && die "Tailscale auth key is required."
  case "$_key" in
    tskey-auth-*) ;;
    *) die "Tailscale auth keys start with 'tskey-auth-...'. Copy the full key from https://login.tailscale.com/admin/settings/keys" ;;
  esac
  case "$_key" in
    *[[:space:]]*) die "Tailscale auth key must not contain spaces." ;;
  esac
  TS_AUTHKEY="$_key"
}

_wait_for_ts_fqdn() {
  # Polls tailscale container until it authenticates; prints FQDN (no trailing dot).
  # All status messages go to stderr so stdout is clean for command substitution capture.
  # Returns 1 on timeout or fatal auth-key rejection.
  say "Waiting for Tailscale to authenticate (up to 180s)..." >&2
  _i=0
  while [ "$_i" -lt 60 ]; do
    # Fast-fail on known fatal auth errors so the user sees the real cause
    # instead of a generic timeout.
    _logs=$(${COMPOSE_CMD} logs --tail=50 tailscale 2>/dev/null || true)
    case "$_logs" in
      *"invalid key"*|*"key not valid"*|*"not a valid key"*)
        printf '%s\n' "$_logs" | grep -E 'invalid key|key not valid|not a valid key' | tail -1 >&2
        return 1
        ;;
    esac

    if command -v jq >/dev/null 2>&1; then
      _fqdn=$(${COMPOSE_CMD} exec -T tailscale tailscale status --json 2>/dev/null \
               | jq -r '.Self.DNSName // empty' 2>/dev/null \
               | sed 's/\.$//')
    else
      _fqdn=$(${COMPOSE_CMD} exec -T tailscale tailscale status --json 2>/dev/null \
               | grep '"DNSName"' | head -1 \
               | sed 's/.*"DNSName" *: *"\([^"]*\)".*/\1/' | sed 's/\.$//')
    fi
    if [ -n "$_fqdn" ] && [ "$_fqdn" != "null" ]; then
      printf '%s' "$_fqdn"
      return 0
    fi
    sleep 3
    _i=$((_i + 1))
  done
  return 1
}

UNATTENDED="${VOTEHOST_UNATTENDED:-}"

# ── Validate unattended env vars (fail fast before doing anything) ─────────────
if [ -n "$UNATTENDED" ]; then
  _TUNNEL="${VOTEHOST_TUNNEL_MODE:-}"
  case "$_TUNNEL" in
    cloudflare|tailscale|lan) ;;
    *) die "VOTEHOST_TUNNEL_MODE must be cloudflare, tailscale, or lan (got: '${_TUNNEL}')." ;;
  esac
  if [ "$_TUNNEL" != "tailscale" ]; then
    [ -z "${VOTEHOST_PUBLIC_URL:-}" ] && die "VOTEHOST_PUBLIC_URL is required for tunnel mode '${_TUNNEL}'."
  fi
  [ "$_TUNNEL" = "cloudflare" ] && [ -z "${VOTEHOST_CLOUDFLARE_TUNNEL_TOKEN:-}" ] && \
    die "VOTEHOST_CLOUDFLARE_TUNNEL_TOKEN is required for cloudflare mode."
  [ "$_TUNNEL" = "tailscale" ] && [ -z "${VOTEHOST_TS_AUTHKEY:-}" ] && \
    die "VOTEHOST_TS_AUTHKEY is required for tailscale mode."
  [ "$_TUNNEL" = "tailscale" ] && [ -n "${VOTEHOST_TS_AUTHKEY:-}" ] && \
    _validate_ts_authkey "${VOTEHOST_TS_AUTHKEY}"
  if [ "$_TUNNEL" = "tailscale" ]; then
    _VH_ISOLATE="${VOTEHOST_TAILSCALE_ISOLATE:-1}"
    case "$_VH_ISOLATE" in 0|1) ;; *) die "VOTEHOST_TAILSCALE_ISOLATE must be 0 or 1." ;; esac
  else
    _VH_ISOLATE=0
  fi
  if [ -n "${VOTEHOST_ADMIN_EMAIL:-}" ]; then
    [ -z "${VOTEHOST_ADMIN_PASSWORD:-}" ] && die "VOTEHOST_ADMIN_PASSWORD is required when VOTEHOST_ADMIN_EMAIL is set."
    [ "${#VOTEHOST_ADMIN_PASSWORD}" -lt 8 ] && die "VOTEHOST_ADMIN_PASSWORD must be at least 8 characters."
  fi
fi

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
  if [ -n "$UNATTENDED" ]; then
    warn ".env already exists — overwriting."
  else
    warn ".env already exists. This script will overwrite it."
    ask "Continue? (y/N)" "N"
    case "$REPLY" in [yY]*) ;; *) die "Aborted."; esac
  fi
fi

# Detect stale db_data volume — Postgres only sets the password on first init,
# so if the volume exists and we're about to write a new random password the
# credentials will mismatch and prisma db push will fail with P1000.
VOLUME_NAME="${COMPOSE_PROJECT_NAME:-votehost}_db_data"
if docker volume inspect "$VOLUME_NAME" >/dev/null 2>&1; then
  warn "Existing database volume detected ($VOLUME_NAME)."
  warn "Re-running the installer generates a new random password, but Postgres"
  warn "keeps the original password baked into the volume — causing auth failures."
  if [ -n "$UNATTENDED" ]; then
    warn "Removing stale volume so Postgres re-initializes with the new password..."
    docker compose down -v >/dev/null 2>&1 || true
    ok "Volume removed."
  else
    printf "\n"
    ask "Remove the old volume and start fresh? (Y/n)" "Y"
    case "$REPLY" in
      [nN]*)
        warn "Keeping existing volume. Make sure your .env password matches the"
        warn "original one used to create the volume, or auth will fail."
        ;;
      *)
        say "Removing stale volume..."
        docker compose down -v >/dev/null 2>&1 || true
        ok "Volume removed. Postgres will re-initialize with the new password."
        ;;
    esac
  fi
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
PROFILE=""
CLOUDFLARE_TUNNEL_TOKEN=""
TS_AUTHKEY=""
TS_HOSTNAME="votehost"
NEXTAUTH_URL=""
TUNNEL_CHOICE=""
_VH_ISOLATE=0

if [ -n "$UNATTENDED" ]; then
  case "${VOTEHOST_TUNNEL_MODE}" in
    cloudflare)
      TUNNEL_CHOICE="1"
      CLOUDFLARE_TUNNEL_TOKEN="${VOTEHOST_CLOUDFLARE_TUNNEL_TOKEN}"
      NEXTAUTH_URL="${VOTEHOST_PUBLIC_URL}"
      PROFILE="cloudflare"
      ;;
    tailscale)
      TUNNEL_CHOICE="2"
      TS_AUTHKEY="${VOTEHOST_TS_AUTHKEY}"
      TS_HOSTNAME="${VOTEHOST_TS_HOSTNAME:-votehost}"
      NEXTAUTH_URL="${VOTEHOST_PUBLIC_URL:-https://${TS_HOSTNAME}.example.ts.net}"
      PROFILE="tailscale"
      _VH_ISOLATE="${VOTEHOST_TAILSCALE_ISOLATE:-1}"
      ;;
    lan)
      TUNNEL_CHOICE="3"
      NEXTAUTH_URL="${VOTEHOST_PUBLIC_URL}"
      ;;
  esac
else
  printf "\n${BOLD}How will VoteHost Elections be reachable from the internet?${NC}\n"
  printf "  1) Cloudflare Tunnel  (recommended — requires a domain on Cloudflare DNS)\n"
  printf "  2) Tailscale Funnel   (free, no domain needed — uses *.ts.net URL)\n"
  printf "  3) My own reverse proxy / LAN only (I'll set up the URL myself)\n\n"
  ask "Choose [1/2/3]" "1"
  TUNNEL_CHOICE="$REPLY"

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
      say ""
      printf "${BOLD}Isolate VoteHost from your other tailnet devices? (Y/n)${NC}\n"
      say "  Y (recommended): VoteHost joins as a tagged device (tag:votehost)."
      say "    Reachable only via the public Funnel URL — not from your laptop/NAS."
      say "    If the app is ever compromised, the attacker cannot pivot to other"
      say "    tailnet devices. Requires a one-time tailnet policy update (shown next)."
      say ""
      say "  n: VoteHost joins as a normal tailnet peer — simpler setup, no ACL changes."
      say "    Suitable for solo tailnets or trusted environments."
      ask "Choose [Y/n]" "Y"
      case "$REPLY" in
        [nN]*) _VH_ISOLATE=0 ;;
        *)     _VH_ISOLATE=1 ;;
      esac
      say ""
      if [ "$_VH_ISOLATE" = "1" ]; then
        say "One-time tailnet configuration (free, ~1 min):"
        say "  1. Enable HTTPS certificates:"
        say "       https://login.tailscale.com/admin/dns  ->  Enable HTTPS"
        say ""
        say "  2. Open your tailnet policy file:"
        say "       https://login.tailscale.com/admin/acls/file"
        say "     Add (or merge) these three sections, then Save:"
        say ""
        say "     a) Declare the tag:"
        say "          \"tagOwners\": {"
        say "            \"tag:votehost\": [\"autogroup:admin\"]"
        say "          }"
        say ""
        say "     b) Grant it Funnel:"
        say "          \"nodeAttrs\": ["
        say "            { \"target\": [\"tag:votehost\"], \"attr\": [\"funnel\"] }"
        say "          ]"
        say ""
        say "     c) Isolate it from your other tailnet devices."
        say "        Replace any default {\"src\":[\"*\"],\"dst\":[\"*:*\"]} rule with:"
        say "          \"acls\": ["
        say "            { \"action\": \"accept\","
        say "              \"src\":    [\"autogroup:member\"],"
        say "              \"dst\":    [\"autogroup:member:*\"] }"
        say "          ]"
        say "        Your other devices still reach each other; tag:votehost is excluded."
        say ""
        say "Save the policy, then generate a Reusable auth key:"
        say "  https://login.tailscale.com/admin/settings/keys"
        say "  (No need to pre-tag the key — the installer requests tag:votehost automatically.)"
      else
        say "Tailnet configuration (free, ~30 s):"
        say "  1. Enable HTTPS certificates:"
        say "       https://login.tailscale.com/admin/dns  ->  Enable HTTPS"
        say ""
        say "  2. Open your tailnet policy file:"
        say "       https://login.tailscale.com/admin/acls/file"
        say "     Add to nodeAttrs and Save:"
        say "       { \"target\": [\"autogroup:member\"], \"attr\": [\"funnel\"] }"
        say ""
        say "Generate a Reusable auth key:"
        say "  https://login.tailscale.com/admin/settings/keys"
      fi
      ask "Paste your Tailscale auth key" ""
      TS_AUTHKEY="$REPLY"
      _validate_ts_authkey
      ask "Hostname for this machine in your tailnet" "votehost"
      TS_HOSTNAME="$REPLY"
      say "Your public URL will be: https://${TS_HOSTNAME}.<tailnet>.ts.net"
      say "The installer will auto-detect your full *.ts.net hostname after startup."
      NEXTAUTH_URL="https://${TS_HOSTNAME}.example.ts.net"
      PROFILE="tailscale"
      ;;
    *)
      ask "Your public URL (e.g. https://vote.example.com)" ""
      NEXTAUTH_URL="$REPLY"
      [ -z "$NEXTAUTH_URL" ] && die "Public URL is required."
      ;;
  esac
fi

# ── First admin account ────────────────────────────────────────────────────────
ADMIN_EMAIL=""
ADMIN_PASSWORD=""

if [ -n "$UNATTENDED" ]; then
  ADMIN_EMAIL="${VOTEHOST_ADMIN_EMAIL:-}"
  ADMIN_PASSWORD="${VOTEHOST_ADMIN_PASSWORD:-}"
else
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
fi

# ── Write .env ─────────────────────────────────────────────────────────────────
if [ "$_VH_ISOLATE" = "1" ]; then
  TS_EXTRA_ARGS="--advertise-tags=tag:votehost"
else
  TS_EXTRA_ARGS=""
fi
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
TS_EXTRA_ARGS=${TS_EXTRA_ARGS}

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

_DO_START=1
if [ -z "$UNATTENDED" ]; then
  ask "Start VoteHost Elections now? (y/N)" "y"
  case "$REPLY" in
    [yY]*) _DO_START=1 ;;
    *)     _DO_START=0 ;;
  esac
fi

if [ "$_DO_START" = "1" ]; then
  say "Building and starting containers..."
  eval "$COMPOSE_UP --build"
  ok "VoteHost Elections is running!"
  TS_OK=0
  if [ "$TUNNEL_CHOICE" = "2" ]; then
    if TS_FQDN=$(_wait_for_ts_fqdn); then
      NEXTAUTH_URL="https://${TS_FQDN}"
      sed -i.bak "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=${NEXTAUTH_URL}|" .env && rm -f .env.bak
      ${COMPOSE_CMD} up -d --force-recreate --no-deps app cron >/dev/null
      ok "Tailscale ready! Your VoteHost URL: ${NEXTAUTH_URL}"
      TS_OK=1
      # Warn if Funnel isn't live — the URL only works from inside the tailnet without it
      _funnel_status=$(${COMPOSE_CMD} exec -T tailscale tailscale funnel status 2>&1 || true)
      case "$_funnel_status" in
        *"not available"*|*"not enabled"*|*"requires"*|*"cannot"*|*"Error"*)
          warn "Funnel may not be enabled on your tailnet."
          warn "Your URL currently only resolves from devices on your tailnet."
          warn "To make it publicly reachable, enable both:"
          warn "  • HTTPS certificates: https://login.tailscale.com/admin/dns"
          warn "  • Funnel node attribute: https://login.tailscale.com/admin/acls/file"
          warn "    Add to nodeAttrs: { \"target\": [\"autogroup:member\"], \"attr\": [\"funnel\"] }"
          warn "Then: ${COMPOSE_CMD} --profile tailscale up -d --force-recreate tailscale"
          ;;
      esac
    else
      warn "Tailscale did not come up. See the error line above for the specific cause."
      warn "Most common cause: auth key was single-use and already consumed by a"
      warn "prior install attempt, or it is an API access token rather than an auth key."
      warn "Recovery:"
      warn "  1. Generate a new key at https://login.tailscale.com/admin/settings/keys"
      warn "     Check 'Reusable' so re-running install does not burn it."
      warn "  2. Edit .env: replace TS_AUTHKEY=... with the new key."
      warn "  3. ${COMPOSE_CMD} --profile tailscale up -d --force-recreate tailscale"
      warn "  4. bash scripts/refresh-tailscale-url.sh   (patches NEXTAUTH_URL + recreates app)"
      warn "  5. Visit <real ts.net url>/admin/setup and paste SETUP_TOKEN from .env."
    fi
  fi
  printf "\n"
  if [ -n "$ADMIN_EMAIL" ] && { [ "$TUNNEL_CHOICE" != "2" ] || [ "$TS_OK" = "1" ]; }; then
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
        -H "Origin: ${NEXTAUTH_URL}" \
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
  elif [ -n "$ADMIN_EMAIL" ]; then
    warn "Skipping admin bootstrap because Tailscale did not come up."
    warn "After completing the recovery steps above:"
    warn "  Visit <real ts.net url>/admin/setup and paste SETUP_TOKEN from .env"
  else
    say "Next step: visit ${NEXTAUTH_URL}/admin/setup"
    say "Paste the SETUP_TOKEN from your .env file to create your admin account."
  fi
else
  printf "\nWhen ready, run:\n  ${COMPOSE_UP} --build\n"
  if [ -n "$ADMIN_EMAIL" ]; then
    say "After starting, re-run this script or visit ${NEXTAUTH_URL}/admin/setup (paste SETUP_TOKEN from .env)."
  fi
fi
