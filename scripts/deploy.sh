#!/bin/bash
# MIRKO V3.5 Deployment Script
# Placeholder implementation

echo "════════════════════════════════════════"
echo "  MIRKO V3.5 Deployment"
echo "════════════════════════════════════════"
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt "16" ]; then
  echo "❌ Node.js 16 or higher required"
  exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm ci

if [ $? -ne 0 ]; then
  echo "❌ Failed to install dependencies"
  exit 1
fi

echo "✅ Dependencies installed"

# Run tests
echo ""
echo "Running tests..."
npm test

if [ $? -ne 0 ]; then
  echo "❌ Tests failed"
  exit 1
fi

echo "✅ Tests passed"

# Check environment
echo ""
echo "Checking environment..."

if [ ! -f "config/.env.example" ]; then
  echo "❌ config/.env.example not found"
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "⚠️  .env file not found. Copy config/.env.example to .env and configure"
fi

echo "✅ Environment check complete"

echo ""
echo "════════════════════════════════════════"
echo "  Deployment Ready"
echo "════════════════════════════════════════"
echo ""
echo "Start the server:"
echo "  npm start"
echo ""
echo "Start the screener:"
echo "  npm run screener"
echo ""
