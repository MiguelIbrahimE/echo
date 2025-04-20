#!/usr/bin/env bash
set -euo pipefail

# Location of the shared .env file (repo‑root)
ENV_FILE="/workspaces/${LOCAL_WORKSPACE_FOLDER_BASENAME}/.env"

# Already present?  Nothing to do.
if grep -q '^GPT_API_KEY=' "$ENV_FILE" 2>/dev/null; then
  echo "💡  GPT_API_KEY already set in .env – skipping prompt."
  exit 0
fi

# Prompt (hidden input) – repeats until user gives *something* 20+ chars
while true; do
  read -rsp $'🔑  Enter your **personal** OpenAI API key (input hidden): ' KEY
  echo                      # new line
  if [[ ${#KEY} -lt 20 ]]; then
    echo "❌  Key looks too short – please try again."
  else
    break
  fi
done

# Append or create .env
echo -e "\nGPT_API_KEY=$KEY" >> "$ENV_FILE"
echo "✅  Saved to $ENV_FILE"
