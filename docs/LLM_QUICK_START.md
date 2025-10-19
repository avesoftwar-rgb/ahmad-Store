# 🚀 LLM Quick Start Guide for Week 5

## Overview
This guide gets your LLM deployed on Google Colab in **10 minutes** with both RAG (Week 3) and simple generation (Week 5) endpoints.

---

## Step 1: Setup Colab (3 minutes)

1. **Open Google Colab**: https://colab.research.google.com
2. **Create new notebook**
3. **Enable GPU** (optional but recommended):
   - Runtime → Change runtime type → Hardware accelerator → T4 GPU

## Step 2: Run the Deployment Script (5 minutes)

### Copy and paste these cells into your Colab notebook:

#### Cell 1: Install Dependencies
```python
!pip install -q transformers torch sentence-transformers faiss-cpu
!pip install -q fastapi uvicorn pyngrok nest-asyncio
!pip install -q accelerate bitsandbytes
print("✅ Dependencies installed")
```

#### Cell 2: Complete Deployment Script
```python
# Import everything
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from sentence_transformers import SentenceTransformer
import faiss
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from pyngrok import ngrok, conf
import nest_asyncio
import uvicorn
import threading
import time
from typing import Optional

nest_asyncio.apply()

# === Configuration ===
LLM_MODEL = "microsoft/phi-2"  # Small model for free tier
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# === Knowledge Base (simplified for demo) ===
KNOWLEDGE_BASE = [
    {"id": "P1", "content": "Returns accepted within 30 days with receipt."},
    {"id": "P2", "content": "Free shipping on orders over $50."},
    {"id": "P3", "content": "We accept credit cards, PayPal, and Apple Pay."}
]

print(f"Loading {LLM_MODEL}...")

# === Load Models ===
tokenizer = AutoTokenizer.from_pretrained(LLM_MODEL)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    LLM_MODEL,
    device_map="auto",
    trust_remote_code=True,
    torch_dtype=torch.float16
)
print("✅ LLM loaded")

# === RAG Setup ===
embedder = SentenceTransformer(EMBEDDING_MODEL)
docs = [d["content"] for d in KNOWLEDGE_BASE]
embeddings = embedder.encode(docs)
index = faiss.IndexFlatL2(embeddings.shape[1])
index.add(embeddings)
print("✅ RAG system ready")

# === Generation Functions ===
def generate_text(prompt, max_tokens=200):
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512)
    outputs = model.generate(**inputs, max_new_tokens=max_tokens, temperature=0.7)
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    if response.startswith(prompt):
        response = response[len(prompt):].strip()
    return response

def rag_search(query):
    query_emb = embedder.encode([query])
    D, I = index.search(query_emb, 2)
    context = "\n".join([KNOWLEDGE_BASE[i]["content"] for i in I[0]])
    prompt = f"Context: {context}\n\nQuestion: {query}\nAnswer:"
    answer = generate_text(prompt, 100)
    return {"answer": answer, "sources": [KNOWLEDGE_BASE[i]["id"] for i in I[0]]}

# === FastAPI App ===
app = FastAPI(title="Week5 LLM API")

class ChatRequest(BaseModel):
    question: str

class GenerateRequest(BaseModel):
    prompt: str
    max_tokens: Optional[int] = 200

@app.get("/")
def root():
    return {"status": "online", "model": LLM_MODEL}

@app.post("/chat")
def chat(req: ChatRequest):
    return rag_search(req.question)

@app.post("/generate")
def generate(req: GenerateRequest):
    return {"text": generate_text(req.prompt, req.max_tokens)}

# === Start Server ===
def run():
    uvicorn.run(app, host="0.0.0.0", port=8000)

thread = threading.Thread(target=run, daemon=True)
thread.start()
time.sleep(2)
print("✅ Server started")

# === Setup Ngrok ===
print("\n" + "="*50)
print("Get your ngrok token from: https://dashboard.ngrok.com/auth")
print("="*50)
token = input("Paste ngrok token here: ")

if token:
    conf.get_default().auth_token = token
    url = ngrok.connect(8000).public_url
    print("\n" + "🎉"*20)
    print(f"✅ YOUR LLM IS LIVE AT: {url}")
    print(f"📚 API Docs: {url}/docs")
    print("\n🔥 Add to your backend .env:")
    print(f"LLM_API_URL={url}")
    print("🎉"*20)
else:
    print("⚠️ No token - API only available locally")

# Keep running
while True:
    time.sleep(1)
```

## Step 3: Get Your Ngrok Token (1 minute)

1. Go to https://ngrok.com and sign up (free)
2. Get token from https://dashboard.ngrok.com/auth
3. Copy and paste when prompted

## Step 4: Test Your API (1 minute)

Once deployed, test in a new browser tab:

```
YOUR_URL/docs
```

Or test with curl:

```bash
# Test generation
curl -X POST YOUR_URL/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, I am", "max_tokens": 50}'

# Test RAG
curl -X POST YOUR_URL/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is your return policy?"}'
```

---

## Integration with Your Backend

### 1. Add to `.env`:
```
LLM_API_URL=https://your-ngrok-url.ngrok.io
```

### 2. Simple Node.js Integration:
```javascript
const axios = require('axios');

class LLMService {
  constructor() {
    this.url = process.env.LLM_API_URL;
  }

  async generate(prompt, maxTokens = 200) {
    const { data } = await axios.post(`${this.url}/generate`, {
      prompt,
      max_tokens: maxTokens
    });
    return data.text;
  }

  async chat(question) {
    const { data } = await axios.post(`${this.url}/chat`, {
      question
    });
    return data;
  }
}

// Usage
const llm = new LLMService();
const response = await llm.generate("Customer asks: How do I track my order? Assistant:");
console.log(response);
```

---

## Troubleshooting

### "Out of memory" error
- Use smaller model: Change to `"google/flan-t5-small"`
- Reduce max_tokens
- Restart runtime: Runtime → Restart runtime

### Colab disconnects
- Click "Reconnect" and re-run cells
- Consider Colab Pro for longer sessions

### Slow responses
- Normal for free tier (5-10 seconds per request)
- Reduce max_tokens for faster responses
- Use caching for common queries

---

## Alternative Models (by resource availability)

**Very Low Memory (2GB)**:
```python
LLM_MODEL = "google/flan-t5-small"  # 80M params
```

**Low Memory (4GB)**:
```python
LLM_MODEL = "microsoft/phi-2"  # 2.7B params (current)
```

**Medium Memory (8GB)**:
```python
LLM_MODEL = "mistralai/Mistral-7B-Instruct-v0.1"  # 7B params
```

---

## Important Notes

1. **Colab Free Tier Limits**:
   - Sessions timeout after ~12 hours
   - GPU availability varies
   - May disconnect if idle

2. **Production Considerations**:
   - Ngrok URLs change on restart
   - Use environment variables for URL
   - Implement retry logic in backend
   - Cache frequent responses

3. **Cost-Free Operation**:
   - Everything uses free tiers
   - No credit card required
   - Suitable for development/testing

---

## Next Steps

✅ LLM deployed on Colab  
✅ Both /chat and /generate endpoints working  
✅ Ngrok URL obtained  
✅ Backend integration ready  

Now integrate with your Week 5 assistant to handle:
- Intent classification
- Policy grounding
- Function calling
- Response generation

---

## Quick Commands Reference

```bash
# Check if LLM is up
curl YOUR_URL/

# Test generation
curl -X POST YOUR_URL/generate -H "Content-Type: application/json" \
  -d '{"prompt": "List 3 benefits of online shopping:", "max_tokens": 100}'

# Test RAG
curl -X POST YOUR_URL/chat -H "Content-Type: application/json" \
  -d '{"question": "How can I return an item?"}'
```

---

**Time to Complete: ~10 minutes** ⏱️

**Support**: If stuck, the fallback responses in your backend will handle LLM unavailability gracefully.
