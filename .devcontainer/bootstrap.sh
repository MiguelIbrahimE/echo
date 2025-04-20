#!/usr/bin/env bash
# .devcontainer/bootstrap.sh
set -e

echo "📦  Bootstrapping workspace…"

# 1) Install backend deps if lock‑file present
if [[ -f /workspaces/echo/be/package-lock.json ]]; then
  npm --prefix /workspaces/echo/be ci --omit=dev
else
  echo "⚠  be/ has no lock‑file → running npm install"
  npm --prefix /workspaces/echo/be install
fi

# 2) Install frontend deps
npm --prefix /workspaces/echo/fe ci

echo "✅  Dependencies installed"
