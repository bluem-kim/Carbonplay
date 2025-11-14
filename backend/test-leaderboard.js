const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// Test leaderboard functionality
async function testLeaderboard() {
  console.log('🏆 Testing Leaderboard API...\n');

  try {
    // First, let's create a test user and some scenarios to populate the leaderboard
    const testUser = {
      firstName: 'Leaderboard',
      lastName: 'Tester',
      email: 'leaderboard@test.com',
      password: 'password123'
    };

    let authToken = '';

    // Register or login
    try {
      const registerResponse = await axios.post(`${API_BASE}/auth/register`, testUser);
      authToken = registerResponse.data.token;
      console.log('✅ Test user created');
    } catch (error) {
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        email: testUser.email,
        password: testUser.password
      });
      authToken = loginResponse.data.token;
      console.log('✅ Test user logged in');
    }

    const headers = { Authorization: `Bearer ${authToken}` };

    // Create a few test scenarios
    const scenarios = [
      { name: 'Daily Commute', description: 'Car vs bike comparison' },
      { name: 'Home Energy', description: 'Electricity usage optimization' },
      { name: 'Diet Impact', description: 'Meat vs vegetarian meals' }
    ];

    for (const scenario of scenarios) {
      try {
        const response = await axios.post(`${API_BASE}/scenarios`, scenario, { headers });
        const scenarioId = response.data.data.id;
        
        // Add some activities to each scenario
        await axios.post(`${API_BASE}/scenarios/${scenarioId}/activities`, {
          category: 'transport',
          activity_type: 'car_gasoline',
          value: Math.random() * 20 + 5,
          unit: 'miles'
        }, { headers });

        await axios.post(`${API_BASE}/scenarios/${scenarioId}/activities`, {
          category: 'diet',
          activity_type: 'beef',
          value: Math.random() * 1 + 0.2,
          unit: 'kg'
        }, { headers });
        
        console.log(`✅ Created scenario: ${scenario.name}`);
      } catch (error) {
        console.log(`⚠️  Scenario might already exist: ${scenario.name}`);
      }
    }

    // Test different leaderboard types
    const leaderboardTypes = ['scenarios', 'reduction', 'activities'];

    for (const type of leaderboardTypes) {
      console.log(`\n📊 Testing ${type} leaderboard:`);
      
      const response = await axios.get(`${API_BASE}/leaderboard?type=${type}&limit=10`, { headers });
      
      if (response.data.status === 'success') {
        const leaderboard = response.data.data.leaderboard;
        console.log(`✅ Loaded ${leaderboard.length} entries`);
        
        if (leaderboard.length > 0) {
          console.log('Top 3 entries:');
          leaderboard.slice(0, 3).forEach(user => {
            console.log(`   ${user.rank}. ${user.username} - ${user.metric} ${user.metricLabel} (${user.secondaryMetric} ${user.secondaryLabel})`);
            console.log(`      Badge: ${user.badge.title} ${user.badge.icon}`);
          });
        }
      } else {
        console.log('❌ Failed to load leaderboard');
      }
    }

    // Test with different limits
    console.log('\n🔢 Testing different limits:');
    for (const limit of [3, 5, 10]) {
      const response = await axios.get(`${API_BASE}/leaderboard?type=scenarios&limit=${limit}`, { headers });
      const count = response.data.data.leaderboard.length;
      console.log(`   Limit ${limit}: Got ${count} entries`);
    }

    console.log('\n🎉 Leaderboard tests completed successfully!');

  } catch (error) {
    console.error('❌ Leaderboard test failed:', error.response?.data || error.message);
  }
}

if (require.main === module) {
  testLeaderboard().then(() => {
    console.log('\n✨ Testing complete!');
    process.exit(0);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testLeaderboard };