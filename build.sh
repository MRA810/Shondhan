#!/usr/bin/env bash
# Build Shondhan for production: website, Python packages, database, static files, face models.
# Run it once after every update, then start with ./start_production.sh
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
B="$ROOT/backend"; F="$ROOT/frontend"
fail() { echo; echo "ERROR: $*"; exit 1; }

[[ -f "$B/.env" ]] || fail "backend/.env not found. Copy backend/.env.example to backend/.env and fill it in."
[[ -x "$B/venv/bin/python" ]] || { echo "Creating Python environment..."; python3 -m venv "$B/venv" || fail "python3 -m venv failed (sudo apt install python3-venv)"; }
PY="$B/venv/bin/python"

echo "[1/5] Python packages..."
"$PY" -m pip install -q --upgrade pip
"$PY" -m pip install -q -r "$B/requirements.txt" || fail "pip install failed."

echo "[2/5] Building the website (React)..."
(cd "$F" && { [[ -d node_modules ]] || npm install --silent; } && npm run build --silent) || fail "Website build failed (see above)."

echo "[3/5] Database..."
(cd "$B" && "$PY" manage.py migrate --no-input) || fail "Migrations failed. Is PostgreSQL running and is backend/.env correct?"

echo "[4/5] Static files (admin pages)..."
(cd "$B" && "$PY" manage.py collectstatic --no-input -v 0) || fail "collectstatic failed."

echo "[5/5] Face matching models..."
if [[ -f "$B/face_models/face_recognition_sface_2021dec.onnx" ]]; then echo "      already there"
else (cd "$B" && "$PY" manage.py download_face_models) || echo "      (download failed; photos won't be compared until: python manage.py download_face_models)"; fi

(cd "$B" && "$PY" manage.py check --deploy 2>&1 | grep -E "WARNING|ERROR" | grep -v "W004\|W008\|W021" | head -5) || true
echo
echo "Build done. Start it with: ./start_production.sh"
