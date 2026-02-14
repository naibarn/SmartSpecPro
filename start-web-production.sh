#!/bin/bash
# Force production mode for web app
export NODE_ENV=production
export PORT=3000

# Ensure nvm is loaded
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")/apps/web"

echo "========================================="
echo "Starting SmartSpec Web in PRODUCTION mode"
echo "NODE_ENV=$NODE_ENV"
echo "PORT=$PORT"
echo "PWD=$(pwd)"
echo "========================================="

# Kill any existing process on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Run production server
npm run start
