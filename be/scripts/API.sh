#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# scripts/api.sh  – set a (user‑specific) OpenAI key in the
#                   *running* backend container and restart it
#
# Usage:
#   ./scripts/api.sh  sk‑proj‑your‑key
# ────────────────────────────────────────────────────────────────

KEY="$1"
if [[ -z "$KEY" ]]; then
  echo "❌  No key supplied."
  echo "   Usage: ./scripts/api.sh  sk‑proj‑…"
  exit 1
fi

echo "🔐  Injecting key into backend container …"
docker compose exec backend bash -c "
    echo 'GPT_API_KEY=${KEY}' > /app/.env \
 && echo 'export GPT_API_KEY=${KEY}' >> /etc/profile \
 && echo '✅  /app/.env updated'
"

echo "♻️   Restarting backend to pick up the key …"
docker compose restart backend

echo "✅  Done."
