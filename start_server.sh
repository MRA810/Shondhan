#!/usr/bin/env bash
# Starts PostgreSQL, Django (port 8000) and the React dev server (port 5173). Ctrl+C stops everything.
# Usage: ./start_server.sh            normal start (opens the browser when ready)
#        ./start_server.sh --lan      also let phones / laptops on the same Wi-Fi open it
#        ./start_server.sh --no-open  do not open the browser (options can be combined)
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_PORT=8000
FRONTEND_PORT=5173
BACKEND_LOG="/tmp/shondhan-backend.log"
FRONTEND_LOG="/tmp/shondhan-frontend.log"
BACKEND_PID=""
FRONTEND_PID=""
TAIL_PID=""
OPEN_BROWSER=1
FRONT_HOST=127.0.0.1
for arg in "$@"; do
    case "$arg" in
        --no-open) OPEN_BROWSER=0 ;;
        --lan) FRONT_HOST=0.0.0.0 ;;  # only the website listens on the network; Django stays private
        *) echo "Unknown option: $arg (use --lan and/or --no-open)"; exit 1 ;;
    esac
done

# Each server runs in its own process group. Django's auto-reloader and npm both start child
# processes; killing only the parent left them running and holding the port for the next start.
stop_group() {
    local pid="$1"
    [[ -z "$pid" ]] && return 0
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 -- "-$pid" 2>/dev/null || return 0
        sleep 0.3
    done
    kill -KILL -- "-$pid" 2>/dev/null || true
}

cleanup() {
    trap - EXIT INT TERM
    echo ""
    echo "Stopping Shondhan servers..."
    [[ -n "$TAIL_PID" ]] && kill "$TAIL_PID" 2>/dev/null
    stop_group "$FRONTEND_PID"
    stop_group "$BACKEND_PID"
    echo "Shondhan stopped."
}
trap cleanup EXIT
trap 'cleanup; exit 0' INT TERM  # Ctrl+C: stop everything and end here

fail() {
    echo ""
    echo "ERROR: $1"
    if [[ -n "${2:-}" && -f "$2" ]]; then
        echo "---- last lines of $2 ----"
        tail -n 25 "$2"
        echo "--------------------------"
    fi
    exit 1
}

port_in_use() {
    if command -v ss >/dev/null 2>&1; then
        ss -ltn "sport = :$1" 2>/dev/null | grep -q LISTEN
    elif command -v lsof >/dev/null 2>&1; then
        lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
    else
        (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
    fi
}

# Frees a port held by an old Shondhan server (left over from an earlier run); refuses to touch anything else.
free_port() {
    local port="$1" pattern="$2" what="$3"
    port_in_use "$port" || return 0
    if pgrep -f "$pattern" >/dev/null 2>&1; then
        echo "      An old $what is still running on port $port. Stopping it..."
        pkill -f "$pattern" || true
        for _ in 1 2 3 4 5 6 7 8 9 10; do port_in_use "$port" || return 0; sleep 0.5; done
        pkill -9 -f "$pattern" || true
        sleep 1
    fi
    port_in_use "$port" && fail "Port $port is used by another program. Close it, or find it with: lsof -i :$port"
    return 0
}

# Run a command in a new process group (setsid on Linux; perl on macOS, which has no setsid).
# Called as `new_group cmd &`: bash runs it in a background subshell, so `exec` makes that subshell
# BECOME the server; then $! is the server's own pid and its process-group id.
new_group() {
    if command -v setsid >/dev/null 2>&1; then exec setsid "$@"
    else exec perl -e 'setpgrp(0, 0); exec @ARGV or die "$!"' -- "$@"; fi
}

# ---------- checks ----------
[[ -f "$BACKEND_DIR/manage.py" ]] || fail "backend/manage.py not found. Run this from the Shondhan folder."
[[ -x "$BACKEND_DIR/venv/bin/python" ]] || fail "backend/venv not found. Run ./install.sh first."
[[ -f "$BACKEND_DIR/.env" ]] || fail "backend/.env not found. Copy backend/.env.example to backend/.env and set DB_PASSWORD."
[[ -d "$FRONTEND_DIR/node_modules" ]] || fail "Frontend packages missing. Run: cd frontend && npm install"
PY="$BACKEND_DIR/venv/bin/python"

# packages added in later versions (Pillow for photos, three.js for the 3D figure)
if ! "$PY" -c "import PIL, rest_framework_simplejwt, corsheaders, cv2, numpy" 2>/dev/null; then
    echo "Installing missing Python packages..."
    "$PY" -m pip install -q -r "$BACKEND_DIR/requirements.txt" || fail "pip install failed."
fi
if [[ ! -d "$FRONTEND_DIR/node_modules/three" ]]; then
    echo "Installing missing frontend packages..."
    (cd "$FRONTEND_DIR" && npm install --silent) || fail "npm install failed."
fi

# ---------- PostgreSQL ----------
echo "[1/4] Starting PostgreSQL..."
if command -v pg_isready >/dev/null 2>&1 && pg_isready -q -h 127.0.0.1; then
    echo "      PostgreSQL is already running."
elif command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start postgresql || fail "Could not start PostgreSQL (sudo systemctl start postgresql)."
elif command -v brew >/dev/null 2>&1; then
    brew services start postgresql@16 >/dev/null || true
fi

# Can Django actually log in to the database? (wrong password in .env, database missing, server down)
DB_CHECK="$(cd "$BACKEND_DIR" && "$PY" -c '
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()
from django.db import connection
try:
    connection.ensure_connection()
    print("ok")
except Exception as e:
    print(str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__)
' 2>&1 | tail -n 1)"
if [[ "$DB_CHECK" != "ok" ]]; then
    echo ""
    echo "ERROR: Django cannot connect to PostgreSQL:"
    echo "       $DB_CHECK"
    case "$DB_CHECK" in
        *"password authentication failed"*) echo "  Fix: DB_PASSWORD in backend/.env must match the password of the database user." ;;
        *"does not exist"*) echo "  Fix: create the user and database (README, step 1):"
                            echo "       sudo -u postgres psql -c \"CREATE USER shondhan WITH PASSWORD 'shondhan_pass';\" -c \"CREATE DATABASE shondhan OWNER shondhan;\"" ;;
        *"Connection refused"*|*"could not connect"*|*"No such file"*) echo "  Fix: start PostgreSQL:  sudo systemctl start postgresql" ;;
    esac
    exit 1
fi

# ---------- migrations ----------
echo "[2/4] Applying database migrations..."
(cd "$BACKEND_DIR" && "$PY" manage.py migrate) || fail "Migrations failed (see above)."

# face AI models (~40 MB, once). Without them matching still works, using the details only.
if [[ ! -f "$BACKEND_DIR/face_models/face_recognition_sface_2021dec.onnx" ]]; then
    echo "      Downloading the face matching models (once, ~40 MB)..."
    (cd "$BACKEND_DIR" && "$PY" manage.py download_face_models) \
        || echo "      (could not download face models; photos will not be compared until you run: python manage.py download_face_models)"
fi
# photos uploaded before the models were there
(cd "$BACKEND_DIR" && "$PY" manage.py shell -c "
from cases import faces; from cases.models import CasePhoto, RecordPhoto
import sys; sys.exit(0 if faces.ready() and (CasePhoto.objects.filter(kind='photo', face_status__in=['pending','off']).exists() or RecordPhoto.objects.filter(kind='photo', face_status__in=['pending','off']).exists()) else 1)" 2>/dev/null) \
    && { echo "      Checking faces in older photos..."; (cd "$BACKEND_DIR" && "$PY" manage.py process_faces) || true; }

# first run: add the demo accounts so there is something to log in with
USERS="$(cd "$BACKEND_DIR" && "$PY" manage.py shell -c "from accounts.models import User; print(User.objects.count())" 2>/dev/null | tail -n 1)"
if [[ "$USERS" == "0" ]]; then
    echo "      Empty database: adding demo accounts..."
    (cd "$BACKEND_DIR" && "$PY" manage.py seed_demo) || echo "      (could not add demo data; the app still works)"
fi

# ---------- Django ----------
echo "[3/4] Starting Django backend..."
free_port "$BACKEND_PORT" "manage.py runserver" "Django server"
cd "$BACKEND_DIR"
new_group "$PY" manage.py runserver "127.0.0.1:$BACKEND_PORT" > "$BACKEND_LOG" 2>&1 < /dev/null &
BACKEND_PID=$!

# ---------- React ----------
echo "[4/4] Starting React frontend..."
free_port "$FRONTEND_PORT" "$FRONTEND_DIR/node_modules/.bin/vite|node_modules/.bin/vite" "frontend server"
cd "$FRONTEND_DIR"
new_group npm run dev -- --host "$FRONT_HOST" --port "$FRONTEND_PORT" --strictPort > "$FRONTEND_LOG" 2>&1 < /dev/null &
FRONTEND_PID=$!

# Wait (up to 40 s) until the API answers THROUGH the website, the same way the browser calls it.
# A healthy API answers 401 ("not logged in") on /api/auth/me/.
http_code() {
    if command -v curl >/dev/null 2>&1; then
        curl -s -o /dev/null -m 3 -w "%{http_code}" "$1" 2>/dev/null || echo 000
    else
        "$PY" -c "import sys,urllib.request,urllib.error
try: print(urllib.request.urlopen(sys.argv[1], timeout=3).status)
except urllib.error.HTTPError as e: print(e.code)
except Exception: print('000')" "$1"
    fi
}
CODE=000
for i in $(seq 1 80); do
    kill -0 "$BACKEND_PID" 2>/dev/null || fail "Django stopped while starting." "$BACKEND_LOG"
    kill -0 "$FRONTEND_PID" 2>/dev/null || fail "The frontend stopped while starting." "$FRONTEND_LOG"
    if port_in_use "$BACKEND_PORT" && port_in_use "$FRONTEND_PORT"; then
        CODE="$(http_code "http://127.0.0.1:$FRONTEND_PORT/api/auth/me/")"
        [[ "$CODE" == "401" ]] && break
    fi
    sleep 0.5
done
if [[ "$CODE" != "401" ]]; then
    if [[ "$CODE" == 5* ]]; then
        fail "The API answers with error $CODE (Django is running but crashing)." "$BACKEND_LOG"
    fi
    fail "The website cannot reach the API (last answer: $CODE)." "$BACKEND_LOG"
fi

echo ""
echo "================================="
echo "       SHONDHAN IS RUNNING"
echo "================================="
echo "Open:     http://localhost:$FRONTEND_PORT"
echo "Backend:  http://localhost:$BACKEND_PORT/api/"
echo "Admin:    http://localhost:$BACKEND_PORT/admin/"
echo "Logs:     $BACKEND_LOG  |  $FRONTEND_LOG"
echo "Demo accounts (if empty): cd backend && venv/bin/python manage.py seed_demo"
if [[ "$FRONT_HOST" == "0.0.0.0" ]]; then
    LAN_IPS="$(hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || true)"
    echo ""
    echo "On other devices (same Wi-Fi), open:"
    for ip in $LAN_IPS; do
        [[ "$ip" == *:* ]] && continue  # skip IPv6
        echo "          http://$ip:$FRONTEND_PORT"
    done
    if command -v ufw >/dev/null 2>&1 && sudo -n ufw status 2>/dev/null | grep -q "Status: active"; then
        sudo -n ufw status | grep -q "$FRONTEND_PORT" || echo "Firewall is on. Allow the app once with:  sudo ufw allow $FRONTEND_PORT/tcp"
    fi
fi
echo "================================="
echo "Press Ctrl+C to stop both servers."
echo ""
if [[ "$OPEN_BROWSER" == 1 ]]; then
    if command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then open "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1 &
    fi
fi

# show both logs live; if either server dies, stop and say why
tail -n 0 -F "$BACKEND_LOG" "$FRONTEND_LOG" &
TAIL_PID=$!
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do sleep 1; done
kill "$TAIL_PID" 2>/dev/null || true
kill -0 "$BACKEND_PID" 2>/dev/null || fail "Django stopped." "$BACKEND_LOG"
fail "The frontend stopped." "$FRONTEND_LOG"
