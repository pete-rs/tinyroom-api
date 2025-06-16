#!/bin/bash

# Create a directory for certificates
mkdir -p certs

# Generate a self-signed certificate for local development
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"

echo "Self-signed certificate generated in certs/ directory"
echo "Add the following to your .env file:"
echo ""
echo "HTTPS_ENABLED=true"
echo "HTTPS_KEY_PATH=certs/key.pem"
echo "HTTPS_CERT_PATH=certs/cert.pem"