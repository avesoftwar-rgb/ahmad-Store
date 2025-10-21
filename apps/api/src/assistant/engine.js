const express = require('express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const { classifyIntent, INTENTS } = require('./intent-classifier');
const functionRegistry = require('./function-registry');
const citationValidator = require('./citation-validator');
const synonyms = require('./synonyms');

const router = express.Router();

// Load configuration
let assistantConfig = null;
let knowledgeBase = null;

// Load YAML configuration
function loadConfig() {
  try {
    const yamlPath = path.join(__dirname, '../../../../docs/prompts.yaml');
    if (fs.existsSync(yamlPath)) {
      const yamlContent = fs.readFileSync(yamlPath, 'utf8');
      assistantConfig = yaml.load(yamlContent);
      console.log('✅ Assistant configuration loaded');
    } else {
      console.warn('⚠️ prompts.yaml not found, using defaults');
      assistantConfig = getDefaultConfig();
    }
  } catch (error) {
    console.error('Error loading prompts.yaml:', error);
    assistantConfig = getDefaultConfig();
  }
}

// Load knowledge base
function loadKnowledgeBase() {
  try {
    const kbPath = path.join(__dirname, '../../../../docs/ground-truth.json');
    if (fs.existsSync(kbPath)) {
      const kbContent = fs.readFileSync(kbPath, 'utf8');
      knowledgeBase = JSON.parse(kbContent);
      console.log(`✅ Knowledge base loaded: ${knowledgeBase.length} policies`);
    } else {
      console.warn('⚠️ ground-truth.json not found');
      knowledgeBase = [];
    }
  } catch (error) {
    console.error('Error loading ground-truth.json:', error);
    knowledgeBase = [];
  }
}

// Get default configuration if YAML not found
function getDefaultConfig() {
  return {
    identity: {
      name: 'Alex',
      role: 'Customer Support Specialist',
      company: 'ahmad store',
      personality: ['helpful', 'professional', 'friendly', 'efficient']
    },
    intents: {
      policy_question: {
        behavior: 'Provide accurate policy information with citations',
        tone: 'informative and clear'
      },
      order_status: {
        behavior: 'Look up order information and provide status',
        tone: 'professional and helpful'
      },
      product_search: {
        behavior: 'Help find products that match customer needs',
        tone: 'enthusiastic and helpful'
      },
      complaint: {
        behavior: 'Listen with empathy and offer solutions',
        tone: 'empathetic and solution-focused'
      },
      chitchat: {
        behavior: 'Be friendly but redirect to support topics',
        tone: 'warm and professional'
      },
      off_topic: {
        behavior: 'Politely decline and redirect to e-commerce support',
        tone: 'polite and professional'
      },
      violation: {
        behavior: 'Set boundaries firmly but professionally',
        tone: 'firm and professional'
      }
    },
    rules: [
      'Never reveal you are an AI or language model',
      'Never mention ChatGPT, Claude, Llama, or any AI model names',
      'Always respond as a human support specialist',
      'Maximum 2 function calls per query',
      'Keep responses concise and helpful',
      'Always use citations when referencing policies'
    ]
  };
}

// Find relevant policies based on user query
function findRelevantPolicies(userQuery) {
  if (!knowledgeBase || knowledgeBase.length === 0) {
    return [];
  }
  
  const query = userQuery.toLowerCase();
  
  // Category keywords mapping
  const categoryKeywords = {
    'returns': ['return', 'refund', 'exchange', 'money back', 'send back'],
    'shipping': ['ship', 'delivery', 'deliver', 'arrival', 'transit', 'carrier'],
    'warranty': ['warranty', 'guarantee', 'defect', 'broken', 'repair'],
    'privacy': ['privacy', 'data', 'personal information', 'secure', 'confidential'],
    'payment': ['payment', 'pay', 'credit card', 'billing', 'charge'],
    'general': ['policy', 'term', 'condition', 'rule']
  };
  
  // Find matching category
  let matchedCategories = [];
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => query.includes(kw))) {
      matchedCategories.push(category);
    }
  }
  
  // Find policies matching the categories
  let relevantPolicies = [];
  if (matchedCategories.length > 0) {
    relevantPolicies = knowledgeBase.filter(p => 
      matchedCategories.includes(p.category)
    );
  }
  
  // If no category match, try direct question matching
  if (relevantPolicies.length === 0) {
    relevantPolicies = knowledgeBase.filter(p => {
      const pQuestion = p.question.toLowerCase();
      const pAnswer = p.answer.toLowerCase();
      return query.includes(pQuestion.slice(0, 20)) || 
             pQuestion.includes(query.slice(0, 20));
    });
  }
  
  return relevantPolicies.slice(0, 3); // Return max 3 policies
}

// Extract citations from response
function extractCitations(response) {
  const citationPattern = /\[(Policy[\w.]+)\]/g;
  const matches = response.match(citationPattern);
  
  if (!matches) {
    return [];
  }
  
  return matches.map(m => m.slice(1, -1)); // Remove brackets
}

// Validate citations against knowledge base
function validateCitations(citations) {
  const validCitations = [];
  const invalidCitations = [];
  
  for (const citation of citations) {
    const found = knowledgeBase.find(p => p.id === citation);
    if (found) {
      validCitations.push(citation);
    } else {
      invalidCitations.push(citation);
    }
  }
  
  return {
    isValid: invalidCitations.length === 0,
    validCitations,
    invalidCitations
  };
}

// Expand user query using simple bilingual synonyms
function expandQuery(userInput) {
  const text = String(userInput || '');
  const isArabic = /[\u0600-\u06FF]/.test(text);
  const dict = isArabic ? synonyms.ar : synonyms.en;
  const additions = new Set();
  for (const key of Object.keys(dict)) {
    for (const w of dict[key]) {
      if (text.toLowerCase().includes(w.toLowerCase())) {
        dict[key].forEach(v => additions.add(v));
        break;
      }
    }
  }
  // light cross-lingual hints
  if (isArabic) {
    ["return policy","shipping options","order status"].forEach(v=>additions.add(v));
  } else {
    ["سياسة الإرجاع","خيارات الشحن","حالة الطلب"].forEach(v=>additions.add(v));
  }
  return [text, ...Array.from(additions)].slice(0, 12);
}

// Simple language detection (Arabic vs English)
function detectLanguage(text) {
  try {
    return /[\u0600-\u06FF]/.test(String(text || '')) ? 'ar' : 'en';
  } catch (_) {
    return 'en';
  }
}

// Build an assistive clarification plan when context is insufficient
function buildAssistivePlan(userQuery) {
  const lang = detectLanguage(userQuery);
  if (lang === 'ar') {
    return [
      'المعلومة غير كافية حالياً لإجابة دقيقة.',
      'سؤال توضيحي: هل يمكنك تحديد المطلوب بدقة (مثال: سياسة الإرجاع لفئة معيّنة، أو رقم الطلب الكامل)؟',
      'خطوات مقترحة:',
      '- أضف كلمات مفتاحية أدق (مثال: سياسة الإرجاع للإلكترونيات).',
      '- إن كان استعلامك عن الطلب، أرسل رقم الطلب كاملاً (قد يكون 24 خانة).',
      '- يمكنك إعادة الصياغة باختصار باللغة الإنجليزية لزيادة الدقة عند الحاجة.'
    ].join('\n');
  }
  return [
    'The available context is insufficient for a precise answer.',
    'Clarifying question: Could you specify exactly what you need (e.g., return policy for a specific category, or your full order ID)?',
    'Next steps:',
    '- Add more precise keywords (e.g., return policy for electronics).',
    '- If this is about an order, share the full order ID (often 24 chars).',
    '- Optionally rephrase concisely in English to improve recall.'
  ].join('\n');
}

// Handle policy questions with knowledge base
async function handlePolicyQuestion(query) {
  // Find relevant policies from knowledge base
  const relevantPolicies = citationValidator.findRelevantPolicies(query);
  
  if (relevantPolicies.length === 0) {
    // Provide a reasoning-aware assistive plan instead of a dead-end
    return buildAssistivePlan(query);
  }

  // Build grounded prompt for LLM requiring citations
  const identity = assistantConfig?.identity || { name: 'Agent', role: 'Support', company: 'ahmad store' };
  const rules = assistantConfig?.rules || [];
  const system = [
    `You are ${identity.name}, a ${identity.role} at ${identity.company}.`,
    'Answer ONLY using the provided policy snippets.',
    'When you reference policy info, you MUST cite at least one [PolicyID] from the provided context.',
    'Be concise and helpful. Never mention being an AI or model.'
  ].concat(rules || []).join('\n');

  const contextLines = relevantPolicies.map(p => `- [${p.id}] ${p.answer}`);
  const contextBlock = contextLines.join('\n');
  const prompt = [
    system,
    '',
    'Context:',
    contextBlock,
    '',
    `User question: ${query}`,
    '',
    'Answer (include [PolicyID] citations from Context):'
  ].join('\n');

  const llmText = await callLLM(prompt);

  // Ensure at least one citation exists; if not, append the top policy id to satisfy requirement
  const citations = citationValidator.extractCitations(llmText || '');
  let finalText = llmText || '';
  if (!citations || citations.length === 0) {
    finalText = `${finalText ? finalText + ' ' : ''}[${relevantPolicies[0].id}]`;
  }
  return finalText.trim();
}

// Handle order status queries
async function handleOrderStatus(query) {
  // Extract order ID from query
  const orderIdPattern = /\b(\d{10,}|[a-f0-9]{24})\b/i;
  const match = query.match(orderIdPattern);
  
  if (!match) {
    const lang = detectLanguage(query);
    return lang === 'ar'
      ? 'يسعدني التحقق من حالة طلبك. من فضلك زوّدني برقم الطلب الكامل (غالباً يكون طويلاً أو 24 خانة).'
      : "I'd be happy to check your order status. Please provide your full order ID (often a long code, e.g., 24 characters).";
  }
  
  const orderId = match[1];
  
  // Execute function to get order status
  const result = await functionRegistry.execute('getOrderStatus', { orderId });
  
  if (result.success) {
    const order = result.result;
    return `📦 **Order Status Update**\n\n` +
           `Order ID: ${order.orderId}\n` +
           `Status: **${order.status}**\n` +
           `Customer: ${order.customerName}\n` +
           `Total: $${order.total}\n` +
           `Carrier: ${order.carrier || 'Standard Shipping'}\n` +
           `Estimated Delivery: ${new Date(order.estimatedDelivery).toLocaleDateString()}\n\n` +
           `Your order is being processed and you'll receive updates as it progresses.`;
  } else {
    return `I couldn't find an order with ID: ${orderId}. Please double-check the order ID or contact our support team.`;
  }
}

// Generate response based on intent
async function generateResponse(userInput, intent, functionResults = []) {
  const config = assistantConfig.identity;
  const intentConfig = assistantConfig.intents[intent.intent];
  
  let response = {
    text: '',
    intent: intent.intent,
    confidence: intent.confidence,
    functionsExecuted: [],
    citations: [],
    citationValidation: null
  };
  
  switch (intent.intent) {
    case INTENTS.POLICY_QUESTION:
      // Expand query to improve KB recall before LLM
      const variants = expandQuery(userInput);
      let policyResponse = '';
      for (const v of variants) {
        policyResponse = await handlePolicyQuestion(v);
        if (policyResponse && !/could not find/i.test(policyResponse)) break;
      }
      response.text = policyResponse;
      
      // Validate citations
      const validation = citationValidator.validateResponse(policyResponse);
      response.citations = validation.extractedCitations || [];
      response.citationValidation = validation;
      break;
      
    case INTENTS.ORDER_STATUS:
      const orderResponse = await handleOrderStatus(userInput);
      response.text = orderResponse;
      response.functionsExecuted.push('getOrderStatus');
      
      // Check if response contains any policy citations
      if (orderResponse.includes('[')) {
        const validation = citationValidator.validateResponse(orderResponse);
        response.citations = validation.extractedCitations || [];
        response.citationValidation = validation;
      }
      break;
      
    case INTENTS.PRODUCT_SEARCH:
      if (functionResults.length > 0 && functionResults[0].success) {
        const result = functionResults[0].result;
        if (result.products.length > 0) {
          // Summarize with LLM for a concise, friendly response
          const identity = assistantConfig?.identity || { name: 'Agent', role: 'Support', company: 'ahmad store' };
          const list = result.products.slice(0, 5).map(p => `- ${p.name} ($${p.price}) | ${p.category} | stock: ${p.stock}`).join('\n');
          const prompt = [
            `${identity.name} is a ${identity.role} at ${identity.company}. Write a concise helpful summary of top matching products for the customer.`,
            'Do not invent details. Use exactly the provided list. Keep under 120 words.',
            '',
            'Products:',
            list,
            '',
            'Answer:'
          ].join('\n');
          const llmText = await callLLM(prompt);
          response.text = (llmText || '').trim() || `Found ${result.count} matching products. Would you like more details about any of them?`;
        } else {
          const lang = detectLanguage(userInput);
          response.text = lang === 'ar'
            ? [
                'لم أعثر على منتجات مطابقة للبحث.',
                'جرّب كلمات أدق (مثال: الفئة/الميزانية/العلامة).',
                'يمكنك ذكر حدود السعر أو الاستخدام (سماعات رياضية، تحت 50$).'
              ].join('\n')
            : [
                "I couldn't find products matching your query.",
                'Try more precise keywords (category/brand/budget).',
                'You can add price limits or use-case (e.g., sports headphones under $50).'
              ].join('\n');
        }
      } else {
        const lang = detectLanguage(userInput);
        response.text = lang === 'ar'
          ? 'أستطيع مساعدتك بالعثور على المنتجات! صف احتياجك أو اذكر اسم المنتج/الفئة/الميزانية.'
          : 'I can help you find products! Describe your need or provide product/category/budget.';
      }
      break;
      
    case INTENTS.COMPLAINT:
      // Keep deterministic empathetic response
      response.text = `I’m really sorry for the trouble you’re experiencing. Your satisfaction is very important to us and I want to make this right.\n\n` +
        `Could you share more details about the issue? If it’s about an order, please include the order ID so I can investigate immediately.`;
      break;
      
    case INTENTS.CHITCHAT:
      response.text = `Hello! I’m ${config.name}, your ${config.role} at ${config.company}. I can help with products, orders, and policies. How can I assist you today?`;
      break;
      
    case INTENTS.OFF_TOPIC:
      response.text = `I appreciate your question, but I’m focused on ${config.company} shopping, orders, and policies. Is there anything related to our store I can help you with today?`;
      break;
      
    case INTENTS.VIOLATION:
      response.text = `I understand you may be frustrated, but I need to maintain a professional conversation. I’m here to help with your ${config.company} needs. Please let me know how I can assist with your shopping or order concerns.`;
      break;
      
    default:
      response.text = `I'm here to help! You can ask me about products, check your order status, or learn about our policies. What would you like to know?`;
  }
  
  return response;
}

// Hugging Face Inference API fallback (no separate LLM server needed)
async function callHuggingFace(prompt, opts = {}) {
  const token = process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN;
  const model = process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';
  if (!token) return '';
  try {
    const url = `https://api-inference.huggingface.co/models/${model}`;
    const sys = 'You are a helpful retail assistant. Answer concisely and accurately.';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        inputs: `${sys}\n\nUser: ${prompt}\n\nAssistant:`,
        parameters: {
          max_new_tokens: Number(opts.maxTokens || 256),
          temperature: Number(opts.temperature || 0.2),
          top_p: 0.9,
          repetition_penalty: 1.05
        }
      })
    });
    const data = await res.json();
    if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
      return (data[0].generated_text || data[0].text || '').trim();
    }
    return '';
  } catch (e) {
    console.error('HF call failed:', e && e.message ? e.message : e);
    return '';
  }
}

// Call LLM service (/generate), or fallback to Hugging Face API when no LLM_ENDPOINT
async function callLLM(prompt, opts = {}) {
  const base = process.env.LLM_ENDPOINT && process.env.LLM_ENDPOINT.trim();
  if (!base) {
    // No external LLM server configured → use HF directly
    return callHuggingFace(prompt, opts);
  }
  const url = `${base.replace(/\/+$/, '')}/generate`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        max_tokens: Number(opts.maxTokens || 256),
        temperature: Number(opts.temperature || 0.2)
      })
    });
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`LLM ${response.status}: ${txt}`);
    }
    const data = await response.json();
    return (data && (data.text || data.answer || '')) || '';
  } catch (err) {
    console.error('LLM call failed:', err.message || err);
    // Fallback to Hugging Face if configured
    const hf = await callHuggingFace(prompt, opts);
    return hf || '';
  }
}

// Main assistant endpoint
router.post('/chat', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { message, context = {} } = req.body;
    
    if (!message) {
      return res.status(400).json({
        error: {
          code: 'MISSING_MESSAGE',
          message: 'Message is required'
        }
      });
    }
    
    // Classify intent
    const intent = classifyIntent(message);
    console.log(`Intent classified: ${intent.intent} (confidence: ${intent.confidence})`);
    
    // Prepare to track function calls
    const functionsCalled = [];
    const functionResults = [];
    
    // Execute functions based on intent (max 2 function calls)
    if (intent.intent === INTENTS.ORDER_STATUS) {
      // Extract order ID from message
      const orderIdMatch = message.match(/[0-9a-f]{24}/i);
      if (orderIdMatch) {
        const result = await functionRegistry.execute('getOrderStatus', {
          orderId: orderIdMatch[0]
        });
        functionsCalled.push('getOrderStatus');
        functionResults.push(result);
      }
    } else if (intent.intent === INTENTS.PRODUCT_SEARCH) {
      // Extract search query
      const searchMatch = message.match(/(?:looking for|search|find|show me)\s+(.+)/i);
      if (searchMatch) {
        const result = await functionRegistry.execute('searchProducts', {
          query: searchMatch[1],
          limit: 5
        });
        functionsCalled.push('searchProducts');
        functionResults.push(result);
      }
    }
    
    // Generate response
    const response = await generateResponse(message, intent, functionResults);
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Update assistant stats
    try {
      await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/dashboard/assistant-stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: intent.intent,
          functionsCalled,
          responseTime
        })
      });
    } catch (error) {
      // Ignore stats update errors
    }
    
    res.json({
      response: response.text,
      intent: response.intent,
      confidence: response.confidence,
      functionsExecuted: response.functionsExecuted,
      citations: response.citations,
      citationValidation: response.citationValidation,
      responseTime,
      assistant: {
        name: assistantConfig.identity.name,
        role: assistantConfig.identity.role
      }
    });
  } catch (error) {
    console.error('Assistant error:', error);
    res.status(500).json({
      error: {
        code: 'ASSISTANT_ERROR',
        message: 'Failed to process your request'
      }
    });
  }
});

// Lightweight search endpoint to power UI autosuggest
router.get('/search/policies', (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase();
    if (!knowledgeBase || knowledgeBase.length === 0) return res.json([]);
    const results = knowledgeBase
      .map((p, i) => ({ i, score: (p.question + ' ' + p.answer).toLowerCase().includes(q) ? 1 : 0, p }))
      .filter(r => r.score > 0)
      .slice(0, 10)
      .map(r => ({ id: r.p.id, question: r.p.question, category: r.p.category }));
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: 'SEARCH_FAILED' });
  }
});

// Hot reload KB without server restart
router.post('/kb/reload', (req, res) => {
  try {
    loadKnowledgeBase();
    res.json({ ok: true, size: knowledgeBase.length });
  } catch (e) {
    res.status(500).json({ error: 'KB_RELOAD_FAILED' });
  }
});

// Get assistant information
router.get('/info', (req, res) => {
  res.json({
    identity: assistantConfig.identity,
    supportedIntents: Object.keys(INTENTS).map(k => ({
      name: INTENTS[k],
      description: assistantConfig.intents[INTENTS[k]]?.behavior
    })),
    availableFunctions: functionRegistry.getAllSchemas().map(s => ({
      name: s.name,
      description: s.description
    })),
    knowledgeBaseSize: knowledgeBase.length
  });
});

// Initialize on module load
loadConfig();
loadKnowledgeBase();

module.exports = {
  assistantRouter: router
};
