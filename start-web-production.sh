#!/bin/bash
# Force production mode for web app
export NODE_ENV=production
export PORT=3000

# Ensure nvm is loaded
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
    nvm use 22.22.3 >/dev/null
fi

cd "$(dirname "$0")/apps/web"
node ../../scripts/check-node-version.mjs

echo "========================================="
echo "Starting SmartSpec Web in PRODUCTION mode"
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"
echo "PWD=$(pwd)"
echo "========================================="

# Kill any existing process on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Run production server
exec node --import tsx server/_core/index.ts
