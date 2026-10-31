#!/usr/bin/env bash
# One-command setup of a fresh Ubuntu 22.04 / 24.04 server (Hostinger VPS) for 7Heaven CRM.
#
#   sudo bash deploy/setup-vps.sh --domain crm.example.com --email you@example.com
#
# What it does (safe to run again; it skips what is already done):
#   1. installs Nginx, Certbot, Git, Node 22 and PM2, and turns on the firewall (SSH + web only)
#   2. creates an unprivileged "crm" user that runs the app (never root)
#   3. puts the code in /var/www/7heaven-crm and writes backend/.env (random JWT secret, mode 600)
#   4. builds the web app and starts it under PM2 (restarts on crash and on reboot, log rotation)
#   5. configures Nginx for your domain and gets a free HTTPS certificate
#
# Options:
#   --domain <name>     your domain (its DNS A record must already point at this server)  [required]
#   --email <address>   for Let's Encrypt expiry notices                                   [required unless --no-ssl]
#   --repo <git url>    clone the code from here. Without it, the folder this script lives in is copied.
#   --branch <name>     branch to clone (default: main)
#   --dir <path>        install location (default: /var/www/7heaven-crm)
#   --no-ssl            skip HTTPS (run `certbot --nginx -d <domain>` yourself later)
#   --yes               do not ask for confirmation
#   --dry-run           print everything that would run, change nothing
#
# MongoDB: set MONGODB_URI in the environment (or you will be asked). Use your Atlas connection string and add this
# server's public IP under Atlas > Network Access.
set -Eeuo pipefail

DOMAIN=""
EMAIL=""
REPO=""
BRANCH="main"
APP_DIR="/var/www/7heaven-crm"
APP_USER="crm"
SSL=1
DRY=0
ASSUME_YES=0

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

c_bold=$'\033[1m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_off=$'\033[0m'
say()  { printf '\n%s==>%s %s\n' "$c_bold" "$c_off" "$*"; }
ok()   { printf '%s  ok%s  %s\n' "$c_green" "$c_off" "$*"; }
warn() { printf '%s warn%s %s\n' "$c_yellow" "$c_off" "$*" >&2; }
die()  { printf '%s fail%s %s\n' "$c_red" "$c_off" "$*" >&2; exit 1; }

run() {
  if [ "$DRY" = 1 ]; then
    printf '  [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

# Run a command line as the app user, from the app folder.
as_app() {
  if [ "$DRY" = 1 ]; then
    printf '  [dry-run as %s] %s\n' "$APP_USER" "$*"
  else
    sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && $*"
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email)  EMAIL="${2:-}"; shift 2 ;;
    --repo)   REPO="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --dir)    APP_DIR="${2:-}"; shift 2 ;;
    --no-ssl) SSL=0; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

# ------------------------------------------------------------------------------------------------ checks
[ -n "$DOMAIN" ] || die "Missing --domain (e.g. --domain crm.example.com)"
[[ "$DOMAIN" =~ ^([A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$ ]] || die "'$DOMAIN' does not look like a domain name"
if [ "$SSL" = 1 ] && [ -z "$EMAIL" ]; then die "Missing --email (needed for the HTTPS certificate). Use --no-ssl to skip HTTPS."; fi
if [ "$DRY" = 0 ]; then
  [ "$(id -u)" = 0 ] || die "Run as root:  sudo bash deploy/setup-vps.sh ..."
  command -v apt-get >/dev/null || die "This script targets Ubuntu / Debian (apt-get not found)."
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in ubuntu|debian) ;; *) warn "Untested on ${PRETTY_NAME:-this OS}; Ubuntu 22.04 / 24.04 is recommended." ;; esac
fi

APP_PORT="5000"
SSH_PORTS="22"

cat <<PLAN

${c_bold}7Heaven CRM server setup${c_off}
  domain        : $DOMAIN  (HTTPS: $([ "$SSL" = 1 ] && echo "yes, certificate for $EMAIL" || echo "no"))
  install folder: $APP_DIR   (runs as user "$APP_USER")
  code          : $([ -n "$REPO" ] && echo "git clone $REPO ($BRANCH)" || echo "copy of $SOURCE_DIR")
  mode          : $([ "$DRY" = 1 ] && echo "DRY RUN - nothing will be changed" || echo "live")
PLAN

if [ "$DRY" = 0 ] && [ "$ASSUME_YES" = 0 ]; then
  read -r -p "Continue? [y/N] " answer
  case "$answer" in y|Y|yes|YES) ;; *) die "Cancelled." ;; esac
fi

# ------------------------------------------------------------------------------------------------ 1. system packages
say "1/7 System packages"
export DEBIAN_FRONTEND=noninteractive
run apt-get update -y
run apt-get install -y git curl ca-certificates rsync openssl nginx ufw certbot python3-certbot-nginx

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  say "Installing Node.js 22"
  if [ "$DRY" = 1 ]; then
    printf '  [dry-run] curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs\n'
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
else
  ok "Node.js $(node -v) already installed"
fi
if ! command -v pm2 >/dev/null 2>&1; then
  run npm install -g pm2
else
  ok "PM2 $(pm2 -v 2>/dev/null) already installed"
fi

# ------------------------------------------------------------------------------------------------ 2. firewall
say "2/7 Firewall (SSH + web only)"
if [ "$DRY" = 0 ]; then
  # Every port sshd really listens on: `sshd -T` knows the configured ones (also with socket activation, where `ss` only
  # shows "systemd"), `ss` catches what is actually open. Opening them all means turning the firewall on can never lock you out.
  detected="$( { sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }'; ss -tlnp 2>/dev/null | awk '/sshd/ { n = split($4, a, ":"); print a[n] }'; } | grep -E '^[0-9]+$' | sort -un | tr '\n' ' ' )" || true
  SSH_PORTS="${detected:-22}"
  SSH_PORTS="${SSH_PORTS% }"
fi
for port in $SSH_PORTS; do run ufw allow "${port}/tcp"; done
run ufw allow 'Nginx Full'
run ufw --force enable
warn "Hostinger also has a firewall in hPanel > VPS > Security. Make sure it allows TCP ${SSH_PORTS// /, }, 80 and 443."

# ------------------------------------------------------------------------------------------------ 3. user + code
say "3/7 App user and code"
if ! id "$APP_USER" >/dev/null 2>&1; then
  run useradd --system --create-home --shell /bin/bash "$APP_USER"
else
  ok "user '$APP_USER' exists"
fi
run mkdir -p "$(dirname "$APP_DIR")"

if [ -n "$REPO" ]; then
  if [ -d "$APP_DIR/.git" ]; then
    ok "code already cloned; updating"
    as_app "git pull --ff-only"   # as the app user: git refuses a repository owned by someone else ("dubious ownership")
  else
    run git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
  fi
elif [ "$SOURCE_DIR" != "$APP_DIR" ]; then
  run mkdir -p "$APP_DIR"
  run rsync -a --exclude node_modules --exclude '.env' --exclude 'old data' --exclude backups "$SOURCE_DIR/" "$APP_DIR/"
else
  ok "running from the install folder"
fi
run chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# ------------------------------------------------------------------------------------------------ 4. configuration
say "4/7 Configuration (backend/.env)"
ENV_PATH="$APP_DIR/backend/.env"
if [ "$DRY" = 0 ] && [ -f "$ENV_PATH" ]; then
  ok "$ENV_PATH already exists; leaving it untouched"
else
  URI="${MONGODB_URI:-}"
  if [ -z "$URI" ] && [ "$DRY" = 0 ]; then
    [ -t 0 ] || die "MONGODB_URI is not set and there is no terminal to ask on. Run:  MONGODB_URI='mongodb+srv://...' sudo -E bash deploy/setup-vps.sh ..."
    read -r -s -p "Paste your MongoDB connection string (input hidden): " URI; echo
  fi
  [ "$DRY" = 1 ] && URI="${URI:-mongodb+srv://<user>:<password>@<cluster>/7heaven_crm}"
  case "$URI" in mongodb://*|mongodb+srv://*) ;; *) die "That does not look like a MongoDB connection string (should start with mongodb:// or mongodb+srv://)" ;; esac

  if [ "$DRY" = 1 ]; then
    printf '  [dry-run] write %s (mode 600): NODE_ENV=production PORT=%s HOST=127.0.0.1 MONGODB_URI=<hidden> JWT_SECRET=<random 96 hex chars>\n' "$ENV_PATH" "$APP_PORT"
  else
    umask 077
    {
      printf '# Generated by deploy/setup-vps.sh on %s. Never commit this file.\n' "$(date -u +%FT%TZ)"
      printf 'NODE_ENV=production\n'
      printf 'PORT=%s\n' "$APP_PORT"
      printf 'HOST=127.0.0.1\n'
      printf 'MONGODB_URI=%s\n' "$URI"
      printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 48)"
    } > "$ENV_PATH"
    chown "$APP_USER":"$APP_USER" "$ENV_PATH"
    chmod 600 "$ENV_PATH"
    ok "wrote $ENV_PATH"
  fi
fi
if [ -f "$ENV_PATH" ]; then
  APP_PORT="$(grep -E '^PORT=' "$ENV_PATH" | tail -n1 | cut -d= -f2 | tr -d "\"'\r " || true)"
  APP_PORT="${APP_PORT:-5000}"
fi

# ------------------------------------------------------------------------------------------------ 5. build + start
say "5/7 Install, build and start"
as_app "npm ci --include=dev"
as_app "npm run build"
as_app "pm2 startOrReload deploy/ecosystem.config.cjs --update-env"
as_app "pm2 save"
run pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"
as_app "pm2 install pm2-logrotate >/dev/null 2>&1 && pm2 set pm2-logrotate:max_size 10M >/dev/null && pm2 set pm2-logrotate:retain 14 >/dev/null && pm2 set pm2-logrotate:compress true >/dev/null || true"

# Daily database backup (Atlas' free tier has none). Private folder, newest 14 kept; see docs/DEPLOYMENT.md > Backups.
say "Daily database backup (03:15, newest 14 kept, in /var/backups/7heaven)"
run install -d -m 700 -o "$APP_USER" -g "$APP_USER" /var/backups/7heaven
CRON_LINE="15 3 * * * cd $APP_DIR && /usr/bin/env node scripts/backup-db.mjs --dir /var/backups/7heaven --keep 14 >> /var/backups/7heaven/backup.log 2>&1 # 7heaven-backup"
if [ "$DRY" = 1 ]; then
  printf '  [dry-run] crontab for %s: %s\n' "$APP_USER" "$CRON_LINE"
else
  existing_cron="$(crontab -u "$APP_USER" -l 2>/dev/null || true)"
  if printf '%s\n' "$existing_cron" | grep -q '# 7heaven-backup'; then
    ok "backup already scheduled"
  else
    printf '%s\n%s\n' "$existing_cron" "$CRON_LINE" | sed '/^$/d' | crontab -u "$APP_USER" -
    ok "backup scheduled (crontab -u $APP_USER -l)"
  fi
fi

# ------------------------------------------------------------------------------------------------ 6. nginx
say "6/7 Nginx"
run install -d /etc/nginx/snippets
if [ "$DRY" = 1 ]; then
  printf '  [dry-run] install deploy/nginx/7heaven-proxy.conf (upstream port %s) -> /etc/nginx/snippets/7heaven-proxy.conf\n' "$APP_PORT"
  printf '  [dry-run] install deploy/nginx/7heaven-crm.conf (server_name %s) -> /etc/nginx/sites-available/7heaven-crm; enable it; remove the default site\n' "$DOMAIN"
else
  sed "s#127\.0\.0\.1:5000#127.0.0.1:${APP_PORT}#" "$APP_DIR/deploy/nginx/7heaven-proxy.conf" > /etc/nginx/snippets/7heaven-proxy.conf
  sed "s#crm\.example\.com#${DOMAIN}#g" "$APP_DIR/deploy/nginx/7heaven-crm.conf" > /etc/nginx/sites-available/7heaven-crm
  ln -sf /etc/nginx/sites-available/7heaven-crm /etc/nginx/sites-enabled/7heaven-crm
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
  ok "Nginx serving http://$DOMAIN"
fi

# ------------------------------------------------------------------------------------------------ 7. https
say "7/7 HTTPS"
SERVER_IP="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
if [ "$SSL" = 0 ]; then
  warn "HTTPS skipped (--no-ssl). When DNS is ready:  sudo certbot --nginx -d $DOMAIN -m <email> --agree-tos --redirect"
elif [ "$DRY" = 1 ]; then
  printf '  [dry-run] check %s resolves to this server, then: certbot --nginx -d %s -m %s --agree-tos --no-eff-email --redirect -n\n' "$DOMAIN" "$DOMAIN" "$EMAIL"
else
  RESOLVED="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{ print $1; exit }')"
  if [ -n "$SERVER_IP" ] && [ "$RESOLVED" = "$SERVER_IP" ]; then
    certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email --redirect -n
    ok "HTTPS enabled; the certificate renews automatically"
  else
    warn "DNS: $DOMAIN resolves to '${RESOLVED:-nothing}' but this server is '${SERVER_IP:-unknown}'."
    warn "Point the domain's A record at this server, wait a few minutes, then run:"
    warn "  sudo certbot --nginx -d $DOMAIN -m $EMAIL --agree-tos --redirect"
  fi
fi

# ------------------------------------------------------------------------------------------------ done
if [ "$DRY" = 0 ]; then
  say "Checking the app"
  healthy=0
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then healthy=1; break; fi
    sleep 2
  done
  if [ "$healthy" = 1 ]; then ok "healthy: $(curl -fsS "http://127.0.0.1:${APP_PORT}/api/health")"; else
    warn "The app is not answering yet. See:  sudo -u $APP_USER pm2 logs 7heaven-crm --lines 50"
  fi
fi

IP_HINT="${SERVER_IP:-<this server public IP>}"

cat <<DONE

${c_bold}Next steps${c_off}
  1. MongoDB Atlas > Network Access: allow this server ($IP_HINT) and remove 0.0.0.0/0.
  2. Open https://$DOMAIN and sign in. (Brand-new database? create the first admin:
       sudo -u $APP_USER bash -lc "cd $APP_DIR && npm run create-admin -- you@example.com 'a-strong-password'")
  3. Update later with one command:   sudo -u $APP_USER bash $APP_DIR/deploy/deploy.sh
  4. A database backup runs daily at 03:15 into /var/backups/7heaven (14 kept). Copy them off this server now and then,
     and test a restore once:  see docs/DEPLOYMENT.md > Backups.
DONE
