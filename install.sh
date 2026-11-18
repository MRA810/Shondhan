#!/usr/bin/env bash
# Shondhan dependency installer for Ubuntu/Debian and macOS.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

info() { printf '\n\033[1;34m[Shondhan]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[Warning]\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31m[Error]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$BACKEND_DIR/requirements.txt" ]] || fail "backend/requirements.txt not found. Run this script from the Shondhan project root."
[[ -f "$FRONTEND_DIR/package.json" ]] || fail "frontend/package.json not found. Run this script from the Shondhan project root."

OS="$(uname -s)"
case "$OS" in
  Linux)
    command -v apt-get >/dev/null 2>&1 || fail "This Linux installer currently supports Ubuntu/Debian (apt)."
    info "Installing Ubuntu/Debian system packages..."
    sudo apt-get update
    sudo apt-get install -y python3 python3-venv python3-pip python3-dev build-essential curl git postgresql postgresql-contrib
    # Vite 8 requires a modern Node.js release. Install Node.js 22 LTS from NodeSource.
    if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
      info "Installing Node.js 22 LTS..."
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
    fi
    ;;
  Darwin)
    command -v brew >/dev/null 2>&1 || fail "Homebrew is required on macOS. Install it from https://brew.sh, then rerun this script."
    info "Installing macOS dependencies with Homebrew..."
    brew update
    brew install python node@22 postgresql@16 git
    # Make the Homebrew Node 22 executable available in this shell and future shells.
    NODE_PREFIX="$(brew --prefix node@22)"
    export PATH="$NODE_PREFIX/bin:$PATH"
    info "Starting PostgreSQL service..."
    brew services start postgresql@16 || warn "Could not start PostgreSQL automatically. You can start it with: brew services start postgresql@16"
    ;;
  *)
    fail "Unsupported operating system: $OS"
    ;;
esac

# Verify minimum Node major version.
command -v python3 >/dev/null 2>&1 || fail "python3 was not found after installation."
command -v node >/dev/null 2>&1 || fail "Node.js was not found after installation."
command -v npm >/dev/null 2>&1 || fail "npm was not found after installation."
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 22 )) || fail "Node.js 22 or newer is required by this installer. Detected: $(node --version)"

info "Creating backend virtual environment..."
python3 -m venv "$BACKEND_DIR/venv"

info "Installing Python dependencies..."
"$BACKEND_DIR/venv/bin/python" -m pip install --upgrade pip
"$BACKEND_DIR/venv/bin/python" -m pip install -r "$BACKEND_DIR/requirements.txt"

info "Installing frontend dependencies..."
if command -v npm >/dev/null 2>&1; then
  (cd "$FRONTEND_DIR" && npm install)
else
  fail "npm is unavailable. Install Node.js 22 LTS and rerun this script."
fi

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  if [[ -f "$BACKEND_DIR/.env.example" ]]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    warn "Created backend/.env from .env.example. Review and update its values before running the app."
  else
    warn "backend/.env does not exist and no .env.example was found. Create it before starting Django."
  fi
else
  info "backend/.env already exists; leaving it unchanged."
fi

info "Checking PostgreSQL service..."
if [[ "$OS" == "Linux" ]]; then
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
elif [[ "$OS" == "Darwin" ]]; then
  brew services start postgresql@16 || true
fi

printf '\n'
info "Installation steps completed."
printf 'Python: '; python3 --version
printf 'Node:   '; node --version
printf 'npm:    '; npm --version
printf '\nNext steps:\n'
printf '  1. Review backend/.env and set the correct database credentials.\n'
printf '  2. Ensure PostgreSQL has a database and user matching backend/.env.\n'
printf '  3. From the project root, run: ./start_server.sh\n'
printf '\nIf PostgreSQL user/database have not been created yet, see the setup notes in the installer instructions.\n'
