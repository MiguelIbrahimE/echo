# scripts/set-openai-key.sh
#!/usr/bin/env bash
set -euo pipefail

WS_DIR=${WORKSPACE_FOLDER:-/workspaces/echo}
ENV_FILE="${WS_DIR}/.env"

echo ""
read -r -p "🔑  Enter your OpenAI API key (sk-…): " USER_KEY
USER_KEY=${USER_KEY//[[:space:]]/}

[[ -z "$USER_KEY" ]] && { echo "❌ No key – aborted."; exit 1; }

if grep -q "^GPT_API_KEY=" "$ENV_FILE" 2>/dev/null; then
  sed -i.bak "s|^GPT_API_KEY=.*|GPT_API_KEY=${USER_KEY}|" "$ENV_FILE"
else
  echo "GPT_API_KEY=${USER_KEY}" >> "$ENV_FILE"
fi

echo "✅  Key saved to ${ENV_FILE}"

# Restart backend only if it exists & is running
if docker compose ps --status running backend >/dev/null 2>&1; then
  echo "♻️  Restarting backend…"
  docker compose restart backend
fi
