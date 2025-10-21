#!/bin/bash

echo "🚀 AI Assistant Deployment Script"
echo "================================="

# Check if we're in the right directory
if [ ! -f "render.yaml" ]; then
    echo "❌ Error: render.yaml not found. Please run this script from the project root."
    exit 1
fi

echo "📋 Deployment Checklist:"
echo "1. ✅ AI Assistant service created (apps/ai-assistant/)"
echo "2. ✅ Backend integration updated"
echo "3. ✅ render.yaml configured for both services"
echo "4. ✅ Dependencies installed"

echo ""
echo "🔧 Next Steps:"
echo "1. Push changes to GitHub:"
echo "   git add ."
echo "   git commit -m 'Add AI Assistant integration'"
echo "   git push origin main"

echo ""
echo "2. Deploy on Render:"
echo "   - Go to https://render.com"
echo "   - Create new Web Service for AI Assistant"
echo "   - Use these settings:"
echo "     * Name: shopmart-ai-assistant"
echo "     * Environment: Python"
echo "     * Root Directory: apps/ai-assistant"
echo "     * Build Command: pip install -r requirements.txt"
echo "     * Start Command: python main.py"

echo ""
echo "3. Update Backend Environment Variables:"
echo "   - Add AI_ASSISTANT_URL=https://shopmart-ai-assistant.onrender.com"
echo "   - Redeploy backend service"

echo ""
echo "4. Test the integration:"
echo "   export BACKEND_URL=https://shopmart-api.onrender.com"
echo "   export AI_ASSISTANT_URL=https://shopmart-ai-assistant.onrender.com"
echo "   node test-ai-integration.js"

echo ""
echo "📚 For detailed instructions, see: AI_ASSISTANT_DEPLOYMENT.md"
echo ""
echo "🎉 Ready to deploy your AI Assistant!"