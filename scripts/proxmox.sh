#!/usr/bin/env bash
# VoteHost Elections — Proxmox LXC Installer
#
# Run this on your Proxmox VE host:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/Cableboy1515/VoteHost/main/scripts/proxmox.sh)"
#
# Creates an unprivileged Debian 12 LXC, installs Docker, clones VoteHost,
# and runs the install wizard non-interactively. Takes 4–8 minutes.
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
DIM='\033[2m'
NC='\033[0m'

say()    { printf "  ${CYAN}%s${NC}\n" "$1"; }
ok()     { printf "  ${GREEN}✓ %s${NC}\n" "$1"; }
warn()   { printf "  ${YELLOW}! %s${NC}\n" "$1"; }
die()    { printf "\n  ${RED}✗ %s${NC}\n\n" "$1" >&2; exit 1; }
header() { printf "\n${BOLD}${MAGENTA}▸ %s${NC}\n" "$1"; }
dim()    { printf "  ${DIM}%s${NC}\n" "$1"; }

prompt() {
  # prompt "Question text" VARNAME "default"
  local msg="$1" var="$2" def="${3:-}"
  printf "  ${BOLD}%s${NC}" "$msg"
  [ -n "$def" ] && printf " ${DIM}[%s]${NC}" "$def"
  printf ": "
  local _val
  read -r _val
  if [ -z "$_val" ] && [ -n "$def" ]; then _val="$def"; fi
  printf -v "$var" '%s' "$_val"
}

confirm() {
  printf "  ${BOLD}%s${NC} " "$1"
  local _c
  read -r _c
  case "${_c:-$2}" in [yY]*) return 0 ;; *) return 1 ;; esac
}

# Shell-safe quoting: wraps value in single quotes, escaping embedded single quotes.
# Produces values safe to source with `. file`.
q() { printf '%s' "$1" | sed "s/'/'\\\\''/g; 1s/^/'/; \$s/\$/'/" ; }

# ── Header ────────────────────────────────────────────────────────────────────
printf "\n"
printf "  ${BOLD}${CYAN}VoteHost Elections${NC} — Proxmox LXC Installer\n"
printf "  ${DIM}github.com/Cableboy1515/VoteHost${NC}\n"
printf "\n"

# ── Preflight ─────────────────────────────────────────────────────────────────
header "Preflight"

[ "$(id -u)" -eq 0 ] || die "Must run as root. Try: sudo bash proxmox.sh"

for _cmd in pct pveam pvesh pvesm; do
  command -v "$_cmd" >/dev/null 2>&1 || die "Command '$_cmd' not found. Is this a Proxmox VE host?"
done

PVE_VER=$(pveversion --nocolor 2>/dev/null | grep -oP 'pve-manager/\K[0-9]+\.[0-9]+' || echo "unknown")
ok "Proxmox VE ${PVE_VER} detected"

# ── Container settings ────────────────────────────────────────────────────────
header "Container Settings"

NEXT_CTID=$(pvesh get /cluster/nextid 2>/dev/null || echo "100")
prompt "Container ID" CTID "$NEXT_CTID"
pct status "$CTID" >/dev/null 2>&1 && die "Container $CTID already exists. Pick a different ID."

prompt "Hostname" CT_HOSTNAME "votehost"

printf "\n"
say "Available storages (rootfs):"
pvesm status -content rootdir 2>/dev/null | awk 'NR>1 {printf "    %-20s %s\n", $1, $2}' || true
printf "\n"
prompt "Storage for rootfs" CT_STORAGE "local-lvm"

printf "\n"
say "Available bridges:"
ip link show type bridge 2>/dev/null | awk '/^[0-9]+:/{sub(/:$/,"",$2); printf "    %s\n", $2}' || true
printf "\n"
prompt "Network bridge" CT_BRIDGE "vmbr0"

say "Network: press Enter for DHCP, or enter IP/CIDR,gw=GATEWAY"
dim  "  Example static: 192.168.1.50/24,gw=192.168.1.1"
prompt "IP address" CT_IP "dhcp"

# ── Resources ─────────────────────────────────────────────────────────────────
header "Resources"
dim "Recommended: 2 vCPU / 4096 MB RAM / 20 GB disk"
dim "Minimum:     1 vCPU / 2048 MB RAM / 12 GB disk"
printf "\n"
prompt "vCPU cores" CT_CORES "2"
prompt "RAM (MB)"   CT_RAM   "4096"
prompt "Disk (GB)"  CT_DISK  "20"

# ── Public access ─────────────────────────────────────────────────────────────
header "Public Access"
printf "  1) Cloudflare Tunnel  ${DIM}(recommended — no port forwarding, works behind NAT)${NC}\n"
printf "  2) Tailscale Funnel   ${DIM}(free *.ts.net URL — requires Tailscale account)${NC}\n"
printf "  3) LAN only           ${DIM}(I'll set up my own reverse proxy)${NC}\n"
printf "\n"
prompt "Choose [1/2/3]" ACCESS_CHOICE "1"

TUNNEL_MODE=""
PUBLIC_URL=""
CF_TOKEN=""
TS_AUTHKEY=""
TS_HOSTNAME="votehost"
EXPOSE_LAN=0

case "$ACCESS_CHOICE" in
  1)
    TUNNEL_MODE="cloudflare"
    printf "\n"
    say "Open: https://one.dash.cloudflare.com → Networks → Tunnels → Create a tunnel"
    say "Copy the token (the long eyJ… string after --token). Do not paste the full command."
    printf "\n"
    prompt "Cloudflare tunnel token" CF_TOKEN ""
    [ -z "$CF_TOKEN" ] && die "Cloudflare tunnel token is required."
    case "$CF_TOKEN" in
      *" "*|docker*|*--token*) die "Paste only the token string, not the full docker run command." ;;
    esac
    prompt "Your public URL (e.g. https://vote.example.com)" PUBLIC_URL ""
    [ -z "$PUBLIC_URL" ] && die "Public URL is required."
    ;;
  2)
    TUNNEL_MODE="tailscale"
    printf "\n"
    say "Open: https://login.tailscale.com/admin/settings/keys → Generate auth key"
    printf "\n"
    prompt "Tailscale auth key" TS_AUTHKEY ""
    [ -z "$TS_AUTHKEY" ] && die "Tailscale auth key is required."
    prompt "Tailscale hostname" TS_HOSTNAME "votehost"
    PUBLIC_URL="https://${TS_HOSTNAME}.example.ts.net"
    warn "Tailscale URL will be confirmed after install. Update NEXTAUTH_URL in /opt/votehost/.env."
    ;;
  *)
    TUNNEL_MODE="lan"
    EXPOSE_LAN=1
    printf "\n"
    say "The app will listen on port 3000 inside the LXC."
    say "Point your reverse proxy (Nginx Proxy Manager, Caddy, etc.) at http://<LXC-IP>:3000"
    printf "\n"
    prompt "Your public URL (e.g. https://vote.example.com)" PUBLIC_URL ""
    [ -z "$PUBLIC_URL" ] && die "Public URL is required."
    ;;
esac

# ── Admin account ─────────────────────────────────────────────────────────────
header "Admin Account"
prompt "Admin email" ADMIN_EMAIL ""
[ -z "$ADMIN_EMAIL" ] && die "Admin email is required."
printf "  ${BOLD}Admin password (min 8 chars)${NC}: "
stty -echo 2>/dev/null || true; read -r ADMIN_PASSWORD; stty echo 2>/dev/null || true; printf "\n"
[ "${#ADMIN_PASSWORD}" -lt 8 ] && die "Password must be at least 8 characters."
printf "  ${BOLD}Confirm password${NC}: "
stty -echo 2>/dev/null || true; read -r ADMIN_PW2; stty echo 2>/dev/null || true; printf "\n"
[ "$ADMIN_PASSWORD" != "$ADMIN_PW2" ] && die "Passwords do not match."

# ── Summary ───────────────────────────────────────────────────────────────────
header "Summary"
printf "  %-18s %s\n" "Container ID:"  "$CTID"
printf "  %-18s %s\n" "Hostname:"      "$CT_HOSTNAME"
printf "  %-18s %s\n" "Storage:"       "$CT_STORAGE"
printf "  %-18s %s\n" "Bridge:"        "$CT_BRIDGE"
printf "  %-18s %s\n" "Network:"       "$CT_IP"
printf "  %-18s %s vCPU / %s MB RAM / %s GB disk\n" "Resources:" "$CT_CORES" "$CT_RAM" "$CT_DISK"
printf "  %-18s %s\n" "Access mode:"   "$TUNNEL_MODE"
printf "  %-18s %s\n" "Public URL:"    "$PUBLIC_URL"
printf "  %-18s %s\n" "Admin email:"   "$ADMIN_EMAIL"
printf "\n"
confirm "Proceed with installation? (Y/n)" "y" || die "Aborted."

# ── Template ──────────────────────────────────────────────────────────────────
header "Debian Template"

# Find a storage that supports vztmpl; prefer local
TMPL_STORAGE=$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1{print $1}' | grep -w "^local$" || true)
if [ -z "$TMPL_STORAGE" ]; then
  TMPL_STORAGE=$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1{print $1; exit}')
fi
[ -z "$TMPL_STORAGE" ] && die "No storage found that supports container templates. Check: pvesm status -content vztmpl"
say "Template storage: $TMPL_STORAGE"

say "Refreshing template list..."
pveam update >/dev/null 2>&1 || warn "pveam update failed — using cached list."

TEMPLATE=$(pveam available --section system 2>/dev/null | awk '/debian-12-standard/{print $2}' | tail -1)
[ -z "$TEMPLATE" ] && die "No debian-12-standard template found. Try: pveam update && pveam available --section system | grep debian"
say "Template: $TEMPLATE"

if ! pveam list "$TMPL_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  say "Downloading $TEMPLATE (this may take a moment)..."
  pveam download "$TMPL_STORAGE" "$TEMPLATE"
  ok "Template downloaded"
else
  ok "Template already present"
fi

# ── Create LXC ────────────────────────────────────────────────────────────────
header "Creating LXC Container"

NET_SPEC="name=eth0,bridge=${CT_BRIDGE},ip=${CT_IP},firewall=1"

pct create "$CTID" "${TMPL_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname   "$CT_HOSTNAME" \
  --unprivileged 1 \
  --features   "nesting=1,keyctl=1" \
  --cores      "$CT_CORES" \
  --memory     "$CT_RAM" \
  --rootfs     "${CT_STORAGE}:${CT_DISK}" \
  --net0       "$NET_SPEC" \
  --onboot     1 \
  --start      0
ok "LXC $CTID created (unprivileged, nesting=1, keyctl=1)"

# Tailscale needs /dev/net/tun passthrough inside the unprivileged LXC
if [ "$TUNNEL_MODE" = "tailscale" ]; then
  {
    echo "lxc.cgroup2.devices.allow: c 10:200 rwm"
    echo "lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file"
  } >> "/etc/pve/lxc/${CTID}.conf"
  ok "/dev/net/tun passthrough configured for Tailscale"
fi

# ── Start and wait for network ────────────────────────────────────────────────
header "Starting Container"
pct start "$CTID"
say "Waiting for network (up to 60s)..."
for _i in $(seq 1 30); do
  if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then
    ok "Network is up"
    break
  fi
  sleep 2
  if [ "$_i" -eq 30 ]; then
    warn "DNS check timed out. Continuing — install may fail if there's no internet."
  fi
done

# ── Write install env file and push into LXC ──────────────────────────────────
TMPENV=$(mktemp)
chmod 600 "$TMPENV"
# q() single-quote-escapes values so the file can be sourced safely regardless
# of special characters in tokens, passwords, or URLs.
{
  echo "VOTEHOST_UNATTENDED=1"
  echo "VOTEHOST_TUNNEL_MODE=$(q "$TUNNEL_MODE")"
  echo "VOTEHOST_PUBLIC_URL=$(q "$PUBLIC_URL")"
  echo "VOTEHOST_CLOUDFLARE_TUNNEL_TOKEN=$(q "$CF_TOKEN")"
  echo "VOTEHOST_TS_AUTHKEY=$(q "$TS_AUTHKEY")"
  echo "VOTEHOST_TS_HOSTNAME=$(q "$TS_HOSTNAME")"
  echo "VOTEHOST_ADMIN_EMAIL=$(q "$ADMIN_EMAIL")"
  echo "VOTEHOST_ADMIN_PASSWORD=$(q "$ADMIN_PASSWORD")"
} > "$TMPENV"
pct push "$CTID" "$TMPENV" /root/votehost-env
rm -f "$TMPENV"
pct exec "$CTID" -- chmod 600 /root/votehost-env

# ── Install inside the LXC ────────────────────────────────────────────────────
header "Installing VoteHost Elections"
say "Installing Docker, cloning repo, and running setup (4–8 minutes)..."
printf "\n"

# Write the bootstrap script to a temp file on the host, then push and execute it.
TMPBOOT=$(mktemp)
cat > "$TMPBOOT" << 'BOOTSTRAP'
#!/bin/bash
set -euo pipefail

EXPOSE_LAN_PLACEHOLDER

# ── Prereqs ──────────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg openssl git netcat-openbsd lsb-release

# ── Docker (upstream apt repo) ────────────────────────────────────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

# ── Clone VoteHost ────────────────────────────────────────────────────────────
git clone --depth 1 https://github.com/Cableboy1515/VoteHost /opt/votehost
cd /opt/votehost

# ── LAN mode: expose port 3000 on all LXC interfaces ─────────────────────────
if [ "${_EXPOSE_LAN:-0}" = "1" ]; then
  cat > docker-compose.override.yml << 'OVERRIDE'
services:
  app:
    ports:
      - "3000:3000"
OVERRIDE
fi

# ── Run install wizard ────────────────────────────────────────────────────────
set -a
# shellcheck source=/dev/null
. /root/votehost-env
set +a

bash scripts/install.sh

# Clean up credentials
rm -f /root/votehost-env
BOOTSTRAP

# Inject the EXPOSE_LAN flag (safe: value is 0 or 1, no quoting needed)
sed -i "s/EXPOSE_LAN_PLACEHOLDER/_EXPOSE_LAN=${EXPOSE_LAN}/" "$TMPBOOT"

pct push "$CTID" "$TMPBOOT" /root/votehost-bootstrap.sh
rm -f "$TMPBOOT"
pct exec "$CTID" -- chmod 700 /root/votehost-bootstrap.sh
pct exec "$CTID" -- bash /root/votehost-bootstrap.sh

# ── Get LXC IP ────────────────────────────────────────────────────────────────
LXC_IP=$(pct exec "$CTID" -- ip -4 addr show eth0 2>/dev/null \
  | awk '/inet /{sub(/\/.*/, "", $2); print $2}' || echo "(unknown)")

# ── Done ──────────────────────────────────────────────────────────────────────
printf "\n"
printf "  ${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "  ${GREEN}${BOLD}  VoteHost Elections is installed!${NC}\n"
printf "  ${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "\n"
printf "  %-18s %s\n" "Container ID:"  "$CTID"
printf "  %-18s %s\n" "LXC IP:"        "$LXC_IP"
printf "  %-18s %s/login\n" "Admin login:"  "$PUBLIC_URL"
printf "  %-18s %s\n" "Admin email:"   "$ADMIN_EMAIL"
printf "\n"

case "$TUNNEL_MODE" in
  cloudflare)
    say "Cloudflare: set the origin to http://app:3000 in your tunnel dashboard."
    say "DNS: create a CNAME to your tunnel at one.dash.cloudflare.com."
    ;;
  tailscale)
    warn "Tailscale: check logs for your *.ts.net URL, then update .env:"
    dim "  pct exec $CTID -- sh -c 'cd /opt/votehost && docker compose logs tailscale'"
    dim "  Edit /opt/votehost/.env → set NEXTAUTH_URL=https://<your>.ts.net"
    dim "  pct exec $CTID -- sh -c 'cd /opt/votehost && docker compose restart app'"
    ;;
  lan)
    say "App is listening at http://${LXC_IP}:3000"
    say "Point your reverse proxy at http://${LXC_IP}:3000"
    ;;
esac

printf "\n"
dim "Enter container:  pct exec $CTID -- bash"
dim "View logs:        pct exec $CTID -- sh -c 'cd /opt/votehost && docker compose logs -f'"
dim "Update VoteHost:  pct exec $CTID -- sh -c 'cd /opt/votehost && git pull && docker compose up -d --build && docker image prune -f'"
printf "\n"
