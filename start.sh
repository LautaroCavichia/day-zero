#!/usr/bin/env bash
set -e

echo "🚀 Starting DayZero..."
echo

# Create venv if missing (use system python)
if [ ! -d "venv" ]; then
  if command -v python3 >/dev/null 2>&1; then SYS_PY=python3
  elif command -v python >/dev/null 2>&1; then SYS_PY=python
  else
    echo "Python not found in PATH. Install Python first." >&2
    exit 1
  fi
  echo "Creating virtual environment..."
  "$SYS_PY" -m venv venv
  echo "✓ Virtual environment created"
fi

# Prefer the venv python executable (cross-platform)
if [ -x "venv/bin/python" ]; then
  VENV_PY="venv/bin/python"
elif [ -x "venv/Scripts/python.exe" ]; then
  VENV_PY="venv/Scripts/python.exe"
elif [ -x "venv/Scripts/python" ]; then
  VENV_PY="venv/Scripts/python"
else
  VENV_PY=""
fi

# Try to source activation for nicer UX (works on macOS, Linux, Git Bash)
if [ -f "venv/bin/activate" ]; then
  # shellcheck source=/dev/null
  source venv/bin/activate
elif [ -f "venv/Scripts/activate" ]; then
  # shellcheck source=/dev/null
  source venv/Scripts/activate
fi

# If we couldn't find venv python above, try fallback to whichever python is on PATH
if [ -z "$VENV_PY" ]; then
  if command -v python3 >/dev/null 2>&1; then VENV_PY=python3
  elif command -v python >/dev/null 2>&1; then VENV_PY=python
  else
    echo "No Python available to run the app." >&2
    exit 1
  fi
fi

# Ensure pip is available via the chosen python
"$VENV_PY" -m pip --version >/dev/null 2>&1 || { echo "pip not available for $VENV_PY" >&2; exit 1; }

echo "Checking dependencies..."
if ! "$VENV_PY" -c "import fastapi, pydantic, pydantic_settings, dotenv" 2>/dev/null; then
  echo "Installing dependencies..."
  "$VENV_PY" -m pip install -q -r backend/requirements.txt
  echo "✓ Dependencies installed"
else
  echo "✓ Dependencies already installed"
fi

# .env checks
if [ ! -f ".env" ]; then
  echo "⚠️  .env file not found. Copying from .env.example..."
  cp .env.example .env
  echo "⚠️  Please edit .env and add your GOOGLE_API_KEY"
  exit 1
fi

if ! grep -q "GOOGLE_API_KEY=.*[A-Za-z0-9]" .env 2>/dev/null; then
  echo "⚠️  GOOGLE_API_KEY not set in .env file"
  echo "   Get your API key from: https://aistudio.google.com/apikey"
  exit 1
fi

echo "✓ Environment ready"
echo
echo "Starting server on http://localhost:8080"
echo "Press Ctrl+C to stop"
echo

export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}."
"$VENV_PY" -m backend.main