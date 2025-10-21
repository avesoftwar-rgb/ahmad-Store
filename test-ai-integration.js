#!/usr/bin/env node

/**
 * Test script for AI Assistant integration
 * Run this after deploying both services to verify they work together
 */

const fetch = require('node-fetch');

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const AI_ASSISTANT_URL = process.env.AI_ASSISTANT_URL || 'http://localhost:8000';

async function testAIAssistant() {
  console.log('🤖 Testing AI Assistant Service...\n');
  
  try {
    // Test AI Assistant health
    console.log('1. Testing AI Assistant health...');
    const healthResponse = await fetch(`${AI_ASSISTANT_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ AI Assistant health:', healthData);
    
    // Test simple generation
    console.log('\n2. Testing simple generation...');
    const genResponse = await fetch(`${AI_ASSISTANT_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: "List 3 benefits of online shopping:",
        max_tokens: 100
      })
    });
    const genData = await genResponse.json();
    console.log('✅ Generation response:', genData);
    
    // Test RAG chat
    console.log('\n3. Testing RAG chat...');
    const chatResponse = await fetch(`${AI_ASSISTANT_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: "How do I return a product?"
      })
    });
    const chatData = await chatResponse.json();
    console.log('✅ RAG chat response:', chatData);
    
  } catch (error) {
    console.error('❌ AI Assistant test failed:', error.message);
    return false;
  }
  
  return true;
}

async function testBackendIntegration() {
  console.log('\n🔗 Testing Backend Integration...\n');
  
  try {
    // Test backend health
    console.log('1. Testing backend health...');
    const healthResponse = await fetch(`${BACKEND_URL}/api/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Backend health:', healthData);
    
    // Test AI assistant health through backend
    console.log('\n2. Testing AI assistant health through backend...');
    const aiHealthResponse = await fetch(`${BACKEND_URL}/api/assistant/ai-health`);
    const aiHealthData = await aiHealthResponse.json();
    console.log('✅ AI Assistant health via backend:', aiHealthData);
    
    // Test assistant chat endpoint
    console.log('\n3. Testing assistant chat endpoint...');
    const chatResponse = await fetch(`${BACKEND_URL}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "How do I return a product?",
        context: {}
      })
    });
    const chatData = await chatResponse.json();
    console.log('✅ Assistant chat response:', chatData);
    
  } catch (error) {
    console.error('❌ Backend integration test failed:', error.message);
    return false;
  }
  
  return true;
}

async function runTests() {
  console.log('🚀 Starting AI Assistant Integration Tests\n');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`AI Assistant URL: ${AI_ASSISTANT_URL}\n`);
  
  const aiTest = await testAIAssistant();
  const backendTest = await testBackendIntegration();
  
  console.log('\n📊 Test Results:');
  console.log(`AI Assistant Service: ${aiTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Backend Integration: ${backendTest ? '✅ PASS' : '❌ FAIL'}`);
  
  if (aiTest && backendTest) {
    console.log('\n🎉 All tests passed! AI Assistant is ready for production.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the configuration and try again.');
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testAIAssistant, testBackendIntegration, runTests };