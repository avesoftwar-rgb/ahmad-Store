import os, re, time, json, requests
from typing import List, Dict, Any, Optional, Tuple, Set
import numpy as np
import faiss
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

# ===================== Config =====================
HF_TOKEN = os.getenv("HF_TOKEN", "").strip()
REMOTE_MODEL = os.getenv("REMOTE_MODEL", "mistralai/Mistral-7B-Instruct-v0.3")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-mpnet-base-v2")
MAX_TOKENS_LIMIT = int(os.getenv("MAX_TOKENS_LIMIT", "640"))
BACKEND_URL = os.getenv("BACKEND_URL", "").strip()
SERVICE_NAME = os.getenv("SERVICE_NAME", "ahmad-store-llm")

SYSTEM_EN = ("You are a helpful retail assistant. Think internally but output only the final answer. "
             "If context is insufficient, first ask ONE concise clarifying question, then propose up to 3 next actions.")
SYSTEM_AR = ("أنت مساعد متجر ذكي. فكّر داخلياً وقدّم الإجابة النهائية فقط. "
             "إذا كان السياق غير كافٍ، اطرح سؤالاً توضيحياً واحداً ثم اقترح حتى 3 خطوات عملية.")

def detect_lang(text: str) -> str:
    return "ar" if re.search(r"[\u0600-\u06FF]", text or "") else "en"

# ===================== Knowledge Base =====================
def load_kb() -> List[Dict[str, str]]:
    # Try docs/ground-truth.json at repo root
    candidates = [
        os.path.join(os.path.dirname(__file__), "../../docs/ground-truth.json"),
        os.path.join(os.getcwd(), "docs/ground-truth.json"),
    ]
    for p in candidates:
        try:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                # expect list of objects with id, answer (en), category ...
                kb = []
                for d in data:
                    kb.append({
                        "id": d.get("id") or "Doc",
                        "title": d.get("question") or d.get("id") or "Doc",
                        "content_en": d.get("answer") or "",
                        "content_ar": d.get("answer_ar") or ""
                    })
                if kb:
                    return kb
        except Exception:
            pass
    # Fallback small KB
    return [
        {"id":"Policy3.1","title":"Returns / الإرجاع","content_en":"Items may be returned within 30 days with receipt. Refund in 5–7 business days.","content_ar":"الإرجاع خلال 30 يوماً مع إيصال الشراء. تُعاد الأموال خلال 5–7 أيام عمل."},
        {"id":"Shipping2.1","title":"Shipping / الشحن","content_en":"Standard (5–7d), Express (2–3d), Overnight. Free shipping > $50.","content_ar":"عادي 5–7 أيام، سريع 2–3 أيام، مستعجل. شحن مجاني للطلبات فوق 50$."},
        {"id":"Order1.1","title":"Order Tracking / تتبّع الطلب","content_en":"Statuses: Pending → Processing → Shipped → Delivered. Use order ID.","content_ar":"حالات الطلب: Pending → Processing → Shipped → Delivered. استخدم رقم الطلب."},
    ]

KB: List[Dict[str, str]] = load_kb()

def pick(doc: Dict[str, str], lang: str) -> str:
    if lang == "ar":
        return doc.get("content_ar") or doc.get("content_en") or ""
    return doc.get("content_en") or doc.get("content_ar") or ""

# ===================== Embeddings + FAISS (Cosine) =====================
def _l2(a: np.ndarray) -> np.ndarray:
    return a / (np.linalg.norm(a, axis=1, keepdims=True) + 1e-12)

EMBED = SentenceTransformer(EMBEDDING_MODEL)

def build_index(kb: List[Dict[str, str]]):
    texts = [(d.get("content_en") or d.get("content_ar") or "") for d in kb]
    vecs = EMBED.encode(texts, convert_to_numpy=True).astype(np.float32)
    vecs = _l2(vecs)
    idx = faiss.IndexFlatIP(vecs.shape[1])
    idx.add(vecs)
    return idx

INDEX = build_index(KB)

def retrieve(query: str, top_k: int, threshold: float = 0.25):
    if not query.strip():
        return []
    q = EMBED.encode([query], convert_to_numpy=True).astype(np.float32)
    q = _l2(q)
    scores, ids = INDEX.search(q, top_k)
    out = []
    for s, i in zip(scores[0], ids[0]):
        if i >= 0 and s >= threshold:
            out.append({"doc": KB[i], "score": float(s)})
    return out

# ===================== Query Expansion =====================
SYN = {
    "en": {"return":["return","refund","exchange"], "shipping":["shipping","delivery"], "track":["track","status"]},
    "ar": {"return":["إرجاع","استرجاع","استبدال"], "shipping":["شحن","توصيل"], "track":["تتبّع","حالة"]}
}

def expand_query(q: str, lang: str) -> List[str]:
    ql = (q or "").lower().strip(); exp: Set[str] = {q}
    for words in SYN[lang].values():
        if any(w in ql for w in words):
            exp |= set(words)
    if lang == "ar":
        exp |= {"return policy", "shipping options", "order tracking"}
    else:
        exp |= {"سياسة الإرجاع", "خيارات الشحن", "تتبّع الطلب"}
    return list(exp)[:12]

def smart_retrieve(q: str, lang: str, top_k: int = 5):
    hits = retrieve(q, top_k)
    if hits:
        return sorted(hits, key=lambda d: d["score"], reverse=True)
    merged = {}
    for v in expand_query(q, lang):
        for h in retrieve(v, top_k):
            did = h["doc"]["id"]
            if did not in merged or h["score"] > merged[did]["score"]:
                merged[did] = h
    return sorted(merged.values(), key=lambda d: d["score"], reverse=True)

# ===================== HF Inference API =====================
def hf_gen(model_id: str, prompt: str, system_prompt: str, max_new_tokens: int, temperature: float) -> str:
    if not HF_TOKEN:
        return ""
    url = f"https://api-inference.huggingface.co/models/{model_id}"
    headers = {"Content-Type":"application/json","Authorization":f"Bearer {HF_TOKEN}"}
    payload = {"inputs": f"{system_prompt.strip()}\n\nUser: {prompt.strip()}\n\nAssistant:",
               "parameters": {"max_new_tokens": int(max_new_tokens), "temperature": float(temperature), "top_p": 0.9, "repetition_penalty": 1.05}}
    for i in range(3):
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=120)
            data = r.json()
            if isinstance(data, list) and data and isinstance(data[0], dict):
                return (data[0].get("generated_text") or data[0].get("text") or "").strip()
            time.sleep(1.2 * (i + 1))
        except Exception:
            time.sleep(1.2 * (i + 1))
    return ""

def generate_final(prompt: str, system_prompt: str, max_tokens: int, temperature: float) -> str:
    txt = hf_gen(REMOTE_MODEL, prompt, system_prompt, max_tokens, temperature)
    return txt or "Model unavailable."

# ===================== Optional Backend Enrichment =====================
def safe_get(base, path, params=None):
    try:
        url = base.rstrip("/") + path
        r = requests.get(url, params=params or {}, timeout=20)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return None

def enrich_db(question: str) -> List[str]:
    if not BACKEND_URL:
        return []
    ql = (question or "").lower()
    lines = []
    if "order" in ql or "طلب" in ql:
        m = re.search(r"([0-9a-f]{24}|\d{6,})", ql)
        if m:
            od = safe_get(BACKEND_URL, f"/api/orders/{m.group(1)}") or {}
            if od:
                lines.append(f"- [DB:order] id={od.get('_id') or od.get('id')} status={od.get('status')} eta={od.get('estimatedDelivery')}")
    if any(k in ql for k in ["product","search","item","منتج","بحث"]):
        pr = safe_get(BACKEND_URL, "/api/products", {"search": question, "limit": 5}) or {}
        items = (pr.get("products") or pr) if isinstance(pr, dict) else pr
        if isinstance(items, list):
            for p in items[:5]:
                lines.append(f"- [DB:product] {p.get('name') or p.get('title')} price={p.get('price')} stock={p.get('stock') or p.get('stockQty')}")
    return lines

# ===================== FastAPI =====================
app = FastAPI(title="Store LLM API", version="1.0")

class ChatReq(BaseModel):
    question: str
    top_k: int = 5
    max_tokens: int = 256
    temperature: float = 0.2

class GenReq(BaseModel):
    prompt: str
    max_tokens: int = 256
    temperature: float = 0.2

@app.get("/health")
def health():
    return {"service": SERVICE_NAME, "status": "healthy", "model": REMOTE_MODEL, "kb": len(KB)}

@app.post("/generate")
def generate(req: GenReq):
    lang = detect_lang(req.prompt or "")
    sys = SYSTEM_AR if lang == "ar" else SYSTEM_EN
    txt = generate_final(req.prompt, sys, min(req.max_tokens, MAX_TOKENS_LIMIT), req.temperature)
    return {"text": txt}

@app.post("/chat")
def chat(req: ChatReq):
    q = (req.question or "").strip()
    if not q:
        raise HTTPException(400, "question required")
    lang = detect_lang(q)
    hits = smart_retrieve(q, lang, top_k=int(req.top_k))
    if not hits:
        if lang == "ar":
            return {"answer": "المعلومة غير كافية. هل يمكنك التحديد أكثر؟", "sources": [], "confidence": "low"}
        return {"answer": "Insufficient context. Could you specify more precisely?", "sources": [], "confidence": "low"}
    kb_lines = [f"- [{h['doc']['id']}] {h['doc']['title']}: {pick(h['doc'], lang)}" for h in hits]
    db_lines = enrich_db(q)
    ctx = "\n".join(kb_lines + (["[Database]"] + db_lines if db_lines else []))
    sys = SYSTEM_AR if lang == "ar" else SYSTEM_EN
    prompt = f"{ctx}\n\nQuestion: {q}\nAnswer:"
    ans = generate_final(prompt, sys, min(req.max_tokens, MAX_TOKENS_LIMIT), req.temperature)
    conf = "high" if hits[0]["score"] >= 0.6 else ("medium" if hits[0]["score"] >= 0.4 else "low")
    return {"answer": ans, "sources": [h['doc']['id'] for h in hits[:3]], "confidence": conf, "db_used": bool(db_lines)}


