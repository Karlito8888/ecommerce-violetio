#!/usr/bin/env bash
#
# tunnel.sh — Start Convex + Cloudflared tunnel + update all webhooks
#
# Usage:
#   ./tunnel.sh          # Start everything
#   ./tunnel.sh stop     # Kill everything
#   ./tunnel.sh status   # Check what's running
#
# Prerequisites:
#   - cloudflared binary at /tmp/cloudflared (auto-downloaded if missing)
#   - Convex env vars set (VIOLET_APP_ID, VIOLET_APP_SECRET, etc.)
#   - curl, python3, jq
#
set -uo pipefail

CONVEX_PORT=3211
TUNNEL_LOG="/tmp/cloudflared-tunnel.log"
PID_FILE="/tmp/tunnel-pids.env"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Violet credentials from .env.local ──────────────────────────────────────
load_violet_creds() {
  local env_file="$PROJECT_DIR/.env.local"
  if [ ! -f "$env_file" ]; then
    echo "❌ .env.local not found at $env_file"
    exit 1
  fi
  export VIOLET_APP_ID=$(grep "^VIOLET_APP_ID=" "$env_file" | cut -d= -f2)
  export VIOLET_APP_SECRET=$(grep "^VIOLET_APP_SECRET=" "$env_file" | cut -d= -f2)
  export VIOLET_USERNAME=$(grep "^VIOLET_USERNAME=" "$env_file" | cut -d= -f2)
  # Read password raw (may contain special chars)
  export VIOLET_PASSWORD=$(grep "^VIOLET_PASSWORD=" "$env_file" | cut -d= -f2-)
  export VIOLET_API_BASE=$(grep "^VIOLET_API_BASE=" "$env_file" | cut -d= -f2)
  export STRIPE_SECRET_KEY=$(grep "^STRIPE_SECRET_KEY=" "$env_file" | cut -d= -f2-)
}

# ─── Ensure cloudflared exists ───────────────────────────────────────────────
ensure_cloudflared() {
  if [ ! -x /tmp/cloudflared ]; then
    echo "⬇️  Downloading cloudflared..."
    curl -L --max-time 60 https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
  fi
}

# ─── Login to Violet API ─────────────────────────────────────────────────────
get_violet_token() {
  local body
  body=$(python3 -c "import json; print(json.dumps({'username':'$VIOLET_USERNAME','password':'$VIOLET_PASSWORD'}))")
  local response
  response=$(curl -s -X POST "${VIOLET_API_BASE}/login" \
    -H "X-Violet-App-Id: $VIOLET_APP_ID" \
    -H "X-Violet-App-Secret: $VIOLET_APP_SECRET" \
    -H "Content-Type: application/json" \
    -d "$body")
  echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])"
}

# ─── Start Convex ────────────────────────────────────────────────────────────
start_convex() {
  echo "🔄 Starting Convex dev..."
  cd "$PROJECT_DIR"
  npx convex dev > /tmp/convex-dev.log 2>&1 &
  local convex_pid=$!
  echo "   Convex PID: $convex_pid"

  # Wait for ready
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:3210/" > /dev/null 2>&1; then
      echo "   ✅ Convex ready (port 3210, HTTP actions on $CONVEX_PORT)"
      break
    fi
    if [ $i -eq 30 ]; then
      echo "   ❌ Convex timeout"
      exit 1
    fi
    sleep 2
  done
  echo "$convex_pid" > /tmp/convex-dev.pid
}

# ─── Start Tunnel ────────────────────────────────────────────────────────────
start_tunnel() {
  echo "🌐 Starting cloudflared tunnel..."
  rm -f "$TUNNEL_LOG"
  /tmp/cloudflared tunnel --url "http://localhost:$CONVEX_PORT" > "$TUNNEL_LOG" 2>&1 &
  local tunnel_pid=$!
  echo "   Tunnel PID: $tunnel_pid"

  # Wait for URL
  local tunnel_url=""
  for i in $(seq 1 20); do
    tunnel_url=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1)
    if [ -n "$tunnel_url" ]; then
      break
    fi
    sleep 2
  done

  if [ -z "$tunnel_url" ]; then
    echo "   ❌ Tunnel URL not found"
    exit 1
  fi

  echo "   ✅ Tunnel URL: $tunnel_url"
  echo "$tunnel_pid" > /tmp/cloudflared-tunnel.pid
  echo "$tunnel_url" > /tmp/cloudflared-tunnel-url.txt

  # Save PIDs for cleanup
  echo "CONVEX_PID=$(cat /tmp/convex-dev.pid)" > "$PID_FILE"
  echo "TUNNEL_PID=$tunnel_pid" >> "$PID_FILE"
  echo "TUNNEL_URL=$tunnel_url" >> "$PID_FILE"

  TUNNEL_URL="$tunnel_url"
}

# ─── Update Violet Webhooks ──────────────────────────────────────────────────
update_violet_webhooks() {
  local tunnel_url="$1"
  local endpoint="$tunnel_url/api/webhooks/violet"

  echo ""
  echo "📡 Updating Violet webhooks to: $endpoint"

  local token
  token=$(get_violet_token)

  # Get all webhook IDs
  local ids
  ids=$(curl -s "${VIOLET_API_BASE}/events/webhooks" \
    -H "X-Violet-App-Id: $VIOLET_APP_ID" \
    -H "X-Violet-App-Secret: $VIOLET_APP_SECRET" \
    -H "X-Violet-Token: $token" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for w in data:
    print(f\"{w['id']}|{w['event']}\")
")

  local success=0
  local fail=0
  while IFS='|' read -r id event; do
    local result
    result=$(curl -s -X PUT "${VIOLET_API_BASE}/events/webhooks/$id" \
      -H "X-Violet-App-Id: $VIOLET_APP_ID" \
      -H "X-Violet-App-Secret: $VIOLET_APP_SECRET" \
      -H "X-Violet-Token: $token" \
      -H "Content-Type: application/json" \
      -d "{\"event\": \"$event\", \"remote_endpoint\": \"$endpoint\", \"status\": \"ACTIVE\"}")

    if echo "$result" | python3 -c "import sys, json; d=json.load(sys.stdin); exit(0 if 'id' in d else 1)" 2>/dev/null; then
      success=$((success + 1))
    else
      fail=$((fail + 1))
      echo "   ❌ FAIL: $id $event"
    fi
  done <<< "$ids"

  echo "   ✅ Violet webhooks updated: $success OK, $fail failed"
}

# ─── Update Stripe Webhook ────────────────────────────────────────────────────
update_stripe_webhook() {
  local tunnel_url="$1"
  local endpoint="$tunnel_url/api/stripe/webhooks"

  echo ""
  echo "💳 Updating Stripe webhook..."

  # Delete old tunnel-based webhooks (they have dead URLs from previous runs)
  local old_ids
  old_ids=$(curl -s "https://api.stripe.com/v1/webhook_endpoints?limit=100" \
    -u "$STRIPE_SECRET_KEY:" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for w in data.get('data', []):
    url = w.get('url', '')
    if 'trycloudflare.com' in url:
        print(w['id'])
" 2>/dev/null || true)

  for id in $old_ids; do
    curl -s -X DELETE "https://api.stripe.com/v1/webhook_endpoints/$id" \
      -u "$STRIPE_SECRET_KEY:" > /dev/null 2>&1
    echo "   🗑️  Deleted old tunnel webhook: $id"
  done

  # Create new webhook
  local result
  result=$(curl -s -X POST "https://api.stripe.com/v1/webhook_endpoints" \
    -u "$STRIPE_SECRET_KEY:" \
    -d "url=$endpoint" \
    -d "enabled_events[]=payment_intent.succeeded" \
    -d "enabled_events[]=payment_intent.payment_failed" \
    -d "enabled_events[]=charge.succeeded" \
    -d "enabled_events[]=charge.failed" \
    -d "enabled_events[]=charge.refunded" \
    -d "enabled_events[]=account.updated" \
    -d "enabled_events[]=transfer.created" \
    -d "enabled_events[]=transfer.failed" \
    -d "enabled_events[]=transfer.reversed" \
    -d "enabled_events[]=transfer.canceled" \
    -d "enabled_events[]=payout.paid" \
    -d "enabled_events[]=payout.failed")

  local webhook_id
  local webhook_secret
  webhook_id=$(echo "$result" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
  webhook_secret=$(echo "$result" | python3 -c "import sys, json; print(json.load(sys.stdin)['secret'])" 2>/dev/null || echo "")

  if [ -n "$webhook_secret" ]; then
    echo "   ✅ Stripe webhook created: $webhook_id"
    echo "   🔑 Secret: $webhook_secret"

    # Update .env.local
    local env_file="$PROJECT_DIR/.env.local"
    if [ -f "$env_file" ]; then
      sed -i "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$webhook_secret|" "$env_file"
      echo "   📝 Updated STRIPE_WEBHOOK_SECRET in .env.local"
    fi
  else
    echo "   ❌ Failed to create Stripe webhook"
    echo "$result" | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin), indent=2))" 2>/dev/null
  fi
}

# ─── Stop ─────────────────────────────────────────────────────────────────────
stop_all() {
  echo "🛑 Stopping..."
  if [ -f "$PID_FILE" ]; then
    source "$PID_FILE"
    [ -n "${CONVEX_PID:-}" ] && kill "$CONVEX_PID" 2>/dev/null && echo "   Convex stopped (PID $CONVEX_PID)"
    [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null && echo "   Tunnel stopped (PID $TUNNEL_PID)"
    rm -f "$PID_FILE"
  else
    # Try PIDs from individual files
    [ -f /tmp/convex-dev.pid ] && kill "$(cat /tmp/convex-dev.pid)" 2>/dev/null && echo "   Convex stopped"
    [ -f /tmp/cloudflared-tunnel.pid ] && kill "$(cat /tmp/cloudflared-tunnel.pid)" 2>/dev/null && echo "   Tunnel stopped"
  fi
  rm -f /tmp/convex-dev.pid /tmp/cloudflared-tunnel.pid /tmp/cloudflared-tunnel-url.txt
  echo "   ✅ Done"
}

# ─── Status ───────────────────────────────────────────────────────────────────
show_status() {
  echo "📊 Tunnel Status"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Convex
  if curl -s "http://127.0.0.1:3210/" > /dev/null 2>&1; then
    echo "Convex:  ✅ Running (port 3210 / 3211)"
  else
    echo "Convex:  ❌ Not running"
  fi

  # Tunnel
  if [ -f /tmp/cloudflared-tunnel-url.txt ]; then
    local url
    url=$(cat /tmp/cloudflared-tunnel-url.txt)
    if curl -s "$url/" > /dev/null 2>&1; then
      echo "Tunnel:  ✅ Active → $url"
    else
      echo "Tunnel:  ❌ URL saved but not responding: $url"
    fi
  else
    echo "Tunnel:  ❌ Not started"
  fi

  # Webhooks
  if [ -f /tmp/cloudflared-tunnel-url.txt ]; then
    echo ""
    echo "Webhook endpoint: $(cat /tmp/cloudflared-tunnel-url.txt)/api/webhooks/violet"
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  case "${1:-start}" in
    start)
      echo "🚀 Starting Violet Demo Infrastructure"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

      load_violet_creds
      ensure_cloudflared
      start_convex
      start_tunnel

      update_violet_webhooks "$TUNNEL_URL"
      update_stripe_webhook "$TUNNEL_URL"

      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "✅ Everything is running!"
      echo ""
      echo "   Convex:     http://localhost:3210"
      echo "   HTTP API:   http://localhost:$CONVEX_PORT"
      echo "   Tunnel:     $TUNNEL_URL"
      echo "   Webhooks:   $TUNNEL_URL/api/webhooks/violet"
      echo ""
      echo "   To stop:    ./tunnel.sh stop"
      echo "   To check:   ./tunnel.sh status"
      ;;
    stop)
      stop_all
      ;;
    status)
      show_status
      ;;
    *)
      echo "Usage: $0 {start|stop|status}"
      exit 1
      ;;
  esac
}

main "$@"
