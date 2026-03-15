#!/bin/bash
# Quick start script for DayZero local development

set -e

echo "🚀 Starting DayZero..."
echo ""

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment created"
fi

# Activate venv
source venv/bin/activate

# Check if dependencies are installed (using python3 explicitly)
echo "Checking dependencies..."
if ! python3 -c "import fastapi, pydantic, pydantic_settings, dotenv" 2>/dev/null; then
    echo "Installing dependencies..."
    pip install -q -r backend/requirements.txt
    echo "✓ Dependencies installed"
else
    echo "✓ Dependencies already installed"
fi

# Check for API key
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your GOOGLE_API_KEY"
    exit 1
fi

# Check if API key is set
if ! grep -q "GOOGLE_API_KEY=.*[A-Za-z0-9]" .env 2>/dev/null; then
    echo "⚠️  GOOGLE_API_KEY not set in .env file"
    echo "   Get your API key from: https://aistudio.google.com/apikey"
    exit 1
fi

echo "✓ Environment ready"
echo ""
echo "Starting server on http://localhost:8080"
echo "Press Ctrl+C to stop"
echo ""

# Run from root using module syntax to resolve absolute imports
export PYTHONPATH=$PYTHONPATH:.
python3 -m backend.main

