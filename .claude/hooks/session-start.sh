#!/bin/bash
# Session setup script for Claude Code for Web
# This script is run by the SessionStart hook to configure Firebase credentials

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "=== D&D Initiative Tracker Session Setup ==="

# Firebase configuration from environment variables
# These should be set in Claude Code for Web environment settings
VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY:-}"
VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN:-}"
VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID:-}"
VITE_FIREBASE_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET:-}"
VITE_FIREBASE_MESSAGING_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID:-}"
VITE_FIREBASE_APP_ID="${VITE_FIREBASE_APP_ID:-}"

# Check if any Firebase config is set
if [ -z "$VITE_FIREBASE_PROJECT_ID" ]; then
    echo "  WARNING: Firebase environment variables not set"
    echo "  Set these in Claude Code for Web environment settings:"
    echo "    - VITE_FIREBASE_API_KEY"
    echo "    - VITE_FIREBASE_AUTH_DOMAIN"
    echo "    - VITE_FIREBASE_PROJECT_ID"
    echo "    - VITE_FIREBASE_STORAGE_BUCKET"
    echo "    - VITE_FIREBASE_MESSAGING_SENDER_ID"
    echo "    - VITE_FIREBASE_APP_ID"
    echo ""
    echo "  Skipping .env file creation"
else
    # Create .env file from environment variables
    echo "Creating .env file from environment variables..."
    cat > "$PROJECT_ROOT/.env" << EOF
# Auto-generated Firebase config - DO NOT COMMIT
# Generated at: $(date -Iseconds)

VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}
VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}
VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}
VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}
VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}
VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}
EOF

    chmod 600 "$PROJECT_ROOT/.env"
    echo "  Created: $PROJECT_ROOT/.env"
fi

# Install npm dependencies if node_modules doesn't exist
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    echo "Installing npm dependencies..."
    cd "$PROJECT_ROOT"
    npm install
    echo "  Dependencies installed"
else
    echo "  Dependencies already installed"
fi

# Run TypeScript type check
echo "Running TypeScript type check..."
cd "$PROJECT_ROOT"
if npm run typecheck 2>/dev/null; then
    echo "  TypeScript check passed"
else
    echo "  WARNING: TypeScript check failed or not configured yet"
fi

# Run build
echo "Building project..."
if npm run build 2>/dev/null; then
    echo "  Build successful"
else
    echo "  WARNING: Build failed or not configured yet"
fi

echo "=== Session Setup Complete ==="
echo ""
echo "To test locally:"
echo "  npm run dev"
echo ""
echo "Public Display URL: http://localhost:3000/public/"
echo "DM Control URL: http://localhost:3000/dm/"
