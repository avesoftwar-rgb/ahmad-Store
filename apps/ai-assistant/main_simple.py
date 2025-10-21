"""
Simplified AI Assistant Service for Render Deployment
This is a lightweight version without heavy ML dependencies for testing
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import uvicorn
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# ==================== KNOWLEDGE BASE ====================
KNOWLEDGE_BASE = [
    {
        "id": "doc1",
        "title": "Shoplite Registration",
        "content": "To register on Shoplite, buyers provide name, email, and password. Email verification required within 24 hours. Sellers need business documents, tax ID, bank info. Verification takes 2-3 days."
    },
    {
        "id": "doc2", 
        "title": "Shoplite Returns",
        "content": "Returns accepted within 14 days if unused with original packaging. Digital downloads and personalized items non-returnable. Refunds processed in 5-7 days to original payment method."
    },
    {
        "id": "doc3",
        "title": "Shoplite Shipping",
        "content": "We offer Standard (5-7 days, $5.99), Express (2-3 days, $12.99), and Overnight ($24.99) shipping. Free shipping on orders over $50."
    },
    {
        "id": "doc4",
        "title": "Shoplite Payment",
        "content": "We accept all major credit cards, PayPal, and Apple Pay. All transactions are encrypted and secure. Payment is processed at checkout and charged when order ships."
    },
    {
        "id": "doc5",
        "title": "Shoplite Customer Support",
        "content": "Our support team is available 24/7 via chat, email, and phone. Average response time is under 2 hours. We also have a comprehensive FAQ section and video tutorials."
    }
]

# ==================== SIMPLE RESPONSE FUNCTIONS ====================
def simple_retrieve_documents(query: str, top_k: int = 3):
    """Simple keyword-based document retrieval"""
    query_lower = query.lower()
    results = []
    
    for doc in KNOWLEDGE_BASE:
        score = 0
        content_lower = doc["content"].lower()
        title_lower = doc["title"].lower()
        
        # Simple keyword matching
        for word in query_lower.split():
            if word in content_lower:
                score += 2
            if word in title_lower:
                score += 3
        
        if score > 0:
            results.append({
                "doc": doc,
                "score": score
            })
    
    # Sort by score and return top_k
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]

def generate_simple_response(query: str) -> Dict[str, Any]:
    """Generate a simple response without ML"""
    try:
        # Retrieve documents
        retrieved_docs = simple_retrieve_documents(query, top_k=2)
        
        if not retrieved_docs:
            return {
                "answer": "I couldn't find specific information about this in our knowledge base. Please contact our customer service team for more details.",
                "sources": [],
                "confidence": "low"
            }
        
        # Build context
        context = "\n".join([d['doc']['content'] for d in retrieved_docs])
        sources = [d['doc']['title'] for d in retrieved_docs]
        
        # Simple response generation
        if "shipping" in query.lower():
            answer = f"Based on our shipping information: {context}"
        elif "return" in query.lower():
            answer = f"Here's our return policy: {context}"
        elif "payment" in query.lower():
            answer = f"Payment information: {context}"
        elif "support" in query.lower():
            answer = f"Customer support details: {context}"
        else:
            answer = f"Here's what I found: {context}"
        
        # Confidence based on score
        max_score = max(d['score'] for d in retrieved_docs)
        confidence = "high" if max_score >= 5 else "medium" if max_score >= 2 else "low"
        
        return {
            "answer": answer.strip(),
            "sources": sources,
            "confidence": confidence
        }
    except Exception as e:
        print(f"Error in simple response: {e}")
        return {
            "answer": "I apologize, but I'm having trouble processing your request right now. Please try again later.",
            "sources": [],
            "confidence": "low"
        }

def generate_simple_text(prompt: str, max_tokens: int = 200) -> str:
    """Simple text generation without ML"""
    # Simple rule-based responses
    if "hello" in prompt.lower():
        return "Hello! How can I help you with your Shoplite experience today?"
    elif "help" in prompt.lower():
        return "I'm here to help! You can ask me about shipping, returns, payments, or any other Shoplite-related questions."
    elif "thank" in prompt.lower():
        return "You're welcome! Is there anything else I can help you with?"
    else:
        return "I'm a simple AI assistant for Shoplite. I can help with basic questions about our services, shipping, returns, and payments. How can I assist you today?"

# ==================== FASTAPI SETUP ====================
app = FastAPI(
    title="Shoplite AI Assistant API (Simple)", 
    version="1.0",
    description="Simple AI-powered customer support assistant"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request models
class ChatRequest(BaseModel):
    question: str

class GenerateRequest(BaseModel):
    prompt: str
    max_tokens: Optional[int] = 200
    temperature: Optional[float] = 0.7

# Endpoints
@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Shoplite AI Assistant (Simple)",
        "model": "rule-based",
        "device": "cpu",
        "endpoints": ["/chat", "/generate", "/health"],
        "version": "1.0"
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model": "rule-based",
        "device": "cpu",
        "rag_available": True,
        "knowledge_base_size": len(KNOWLEDGE_BASE)
    }

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """Simple chat endpoint for customer support"""
    try:
        result = generate_simple_response(request.question)
        return result
    except Exception as e:
        print(f"Chat endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate")
async def generate_endpoint(request: GenerateRequest):
    """Simple text generation endpoint"""
    try:
        text = generate_simple_text(
            request.prompt,
            request.max_tokens
        )
        return {"text": text}
    except Exception as e:
        print(f"Generate endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SERVER STARTUP ====================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"\n{'='*50}")
    print("Starting Simple AI Assistant API...")
    print(f"Model: rule-based")
    print(f"Device: cpu")
    print(f"Port: {port}")
    print(f"{'='*50}")
    
    uvicorn.run(app, host="0.0.0.0", port=port)