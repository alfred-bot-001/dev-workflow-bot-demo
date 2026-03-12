#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🤖 Dev Workflow Bot Demo"
echo "========================"

# Check Python
if ! command -v python3 &>/dev/null; then
  echo "❌ Python3 not found"
  exit 1
fi

# Create venv
if [ ! -d "venv" ]; then
  echo "📦 Creating virtual environment..."
  python3 -m venv venv
fi

# Install deps
echo "📦 Installing dependencies..."
./venv/bin/pip install -q -r requirements.txt

echo ""
echo "✅ Ready! Open: http://localhost:8088"
echo "   Press Ctrl+C to stop"
echo ""

./venv/bin/python app.py
