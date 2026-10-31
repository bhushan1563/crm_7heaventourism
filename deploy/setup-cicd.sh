#!/usr/bin/env bash
# Prepares this server for automatic deployment from GitHub Actions (.github/workflows/deploy.yml).
#
#   bash deploy/setup-cicd.sh            (as root, once)
#   bash deploy/setup-cicd.sh --rotate   (new key; the old one stops working immediately)
#
# What it does:
#   1. creates a one-purpose SSH key pair and adds ONLY the public half to /root/.ssh/authorized_keys, restricted so that the
#      key can do nothing except run deploy/deploy.sh (no shell, no terminal, no port forwarding, no file access)
#   2. prints, once, the values to save as GitHub secrets. The private key is not kept on this server.
# Running it again changes nothing unless you pass --rotate. To switch automatic deployment off, delete the line that ends in
# "7heaven-github-deploy" from /root/.ssh/authorized_keys.
set -Eeuo pipefail

APP_DIR="/var/www/7heaven-crm"
APP_USER="crm"
ROTATE=0
SSH_DIR="${SSH_DIR:-/root/.ssh}"                 # overridable for testing only
MARK="7heaven-github-deploy"

c_bold=$'\033[1m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_off=$'\033[0m'
say()  { printf '\n%s==>%s %s\n' "$c_bold" "$c_off" "$*"; }
ok()   { printf '%s  ok%s  %s\n' "$c_green" "$c_off" "$*"; }
warn() { printf '%s warn%s %s\n' "$c_yellow" "$c_off" "$*" >&2; }
die()  { printf '%s fail%s %s\n' "$c_red" "$c_off" "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --rotate) ROTATE=1; shift ;;
    --dir)    APP_DIR="${2:-}"; shift 2 ;;
    --user)   APP_USER="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

if [ "$SSH_DIR" = "/root/.ssh" ] && [ "$(id -u)" != 0 ]; then die "Run as root:  bash deploy/setup-cicd.sh"; fi
command -v ssh-keygen >/dev/null || die "ssh-keygen not found (apt-get install openssh-client)"
[ -f "$APP_DIR/deploy/deploy.sh" ] || die "$APP_DIR/deploy/deploy.sh not found. Run deploy/setup-vps.sh first, or pass --dir <install folder>."
id "$APP_USER" >/dev/null 2>&1 || die "User '$APP_USER' does not exist. Run deploy/setup-vps.sh first, or pass --user <name>."

mkdir -p "$SSH_DIR"; chmod 700 "$SSH_DIR"
AUTH="$SSH_DIR/authorized_keys"
touch "$AUTH"; chmod 600 "$AUTH"

# Does the server let root in with a key at all?
if command -v sshd >/dev/null 2>&1; then
  root_login="$(sshd -T 2>/dev/null | awk '$1 == "permitrootlogin" { print $2 }')" || true
  [ "$root_login" != "no" ] || die "sshd has PermitRootLogin no, so GitHub cannot connect. Set 'PermitRootLogin prohibit-password' in /etc/ssh/sshd_config, restart ssh, and run this again."
fi

if grep -q " $MARK\$" "$AUTH" 2>/dev/null; then
  if [ "$ROTATE" = 0 ]; then
    ok "Automatic deployment is already set up on this server (key '$MARK')."
    echo "     The private key is not stored here. To get a new one (the old stops working):  bash deploy/setup-cicd.sh --rotate"
    exit 0
  fi
  say "Removing the old deploy key"
  grep -v " $MARK\$" "$AUTH" > "$AUTH.new" || true
  cat "$AUTH.new" > "$AUTH"; rm -f "$AUTH.new"
fi

say "Creating the deploy key"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
ssh-keygen -q -t ed25519 -N '' -C "$MARK" -f "$work/key"

# The only thing this key may ever do: run the deploy as the app user (one at a time; tests already ran on GitHub).
forced="flock -w 900 /run/lock/7heaven-deploy.lock runuser -l $APP_USER -c 'SKIP_TESTS=1 bash $APP_DIR/deploy/deploy.sh'"
printf 'command="%s",no-pty,no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-user-rc %s\n' "$forced" "$(cat "$work/key.pub")" >> "$AUTH"
ok "public key added to $AUTH (restricted to the deploy command)"

HOST_PUB=""
for candidate in "${HOST_PUB_FILE:-}" /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
  if [ -n "$candidate" ] && [ -f "$candidate" ]; then HOST_PUB="$(cut -d' ' -f1,2 "$candidate")"; break; fi
done
[ -n "$HOST_PUB" ] || warn "Could not read this server's SSH host key from /etc/ssh/*.pub; use:  ssh-keyscan -t ed25519 <ip>"
SERVER_IP="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
SHOW_HOST="${SERVER_IP:-<public IP address of this server>}"
SHOW_HOSTKEY="${HOST_PUB:-<run: ssh-keyscan -t ed25519 YOUR-SERVER-IP and copy everything after the first column>}"
SSH_PORT=""
if command -v sshd >/dev/null 2>&1; then SSH_PORT="$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2; exit }')" || true; fi

cat <<EOF

${c_bold}Add these as GitHub secrets${c_off}
  GitHub -> your repository -> Settings -> Secrets and variables -> Actions -> "New repository secret"
  (copy each value exactly; the names must match)

${c_bold}1) Name: DEPLOY_HOST${c_off}
$SHOW_HOST

${c_bold}2) Name: DEPLOY_HOST_KEY${c_off}   (optional but recommended: it pins your server's identity)
$SHOW_HOSTKEY

${c_bold}3) Name: DEPLOY_SSH_KEY${c_off}   (everything below, including the BEGIN and END lines)
$(cat "$work/key")
EOF
if [ -n "$SSH_PORT" ] && [ "$SSH_PORT" != "22" ]; then
  printf '\n%s4) Name: DEPLOY_PORT%s   (your SSH port is not 22)\n%s\n' "$c_bold" "$c_off" "$SSH_PORT"
fi
cat <<EOF

${c_bold}Optional${c_off}  Settings -> Secrets and variables -> Actions -> Variables tab -> "New repository variable":
  Name: SITE_URL    Value: https://srv2022615.hstgr.cloud     (the pipeline then also checks the public site after each deploy)

${c_bold}Then${c_off}  GitHub -> Actions tab -> "CI/CD" -> "Run workflow" (or just push a change to main).
${c_yellow}The private key above is shown only now and is not saved on this server. Clear the screen afterwards (Ctrl+L).${c_off}
EOF
