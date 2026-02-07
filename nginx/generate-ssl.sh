#!/bin/bash
# SmartSpec Pro - SSL Certificate Generator
# Generates self-signed certificates with multi-domain SAN support
#
# Usage: ./generate-ssl.sh [domain]
# Example: ./generate-ssl.sh smartaihub.app

DOMAIN=${1:-smartaihub.app}
SSL_DIR="$(dirname "$0")/ssl"

# Create SSL directory if not exists
mkdir -p "$SSL_DIR"

echo "Generating SSL certificates for: $DOMAIN (with multi-domain SAN)"

# Generate private key and certificate with all domain SANs
openssl req -x509 \
    -nodes \
    -days 365 \
    -newkey rsa:2048 \
    -keyout "$SSL_DIR/smartaihub.app.key" \
    -out "$SSL_DIR/smartaihub.app.crt" \
    -subj "/C=TH/ST=Bangkok/L=Bangkok/O=SmartSpec/OU=Production/CN=$DOMAIN" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:smartspec.local,DNS:smartspec.pro,DNS:smartaihub.app,DNS:docker.smartaihub.app,DNS:docker.smartspec.local,DNS:docker.smartspec.pro,DNS:localhost,IP:127.0.0.1"

# Set permissions
chmod 600 "$SSL_DIR/smartaihub.app.key"
chmod 644 "$SSL_DIR/smartaihub.app.crt"

echo ""
echo "SSL certificates generated successfully!"
echo "  Certificate: $SSL_DIR/smartaihub.app.crt"
echo "  Private Key: $SSL_DIR/smartaihub.app.key"
echo ""
echo "Domains covered (SAN):"
echo "  - $DOMAIN"
echo "  - smartspec.local"
echo "  - smartspec.pro"
echo "  - smartaihub.app"
echo "  - docker.smartaihub.app"
echo "  - docker.smartspec.local"
echo "  - docker.smartspec.pro"
echo "  - localhost"
echo ""
echo "To enable HTTPS:"
echo "  1. Uncomment port 443 in docker-compose.nginx.yml"
echo "  2. Restart nginx: docker-compose -f docker-compose.nginx.yml restart nginx"
