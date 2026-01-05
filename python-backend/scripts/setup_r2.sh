#!/bin/bash
# SmartSpec Pro - Cloudflare R2 Setup Script
# Run this script to configure R2 credentials securely

set -e

echo "=========================================="
echo "SmartSpec Pro - Cloudflare R2 Setup"
echo "=========================================="
echo ""

# Check if .env exists
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
fi

echo "Please enter your Cloudflare R2 credentials:"
echo "(Get these from Cloudflare Dashboard > R2 > Manage R2 API Tokens)"
echo ""

# Get Account ID
read -p "Cloudflare Account ID: " ACCOUNT_ID
if [ -z "$ACCOUNT_ID" ]; then
    echo "Error: Account ID is required"
    exit 1
fi

# Get Access Key ID
read -p "R2 Access Key ID: " ACCESS_KEY_ID
if [ -z "$ACCESS_KEY_ID" ]; then
    echo "Error: Access Key ID is required"
    exit 1
fi

# Get Secret Access Key (hidden input)
read -sp "R2 Secret Access Key: " SECRET_ACCESS_KEY
echo ""
if [ -z "$SECRET_ACCESS_KEY" ]; then
    echo "Error: Secret Access Key is required"
    exit 1
fi

# Update .env file
echo ""
echo "Updating .env file..."

# Use sed to update values (works on both Linux and macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|CLOUDFLARE_R2_ACCESS_KEY_ID=.*|CLOUDFLARE_R2_ACCESS_KEY_ID=$ACCESS_KEY_ID|" "$ENV_FILE"
    sed -i '' "s|CLOUDFLARE_R2_SECRET_ACCESS_KEY=.*|CLOUDFLARE_R2_SECRET_ACCESS_KEY=$SECRET_ACCESS_KEY|" "$ENV_FILE"
    sed -i '' "s|CLOUDFLARE_R2_ENDPOINT=.*|CLOUDFLARE_R2_ENDPOINT=https://$ACCOUNT_ID.r2.cloudflarestorage.com|" "$ENV_FILE"
else
    # Linux
    sed -i "s|CLOUDFLARE_R2_ACCESS_KEY_ID=.*|CLOUDFLARE_R2_ACCESS_KEY_ID=$ACCESS_KEY_ID|" "$ENV_FILE"
    sed -i "s|CLOUDFLARE_R2_SECRET_ACCESS_KEY=.*|CLOUDFLARE_R2_SECRET_ACCESS_KEY=$SECRET_ACCESS_KEY|" "$ENV_FILE"
    sed -i "s|CLOUDFLARE_R2_ENDPOINT=.*|CLOUDFLARE_R2_ENDPOINT=https://$ACCOUNT_ID.r2.cloudflarestorage.com|" "$ENV_FILE"
fi

echo ""
echo "=========================================="
echo "R2 Configuration Complete!"
echo "=========================================="
echo ""
echo "Configured values:"
echo "  Bucket: smartspec"
echo "  Endpoint: https://$ACCOUNT_ID.r2.cloudflarestorage.com"
echo "  Public URL: https://pub-0d23e3fbcf704b76aa826d4c11095905.r2.dev"
echo ""
echo "To test the connection, run:"
echo "  python -c \"from app.core.r2_config import get_r2_client; print(get_r2_client().health_check())\""
echo ""
