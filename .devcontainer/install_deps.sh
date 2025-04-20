#!/usr/bin/env bash
set -e

echo "🔧  Installing NPM deps in be/ and fe/ ..."

for d in be fe; do
  if [ -d "$d" ]; then
    if [ -f "$d/package-lock.json" ]; then
      echo "✔  $d  →  npm ci"
      npm --prefix "$d" ci
    else
      echo "⚠  $d  has no lockfile – npm install (slower, not reproducible)"
      npm --prefix "$d" install
    fi
  else
    echo "⤵  skipping $d – directory does not exist"
  fi
done
echo "✅  Dependency bootstrap complete."
