#!/usr/bin/env bash
# Serve the CRM on one more domain name (for example crm.example.com) with its own free HTTPS certificate.
#
#   bash deploy/add-domain.sh --domain crm.example.com --email you@example.com      (as root)
#
# Before you run it, the domain's DNS "A" record must point at this server (see docs/DEPLOYMENT.md > Your own domain).
# The script checks that first and stops with an explanation if it does not, so a premature run changes nothing.
# Safe to run again. Existing sites on this server (including the CRM's current address) are left untouched.
#
# Options:  --domain <name>   --email <address>   --dry-run (print what would happen, change nothing)
#           --take-over   when an OLDER nginx site on this server already answers to the same domain name, nginx would keep
#                         using that one and never reach the CRM. With this option that older site's file is backed up
#                         (/root/nginx-backup-<time>/) and only this domain name inside its server_name line(s) is renamed;
#                         the older site keeps any other names it has. Without it the script stops and tells you.
set -Eeuo pipefail

DOMAIN=""
EMAIL=""
DRY=0
TAKE_OVER=0
APP_DIR="${APP_DIR:-/var/www/7heaven-crm}"
NGINX_DIR="${NGINX_DIR:-/etc/nginx}"

c_bold=$'\033[1m'; c_green=$'\033[32m'; c_yellow=$'\033[33m'; c_red=$'\033[31m'; c_off=$'\033[0m'
say()  { printf '\n%s==>%s %s\n' "$c_bold" "$c_off" "$*"; }
ok()   { printf '%s  ok%s  %s\n' "$c_green" "$c_off" "$*"; }
warn() { printf '%s warn%s %s\n' "$c_yellow" "$c_off" "$*" >&2; }
die()  { printf '%s fail%s %s\n' "$c_red" "$c_off" "$*" >&2; exit 1; }
run()  { if [ "$DRY" = 1 ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi; }

# Real files of the enabled nginx sites (other than $1) whose server_name line(s) contain the domain $2 as a whole word.
find_conflicts() {
  local skip="$1" domain="$2" esc f real
  esc="${domain//./\\.}"
  for f in "$NGINX_DIR"/sites-enabled/* "$NGINX_DIR"/conf.d/*.conf; do
    [ -e "$f" ] || continue
    [ "$(basename "$f")" = "$skip" ] && continue
    real="$(readlink -f "$f")"
    if grep -qsE "^[[:space:]]*server_name[[:space:]]([^;]*[[:space:]])?${esc}([[:space:]]|;)" "$real"; then printf '%s\n' "$real"; fi
  done | sort -u
}

# Rename the domain inside server_name lines of file $1 so nginx no longer matches it there (re-running is harmless).
rename_in_server_name() {
  local file="$1" domain="$2" esc
  esc="${domain//./\\.}"
  sed -i -E "/^[[:space:]]*server_name[[:space:]]/ s/(^|[[:space:]])${esc}([[:space:];])/\1disabled-${domain}\2/g" "$file"
}

if [ "${ADD_DOMAIN_SOURCE_ONLY:-0}" = 1 ]; then return 0 2>/dev/null || exit 0; fi

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)  DOMAIN="${2:-}"; shift 2 ;;
    --email)   EMAIL="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --take-over) TAKE_OVER=1; shift ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

DOMAIN="$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z')"
[ -n "$DOMAIN" ] || die "Missing --domain (for example --domain crm.example.com)"
[[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]] || die "'$DOMAIN' does not look like a domain name"
[ -n "$EMAIL" ] || die "Missing --email (Let's Encrypt sends certificate expiry notices there)"
[[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "'$EMAIL' does not look like an e-mail address"
if [ "$DRY" = 0 ]; then
  [ "$(id -u)" = 0 ] || die "Run as root:  bash deploy/add-domain.sh --domain $DOMAIN --email $EMAIL"
  command -v nginx >/dev/null || die "nginx is not installed. Run deploy/setup-vps.sh first."
  command -v certbot >/dev/null || die "certbot is not installed. Run deploy/setup-vps.sh first."
  [ -f "$NGINX_DIR/snippets/7heaven-proxy.conf" ] || die "The CRM's nginx setup was not found (/etc/nginx/snippets/7heaven-proxy.conf). Run deploy/setup-vps.sh first."
fi
TEMPLATE="$APP_DIR/deploy/nginx/7heaven-crm.conf"
[ -f "$TEMPLATE" ] || die "$TEMPLATE not found (set APP_DIR if the CRM is installed elsewhere)."

# ------------------------------------------------------------------------------------------------ 1. DNS
say "1/4 DNS: does $DOMAIN point at this server?"
SERVER_IP="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
# Ask a PUBLIC resolver: this server's own resolver reads /etc/hosts and can hide the real record.
RESOLVED="$(curl -fsS --max-time 8 "https://dns.google/resolve?name=${DOMAIN}&type=A" 2>/dev/null | grep -oE '"data": ?"[0-9.]+"' | grep -oE '[0-9]+(\.[0-9]+){3}' | tr '\n' ' ' || true)"
SHOW_IP="${SERVER_IP:-the IP address of this server}"
echo "     this server : ${SERVER_IP:-unknown}"
echo "     $DOMAIN : ${RESOLVED:-no A record found}"
if [ "$DRY" = 1 ]; then
  warn "dry run: DNS result is only shown, not enforced"
elif [ -z "$RESOLVED" ]; then
  die "$DOMAIN has no A record yet. Add it at your DNS provider (Name: the part before your domain, Value: $SHOW_IP), wait 5-30 minutes, then run this again."
elif [ -n "$SERVER_IP" ] && [[ " $RESOLVED " != *" $SERVER_IP "* ]]; then
  die "$DOMAIN points to ${RESOLVED% } but this server is $SERVER_IP. Fix the A record's Value at your DNS provider (remove any other A/CNAME record with the same name), wait a few minutes, then run this again."
else
  ok "DNS points at this server"
fi

# ------------------------------------------------------------------------------------------------ 2. nginx
say "2/4 nginx site for $DOMAIN"
SITE="7heaven-crm-$DOMAIN"

# nginx serves a domain from the FIRST site that names it. An older site that already does would hide the CRM completely
# (and certbot would put the certificate into that older site), so look for one before writing anything.
CONFLICTS="$(find_conflicts "$SITE" "$DOMAIN" || true)"
BACKUP_DIR=""
if [ -n "$CONFLICTS" ]; then
  warn "Another nginx site on this server already answers to $DOMAIN:"
  while IFS= read -r f; do
    echo "     $f"
    grep -nE "^[[:space:]]*server_name" "$f" | sed 's/^/        /'
  done <<< "$CONFLICTS"
  if [ "$TAKE_OVER" = 0 ]; then
    die "nginx always uses the FIRST site that names a domain, so the CRM would never be reached on $DOMAIN. If that older site is not needed for this name, run this again with --take-over (a backup copy is kept and only this name is renamed inside it)."
  fi
  if [ "$DRY" = 1 ]; then
    printf '  [dry-run] back up the file(s) above, then rename %s inside their server_name lines\n' "$DOMAIN"
  else
    BACKUP_DIR="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    while IFS= read -r f; do
      cp -p "$f" "$BACKUP_DIR/$(basename "$f")"
      rename_in_server_name "$f" "$DOMAIN"
    done <<< "$CONFLICTS"
    ok "the older site no longer answers to $DOMAIN (original saved in $BACKUP_DIR)"
  fi
fi
restore_backups() {
  [ -n "$BACKUP_DIR" ] || return 0
  while IFS= read -r f; do cp -p "$BACKUP_DIR/$(basename "$f")" "$f"; done <<< "$CONFLICTS"
}

if [ "$DRY" = 0 ] && nginx -T 2>/dev/null | grep -q 'limit_req_zone.*zone=crm_login'; then HAS_ZONE=1; else HAS_ZONE=0; fi
if [ "$DRY" = 1 ]; then
  printf '  [dry-run] write %s/sites-available/%s from %s (server_name %s), enable it, nginx -t, reload\n' "$NGINX_DIR" "$SITE" "$TEMPLATE" "$DOMAIN"
else
  # The login rate-limit zone may only be defined once for all sites, so drop it from the copy when it already exists.
  if [ "$HAS_ZONE" = 1 ]; then
    sed "s#crm\.example\.com#${DOMAIN}#g; /^limit_req_zone/d" "$TEMPLATE" > "$NGINX_DIR/sites-available/$SITE"
  else
    sed "s#crm\.example\.com#${DOMAIN}#g" "$TEMPLATE" > "$NGINX_DIR/sites-available/$SITE"
  fi
  ln -sf "$NGINX_DIR/sites-available/$SITE" "$NGINX_DIR/sites-enabled/$SITE"
  if ! nginx -t 2> /tmp/7heaven-nginx-test.log; then
    cat /tmp/7heaven-nginx-test.log >&2
    rm -f "$NGINX_DIR/sites-enabled/$SITE"
    restore_backups
    die "nginx rejected the change; the new site was switched off and any older site file was put back exactly as it was (details above)."
  fi
  systemctl reload nginx
  ok "nginx serves http://$DOMAIN"
fi

# ------------------------------------------------------------------------------------------------ 3. https
say "3/4 HTTPS certificate"
if [ "$DRY" = 1 ]; then
  printf '  [dry-run] certbot --nginx -d %s -m %s --agree-tos --no-eff-email --redirect -n\n' "$DOMAIN" "$EMAIL"
else
  if certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email --redirect -n; then
    ok "HTTPS enabled; the certificate renews automatically"
  else
    die "certbot could not issue the certificate (see above; DNS not yet spread, or port 80 blocked by a firewall, are the usual causes). The site works on http://$DOMAIN. Run this script again to retry."
  fi
fi

# ------------------------------------------------------------------------------------------------ 4. check
say "4/4 Check"
if [ "$DRY" = 1 ]; then
  printf '  [dry-run] curl https://%s/api/health\n' "$DOMAIN"
else
  healthy=0
  for _ in 1 2 3 4 5 6; do
    if curl -fsS --max-time 10 "https://$DOMAIN/api/health" 2>/dev/null | grep -q '"database":"connected"'; then healthy=1; break; fi
    sleep 3
  done
  if [ "$healthy" = 1 ]; then ok "https://$DOMAIN/api/health reports the CRM healthy and the database connected"; else
    warn "https://$DOMAIN did not answer as the CRM yet. Check:  curl -i https://$DOMAIN/api/health   and   tail -n 30 /var/log/nginx/error.log"
  fi
fi

cat <<DONE

${c_bold}Done.${c_off} Open https://$DOMAIN and sign in (same accounts and data as before; browsers keep a separate login per address).
  - Optional: in GitHub (Settings -> Secrets and variables -> Actions -> Variables) set SITE_URL to https://$DOMAIN so every deploy is checked there.
  - The old address keeps working. Nothing else on this server was changed.
DONE
