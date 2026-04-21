#!/bin/bash

# InkFrame Frontend Setup Script

echo "🎯 InkFrame Frontend Setup"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Prepare Nuxt
echo "🔧 Preparing Nuxt..."
npm run postinstall

# Start development server
echo "🚀 Starting development server..."
npm run dev
