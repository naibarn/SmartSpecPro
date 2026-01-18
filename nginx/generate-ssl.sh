#!/bin/bash
# SmartSpec Pro - SSL Certificate Generator
# Generates self-signed certificates for development/testing
#
# Usage: ./generate-ssl.sh [domain]
# Example: ./generate-ssl.sh smartspec.local

DOMAIN=${1:-smartspec.local}
SSL_DIR="$(dirname "$0")/ssl"

# Create SSL directory if not exists
mkdir -p "$SSL_DIR"

echo "Generating SSL certificates for: $DOMAIN"

# Generate private key and certificate
openssl req -x509 \
    -nodes \
    -days 365 \
    -newkey rsa:2048 \
    -keyout "$SSL_DIR/smartspec.key" \
    -out "$SSL_DIR/smartspec.crt" \
    -subj "/C=TH/ST=Bangkok/L=Bangkok/O=SmartSpec/OU=Development/CN=$DOMAIN" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1"

# Set permissions
chmod 600 "$SSL_DIR/smartspec.key"
chmod 644 "$SSL_DIR/smartspec.crt"

echo ""
echo "SSL certificates generated successfully!"
echo "  Certificate: $SSL_DIR/smartspec.crt"
echo "  Private Key: $SSL_DIR/smartspec.key"
echo ""
echo "To enable HTTPS:"
echo "  1. Rename nginx/conf.d/ssl.conf.example to ssl.conf"
echo "  2. Uncomment port 443 in docker-compose.nginx.yml"
echo "  3. Restart nginx: docker-compose -f docker-compose.nginx.yml restart nginx"
