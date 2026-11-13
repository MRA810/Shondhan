
#!/usr/bin/env bash

set -Eeuo pipefail

# Project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

BACKEND_PORT=8000
FRONTEND_PORT=5173

# Temporary log files
BACKEND_LOG="/tmp/shondhan-backend.log"
FRONTEND_LOG="/tmp/shondhan-frontend.log"

BACKEND_PID=""
FRONTEND_PID=""
TAIL_PID=""

cleanup() {
    echo ""
    echo "Stopping Shondhan servers..."

    [[ -n "$TAIL_PID" ]] && kill "$TAIL_PID" 2>/dev/null || true
    [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
    [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true

    echo "Shondhan stopped."
}

trap cleanup EXIT INT TERM

# Check required files
if [[ ! -f "$BACKEND_DIR/manage.py" ]]; then
    echo "Error: Django manage.py not found."
    exit 1
fi

if [[ ! -d "$BACKEND_DIR/venv" ]]; then
    echo "Error: Backend virtual environment not found."
    exit 1
fi

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    echo "Error: Backend .env file not found."
    exit 1
fi

if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
    echo "Error: Frontend package.json not found."
    exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "Error: Frontend dependencies missing. Run npm install first."
    exit 1
fi

# Start PostgreSQL
echo "[1/4] Starting PostgreSQL..."

sudo systemctl start postgresql

# Apply Django migrations
echo "[2/4] Applying database migrations..."

cd "$BACKEND_DIR"
source venv/bin/activate

python manage.py migrate

# Start Django
echo "[3/4] Starting Django backend..."

python manage.py runserver 127.0.0.1:$BACKEND_PORT \
    > "$BACKEND_LOG" 2>&1 &

BACKEND_PID=$!

# Start React + Vite
echo "[4/4] Starting React frontend..."

cd "$FRONTEND_DIR"

npm run dev -- --host 127.0.0.1 \
    > "$FRONTEND_LOG" 2>&1 &

FRONTEND_PID=$!

sleep 2

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "Backend failed to start. Check $BACKEND_LOG"
    exit 1
fi

if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "Frontend failed to start. Check $FRONTEND_LOG"
    exit 1
fi

echo ""
echo "================================="
echo "       SHONDHAN IS RUNNING"
echo "================================="
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8000"
echo "Admin:    http://localhost:8000/admin/"
echo "================================="
echo ""
echo "Press Ctrl+C to stop both servers."
echo ""

tail -f "$BACKEND_LOG" "$FRONTEND_LOG" &
TAIL_PID=$!

wait "$TAIL_PID"
