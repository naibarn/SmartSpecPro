#!/bin/bash

# SSL Certificate Generation Script for SmartSpec Pro
# Generates self-signed SSL certificates for local HTTPS development

set -e

CERT_DIR="./nginx/ssl"
DOMAIN="smartspec.local"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}SmartSpec Pro SSL Setup${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Create SSL directory if it doesn't exist
if [ ! -d "$CERT_DIR" ]; then
    echo -e "${YELLOW}Creating SSL directory: $CERT_DIR${NC}"
    mkdir -p "$CERT_DIR"
fi

# Check if certificates already exist
if [ -f "$CERT_DIR/$DOMAIN.crt" ] && [ -f "$CERT_DIR/$DOMAIN.key" ]; then
    echo -e "${YELLOW}SSL certificates already exist!${NC}"
    read -p "Do you want to regenerate them? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}Using existing certificates.${NC}"
        exit 0
    fi
    echo -e "${YELLOW}Regenerating certificates...${NC}"
fi

echo -e "${GREEN}Generating SSL certificate for $DOMAIN and subdomains...${NC}"

# Generate OpenSSL config file with Subject Alternative Names (SAN)
cat > "$CERT_DIR/openssl.cnf" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=TH
ST=Bangkok
L=Bangkok
O=SmartSpec Development
OU=Development
CN=$DOMAIN

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = *.$DOMAIN
DNS.3 = localhost
DNS.4 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Generate private key
echo -e "${GREEN}Step 1/3: Generating private key...${NC}"
openssl genrsa -out "$CERT_DIR/$DOMAIN.key" 2048

# Generate certificate signing request (CSR)
echo -e "${GREEN}Step 2/3: Generating certificate signing request...${NC}"
openssl req -new \
    -key "$CERT_DIR/$DOMAIN.key" \
    -out "$CERT_DIR/$DOMAIN.csr" \
    -config "$CERT_DIR/openssl.cnf"

# Generate self-signed certificate (valid for 1 year)
echo -e "${GREEN}Step 3/3: Generating self-signed certificate...${NC}"
openssl x509 -req \
    -days 365 \
    -in "$CERT_DIR/$DOMAIN.csr" \
    -signkey "$CERT_DIR/$DOMAIN.key" \
    -out "$CERT_DIR/$DOMAIN.crt" \
    -extensions v3_req \
    -extfile "$CERT_DIR/openssl.cnf"

# Set proper permissions
chmod 600 "$CERT_DIR/$DOMAIN.key"
chmod 644 "$CERT_DIR/$DOMAIN.crt"

# Clean up CSR and config
rm "$CERT_DIR/$DOMAIN.csr"
rm "$CERT_DIR/openssl.cnf"

echo ""
echo -e "${GREEN}✓ SSL certificates generated successfully!${NC}"
echo ""
echo -e "${YELLOW}Certificate files:${NC}"
echo "  - Private Key: $CERT_DIR/$DOMAIN.key"
echo "  - Certificate:  $CERT_DIR/$DOMAIN.crt"
echo ""
echo -e "${YELLOW}Certificate covers the following domains:${NC}"
echo "  - $DOMAIN"
echo "  - *.$DOMAIN (all subdomains)"
echo "  - localhost"
echo "  - *.localhost"
echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Next Steps:${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "1. Update your hosts file:"
echo -e "   ${YELLOW}C:\\Windows\\System32\\drivers\\etc\\hosts${NC} (Windows)"
echo -e "   ${YELLOW}/etc/hosts${NC} (Linux/Mac)"
echo ""
echo "   Add these lines:"
echo -e "   ${YELLOW}127.0.0.1 smartspec.local${NC}"
echo -e "   ${YELLOW}127.0.0.1 docker.smartspec.local${NC}"
echo ""
echo "2. Trust the certificate in your browser:"
echo ""
echo "   ${YELLOW}Chrome/Edge:${NC}"
echo "   - Settings → Privacy and security → Security"
echo "   - Manage certificates → Trusted Root Certification Authorities"
echo "   - Import → Select: $CERT_DIR/$DOMAIN.crt"
echo ""
echo "   ${YELLOW}Firefox:${NC}"
echo "   - Settings → Privacy & Security → Certificates"
echo "   - View Certificates → Authorities → Import"
echo "   - Select: $CERT_DIR/$DOMAIN.crt"
echo ""
echo "3. Update nginx configuration (already included in ssl config)"
echo ""
echo "4. Restart services:"
echo -e "   ${YELLOW}docker-compose down && docker-compose up -d${NC}"
echo ""
echo "5. Access via HTTPS:"
echo -e "   ${YELLOW}https://smartspec.local${NC}"
echo -e "   ${YELLOW}https://docker.smartspec.local${NC}"
echo ""
echo -e "${GREEN}================================${NC}"
