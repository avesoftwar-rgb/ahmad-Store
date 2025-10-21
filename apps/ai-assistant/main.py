"""
AI Assistant Service for Render Deployment
This service provides both /chat (RAG) and /generate (simple) endpoints
Optimized for Render's free tier with CPU-only inference
"""

import os
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from sentence_transformers import SentenceTransformer
import faiss
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import uvicorn
import re
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Check device availability
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

# ==================== CONFIGURATION ====================
LLM_MODEL = "microsoft/phi-2"  # Lightweight model for free tier
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
MAX_TOKENS_LIMIT = 500

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

# ==================== MODEL LOADING ====================
print(f"Loading LLM: {LLM_MODEL}")

# Load tokenizer
tokenizer = AutoTokenizer.from_pretrained(LLM_MODEL)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# Load model with CPU optimization for Render free tier
try:
    if device == "cuda":
        # Use quantization for GPU if available
        from transformers import BitsAndBytesConfig
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16
        )
        model = AutoModelForCausalLM.from_pretrained(
            LLM_MODEL,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True
        )
        print("✅ LLM loaded with quantization")
    else:
        # CPU-only loading for Render free tier
        model = AutoModelForCausalLM.from_pretrained(
            LLM_MODEL,
            torch_dtype=torch.float32,
            device_map="cpu",
            trust_remote_code=True
        )
        print("✅ LLM loaded for CPU inference")
except Exception as e:
    print(f"Error loading model: {e}")
    # Fallback to a smaller model if phi-2 fails
    LLM_MODEL = "distilgpt2"
    model = AutoModelForCausalLM.from_pretrained(LLM_MODEL)
    tokenizer = AutoTokenizer.from_pretrained(LLM_MODEL)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    print(f"✅ Fallback model loaded: {LLM_MODEL}")

# ==================== RAG SETUP ====================
print("Setting up RAG system...")
try:
    embedder = SentenceTransformer(EMBEDDING_MODEL)
    
    # Create embeddings
    docs_text = [doc["content"] for doc in KNOWLEDGE_BASE]
    doc_embeddings = embedder.encode(docs_text, convert_to_tensor=True)
    
    # Build FAISS index
    embedding_dim = doc_embeddings.shape[1]
    index = faiss.IndexFlatL2(embedding_dim)
    index.add(doc_embeddings.cpu().detach().numpy())
    print(f"✅ FAISS index built with {index.ntotal} vectors")
except Exception as e:
    print(f"Error setting up RAG: {e}")
    embedder = None
    index = None

# ==================== GENERATION FUNCTIONS ====================
def retrieve_documents(query: str, top_k: int = 3, threshold: float = 1.5):
    """Retrieve relevant documents for a query"""
    if not embedder or not index:
        return []
    
    try:
        query_embedding = embedder.encode([query], convert_to_tensor=True)
        distances, indices = index.search(query_embedding.cpu().detach().numpy(), top_k)
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if dist <= threshold:
                results.append({
                    "doc": KNOWLEDGE_BASE[idx],
                    "distance": float(dist)
                })
        return results
    except Exception as e:
        print(f"Error retrieving documents: {e}")
        return []

def generate_text(prompt: str, max_tokens: int = 200, temperature: float = 0.7) -> str:
    """
    Simple text generation without RAG.
    Used by /generate endpoint for Week 5.
    """
    try:
        # Tokenize
        inputs = tokenizer(
            prompt, 
            return_tensors="pt", 
            truncation=True, 
            max_length=1024
        )
        
        # Move to device
        if device == "cuda":
            inputs = {k: v.cuda() for k, v in inputs.items()}
        
        # Generate
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=min(max_tokens, MAX_TOKENS_LIMIT),
                temperature=temperature,
                do_sample=temperature > 0,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id
            )
        
        # Decode
        response = tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Remove input prompt
        if response.startswith(prompt):
            response = response[len(prompt):].strip()
        
        return response
    
    except Exception as e:
        print(f"Error generating text: {e}")
        return f"I apologize, but I'm having trouble generating a response right now. Please try again later."

def generate_rag_response(query: str) -> Dict[str, Any]:
    """
    RAG-based generation for Week 3 /chat endpoint.
    """
    try:
        # Retrieve documents
        retrieved_docs = retrieve_documents(query, top_k=2, threshold=1.5)
        
        if not retrieved_docs:
            return {
                "answer": "I couldn't find specific information about this in our knowledge base. Please contact our customer service team for more details.",
                "sources": [],
                "confidence": "low"
            }
        
        # Build context
        context = "\n".join([d['doc']['content'] for d in retrieved_docs])
        sources = [d['doc']['title'] for d in retrieved_docs]
        
        # Build prompt
        prompt = f"""You are a helpful Shoplite customer support assistant. Answer the customer's question based on the provided context. Be friendly, professional, and helpful.

Context: {context}

Customer Question: {query}

Answer:"""
        
        # Generate
        answer = generate_text(prompt, max_tokens=150, temperature=0.3)
        
        # Confidence
        min_dist = min(r['distance'] for r in retrieved_docs)
        confidence = "high" if min_dist < 0.5 else "medium" if min_dist < 1.0 else "low"
        
        return {
            "answer": answer.strip(),
            "sources": sources,
            "confidence": confidence
        }
    except Exception as e:
        print(f"Error in RAG response: {e}")
        return {
            "answer": "I apologize, but I'm having trouble processing your request right now. Please try again later.",
            "sources": [],
            "confidence": "low"
        }

# ==================== FASTAPI SETUP ====================
app = FastAPI(
    title="Shoplite AI Assistant API", 
    version="2.0",
    description="AI-powered customer support assistant with RAG capabilities"
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
        "service": "Shoplite AI Assistant",
        "model": LLM_MODEL,
        "device": device,
        "endpoints": ["/chat", "/generate", "/health"],
        "version": "2.0"
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "llm_model": LLM_MODEL,
        "device": device,
        "rag_available": embedder is not None and index is not None,
        "knowledge_base_size": len(KNOWLEDGE_BASE)
    }

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """RAG-based chat endpoint for customer support"""
    try:
        result = generate_rag_response(request.question)
        return result
    except Exception as e:
        print(f"Chat endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate")
async def generate_endpoint(request: GenerateRequest):
    """Simple text generation endpoint"""
    try:
        text = generate_text(
            request.prompt,
            request.max_tokens,
            request.temperature
        )
        return {"text": text}
    except Exception as e:
        print(f"Generate endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SERVER STARTUP ====================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"\n{'='*50}")
    print("Starting AI Assistant API...")
    print(f"Model: {LLM_MODEL}")
    print(f"Device: {device}")
    print(f"Port: {port}")
    print(f"{'='*50}")
    
    uvicorn.run(app, host="0.0.0.0", port=port)