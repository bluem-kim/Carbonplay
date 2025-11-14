const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// Test data
const testUser = {
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  password: 'password123'
};

const testScenario = {
  name: 'My Daily Commute',
  description: 'Comparing car vs public transport'
};

const testActivity = {
  category: 'transport',
  activity_type: 'car_gasoline',
  value: 20,
  unit: 'kg_per_mile'
};

let authToken = '';

async function runTests() {
  console.log('🧪 Starting CarbonPlay API Tests...\n');

  try {
    // Test 1: Register user (or login if exists)
    console.log('1️⃣ Testing user registration...');
    try {
      const registerResponse = await axios.post(`${API_BASE}/auth/register`, testUser);
      authToken = registerResponse.data.token;
      console.log('✅ User registered successfully');
    } catch (error) {
      // If user exists, try login
      console.log('   User might exist, trying login...');
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        email: testUser.email,
        password: testUser.password
      });
      authToken = loginResponse.data.token;
      console.log('✅ User logged in successfully');
    }

    const headers = { Authorization: `Bearer ${authToken}` };

    // Test 2: Get emission factors
    console.log('\n2️⃣ Testing emission factors endpoint...');
    const factorsResponse = await axios.get(`${API_BASE}/emission-factors`, { headers });
    console.log('✅ Emission factors loaded:', Object.keys(factorsResponse.data.data).length, 'categories');

    // Test 3: Create scenario
    console.log('\n3️⃣ Testing scenario creation...');
    const scenarioResponse = await axios.post(`${API_BASE}/scenarios`, testScenario, { headers });
    const scenarioId = scenarioResponse.data.data.id;
    console.log('✅ Scenario created with ID:', scenarioId);

    // Test 4: Calculate preview
    console.log('\n4️⃣ Testing emissions preview calculation...');
    const previewResponse = await axios.post(`${API_BASE}/calculate-preview`, testActivity, { headers });
    console.log('✅ Preview calculation:', previewResponse.data.data.co2e_amount, 'kg CO₂e');

    // Test 5: Add activity to scenario
    console.log('\n5️⃣ Testing add activity to scenario...');
    const activityResponse = await axios.post(`${API_BASE}/scenarios/${scenarioId}/activities`, testActivity, { headers });
    console.log('✅ Activity added with emissions:', activityResponse.data.data.co2e_amount, 'kg CO₂e');
    console.log('   Scenario total:', activityResponse.data.data.scenario_total, 'kg CO₂e');

    // Test 6: Get scenarios
    console.log('\n6️⃣ Testing get user scenarios...');
    const scenariosResponse = await axios.get(`${API_BASE}/scenarios`, { headers });
    console.log('✅ Retrieved', scenariosResponse.data.data.length, 'scenario(s)');
    
    const scenario = scenariosResponse.data.data[0];
    console.log('   Scenario:', scenario.name);
    console.log('   Total emissions:', scenario.total_co2e, 'kg CO₂e');
    console.log('   Activities:', scenario.activities.length);

    // Test 7: Get single scenario
    console.log('\n7️⃣ Testing get single scenario...');
    const singleScenarioResponse = await axios.get(`${API_BASE}/scenarios/${scenarioId}`, { headers });
    console.log('✅ Single scenario retrieved:', singleScenarioResponse.data.data.name);

    // Test 8: Get leaderboard
    console.log('\n8️⃣ Testing leaderboard functionality...');
    const leaderboardResponse = await axios.get(`${API_BASE}/leaderboard?type=scenarios&limit=5`, { headers });
    console.log('✅ Leaderboard loaded with', leaderboardResponse.data.data.leaderboard.length, 'entries');

    console.log('\n🎉 All tests passed successfully!');
    console.log('\n📊 Test Results Summary:');
    console.log('   - User authentication: ✅');
    console.log('   - Emission factors API: ✅');
    console.log('   - Scenario creation: ✅');
    console.log('   - Emissions calculation: ✅');
    console.log('   - Activity management: ✅');
    console.log('   - Data retrieval: ✅');
    console.log('   - Leaderboard system: ✅');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 500) {
      console.log('\n💡 Tip: Make sure MySQL is running and the database is set up');
    }
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Tip: Make sure the server is running on port 3000');
      console.log('   Run: npm start in the backend directory');
    }
  }
}

// Additional test for different activity types
async function testVariousActivities() {
  if (!authToken) {
    console.log('❌ No auth token available for extended tests');
    return;
  }

  console.log('\n🔬 Testing various activity types...\n');
  
  const activities = [
    { category: 'transport', activity_type: 'bus', value: 10, unit: 'kg_per_mile' },
    { category: 'transport', activity_type: 'bicycle', value: 5, unit: 'kg_per_mile' },
    { category: 'diet', activity_type: 'beef', value: 0.5, unit: 'kg_per_kg' },
    { category: 'diet', activity_type: 'chicken', value: 0.3, unit: 'kg_per_kg' },
    { category: 'energy', activity_type: 'electricity', value: 100, unit: 'kg_per_kwh' }
  ];

  const headers = { Authorization: `Bearer ${authToken}` };

  for (const activity of activities) {
    try {
      const response = await axios.post(`${API_BASE}/calculate-preview`, activity, { headers });
      console.log(`${activity.category}/${activity.activity_type}:`, 
        response.data.data.co2e_amount, 'kg CO₂e for', activity.value, activity.unit);
    } catch (error) {
      console.log(`❌ Error calculating ${activity.category}/${activity.activity_type}:`, 
        error.response?.data?.message || error.message);
    }
  }
}

if (require.main === module) {
  runTests().then(() => {
    return testVariousActivities();
  }).then(() => {
    console.log('\n✨ Testing complete!');
    process.exit(0);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTests, testVariousActivities };