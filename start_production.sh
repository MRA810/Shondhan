#!/usr/bin/env bash
# Run the built Shondhan (after ./build.sh): website + API on one address, http://localhost:8000
#   ./start_production.sh          only this computer (use with Cloudflare Tunnel)
#   ./start_production.sh --lan    also other devices on your Wi-Fi
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"; B="$ROOT/backend"
PORT="${PORT:-8000}"; HOST=127.0.0.1
[[ "${1:-}" == "--lan" ]] && HOST=0.0.0.0
[[ -x "$B/venv/bin/gunicorn" ]] || { echo "Run ./build.sh first."; exit 1; }
[[ -f "$ROOT/frontend/dist/index.html" ]] || { echo "Website not built. Run ./build.sh first."; exit 1; }
grep -qE '^DJANGO_DEBUG=0' "$B/.env" || echo "NOTE: DJANGO_DEBUG is not 0 in backend/.env. Set it to 0 for a real deployment."
cd "$B"
echo "Shondhan is running at http://localhost:$PORT  (Ctrl+C to stop)"
# 2 worker processes x 4 threads; long timeout because the first face check loads the AI models
exec venv/bin/gunicorn config.wsgi:application --bind "$HOST:$PORT" \
     --workers "${WORKERS:-2}" --worker-class gthread --threads 4 --timeout 120 \
     --access-logfile - --error-logfile -
