const axios = require('axios');
require('dotenv').config();

async function testGeminiChat() {
  console.log('🧪 Testing Gemini Chat API\n');
  
  const apiKey = process.env.Gemini_api_key;
  
  if (!apiKey) {
    console.error('❌ No Gemini_api_key found in .env');
    process.exit(1);
  }
  
  console.log('✅ API Key found:', apiKey.substring(0, 10) + '...\n');
  
  // Test the exact same setup as weekly motivation
  const version = 'v1beta';
  const model = 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`;
  
  const testPrompt = 'Carbon emission — How much CO₂e is 10 miles by car?';
  
  console.log(`📡 Testing: ${version}/models/${model}`);
  console.log(`📝 Prompt: "${testPrompt}"\n`);
  
  try {
    const body = {
      contents: [
        { role: 'user', parts: [{ text: testPrompt }] }
      ],
      generationConfig: { temperature: 0.3 }
    };
    
    console.log('⏳ Calling Gemini API...\n');
    
    const resp = await axios.post(url, body, { timeout: 12000 });
    
    const cand = resp.data?.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const reply = parts.map(p => (typeof p.text === 'string' ? p.text : '')).join('\n').trim();
    
    if (reply) {
      console.log('✅ SUCCESS! Gemini responded:\n');
      console.log('─────────────────────────────────────');
      console.log(reply);
      console.log('─────────────────────────────────────\n');
      console.log(`✨ Model: ${model}/${version}`);
      console.log('✨ This configuration works!\n');
    } else {
      console.log('⚠️  API returned OK but no text in response');
      console.log('Response:', JSON.stringify(resp.data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ FAILED\n');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 404) {
        console.error('\n💡 Model not found. Trying to list available models...\n');
        await listAvailableModels(apiKey);
      }
    } else {
      console.error('Error:', error.message);
    }
  }
}

async function listAvailableModels(apiKey) {
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const resp = await axios.get(listUrl);
    
    const models = resp.data?.models || [];
    const genModels = models.filter(m => 
      m.supportedGenerationMethods?.includes('generateContent')
    );
    
    console.log('📋 Available models that support generateContent:\n');
    genModels.forEach(m => {
      console.log(`  • ${m.name}`);
      console.log(`    Display: ${m.displayName || 'N/A'}`);
      console.log(`    Version: ${m.version || 'N/A'}\n`);
    });
    
    if (genModels.length === 0) {
      console.log('  ⚠️  No models found that support generateContent');
    }
    
  } catch (err) {
    console.error('Failed to list models:', err.message);
  }
}

if (require.main === module) {
  testGeminiChat().then(() => {
    console.log('✨ Test complete!\n');
    process.exit(0);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testGeminiChat };
