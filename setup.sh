#!/bin/bash
# KuCoin Futures Dashboard V3.5.1 - Setup Script

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     KuCoin Futures Dashboard v3.5.1 Setup                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v16+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js v16+ required. Current version: $(node -v)"
    exit 1
fi
echo "✓ Node.js $(node -v) detected"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo "✓ Dependencies installed"

# Check for .env file
echo ""
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp .env.example .env
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║  IMPORTANT: Configure your API credentials in .env file      ║"
    echo "╠═══════════════════════════════════════════════════════════════╣"
    echo "║  1. Go to https://www.kucoin.com/account/api                  ║"
    echo "║  2. Create a new API key with trading permissions            ║"
    echo "║  3. Edit .env and add your credentials                       ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
else
    echo "✓ .env file exists"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  Setup Complete!                                              ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  To start the dashboard:                                      ║"
echo "║    npm start                                                  ║"
echo "║                                                               ║"
echo "║  Then open: http://localhost:3001                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
