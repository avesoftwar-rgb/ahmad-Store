#!/bin/bash

# AI Assistant Deployment Script for Render
# This script prepares and deploys the AI assistant service

echo "🚀 Starting AI Assistant Deployment Process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "render.yaml" ]; then
    print_error "render.yaml not found. Please run this script from the project root."
    exit 1
fi

# Check if AI assistant directory exists
if [ ! -d "apps/ai-assistant" ]; then
    print_error "AI assistant directory not found at apps/ai-assistant"
    exit 1
fi

print_status "✅ Project structure verified"

# Check Python version
python_version=$(python3 --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1,2)
if [ "$python_version" != "3.11" ]; then
    print_warning "Python version is $python_version. Recommended: 3.11"
fi

# Test AI assistant locally
print_status "Testing AI assistant locally..."

cd apps/ai-assistant

# Install dependencies
print_status "Installing dependencies..."
pip install -r requirements.txt

if [ $? -ne 0 ]; then
    print_error "Failed to install dependencies"
    exit 1
fi

# Test the AI assistant
print_status "Testing AI assistant startup..."
timeout 30s python main.py &
AI_PID=$!

# Wait a bit for startup
sleep 10

# Check if the process is still running
if ps -p $AI_PID > /dev/null; then
    print_status "✅ AI assistant started successfully"
    kill $AI_PID
else
    print_error "AI assistant failed to start"
    exit 1
fi

cd ../..

print_status "✅ Local test completed successfully"

# Check git status
print_status "Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
    print_warning "You have uncommitted changes. Committing them now..."
    git add .
    git commit -m "Prepare AI assistant for Render deployment"
fi

# Push to GitHub
print_status "Pushing to GitHub..."
git push origin main

if [ $? -ne 0 ]; then
    print_error "Failed to push to GitHub"
    exit 1
fi

print_status "✅ Code pushed to GitHub successfully"

echo ""
echo "🎉 AI Assistant is ready for Render deployment!"
echo ""
echo "Next steps:"
echo "1. Go to https://dashboard.render.com"
echo "2. Create a new Web Service"
echo "3. Connect your GitHub repository"
echo "4. Use the following settings:"
echo "   - Name: shopmart-ai-assistant"
echo "   - Environment: Python"
echo "   - Region: Frankfurt (EU Central)"
echo "   - Root Directory: apps/ai-assistant"
echo "   - Build Command: pip install --upgrade pip && pip install -r requirements.txt"
echo "   - Start Command: python main.py"
echo "   - Health Check Path: /health"
echo ""
echo "5. Add environment variables:"
echo "   - PORT: 8000"
echo "   - PYTHON_VERSION: 3.11"
echo "   - PYTORCH_CUDA_ALLOC_CONF: max_split_size_mb:128"
echo ""
echo "6. Deploy!"
echo ""
echo "After deployment, your AI assistant will be available at:"
echo "https://shopmart-ai-assistant.onrender.com"
echo ""
echo "Test endpoints:"
echo "- Health: https://shopmart-ai-assistant.onrender.com/health"
echo "- Chat: https://shopmart-ai-assistant.onrender.com/chat"
echo "- Generate: https://shopmart-ai-assistant.onrender.com/generate"