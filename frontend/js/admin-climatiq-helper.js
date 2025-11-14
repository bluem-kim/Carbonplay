// Climatiq API helper for admin panel
// Provides emission estimates to help set realistic challenge targets

const CLIMATIQ_API_KEY = ''; // Admin should set this in backend .env
const CLIMATIQ_BASE_URL = 'https://api.climatiq.io/data/v1';

// Get average emissions for common activities to help set challenge targets
async function getEmissionEstimates() {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch('http://localhost:3000/api/admin/emission-estimates', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to fetch estimates');
    return await response.json();
  } catch (error) {
    console.error('Error fetching emission estimates:', error);
    return null;
  }
}

// Show suggested targets based on challenge type
async function showTargetSuggestions(challengeType) {
  const suggestions = {
    daily_limit: {
      description: 'Average daily emissions per person',
      examples: [
        { label: 'Very Low Impact', value: 2.0, desc: 'Minimal transport, plant-based diet' },
        { label: 'Low Impact', value: 5.0, desc: 'Public transport, reduced meat' },
        { label: 'Moderate Impact', value: 10.0, desc: 'Some driving, mixed diet' },
        { label: 'Average US', value: 15.0, desc: 'Typical American lifestyle' }
      ]
    },
    total_limit: {
      description: 'Total emissions budget for duration',
      examples: [
        { label: 'Week - Low', value: 35.0, desc: '5 kg/day × 7 days' },
        { label: 'Week - Moderate', value: 70.0, desc: '10 kg/day × 7 days' },
        { label: 'Month - Low', value: 150.0, desc: '5 kg/day × 30 days' },
        { label: 'Month - Moderate', value: 300.0, desc: '10 kg/day × 30 days' }
      ]
    },
    activity_count: {
      description: 'Number of activities to log',
      examples: [
        { label: 'Beginner', value: 5, desc: 'Easy to achieve in a week' },
        { label: 'Active', value: 10, desc: 'Good engagement level' },
        { label: 'Committed', value: 20, desc: 'Daily logging' },
        { label: 'Expert', value: 30, desc: 'Multiple entries per day' }
      ]
    },
    consecutive_days: {
      description: 'Days to maintain low emissions',
      examples: [
        { label: 'Weekend', value: 3, desc: '3-day streak' },
        { label: 'Week', value: 7, desc: 'One full week' },
        { label: 'Two Weeks', value: 14, desc: 'Habit forming' },
        { label: 'Month', value: 30, desc: 'Lifestyle change' }
      ]
    }
  };
  
  return suggestions[challengeType] || null;
}

// Get emission factor from Climatiq for specific activity
async function getClimatiqFactor(category, activityType) {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch('http://localhost:3000/api/admin/climatiq-factor', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ category, activity_type: activityType })
    });
    
    if (!response.ok) throw new Error('Failed to fetch Climatiq factor');
    return await response.json();
  } catch (error) {
    console.error('Error fetching Climatiq factor:', error);
    return null;
  }
}

// Calculate suggested target based on typical activities
function calculateSuggestedTarget(challengeType, durationDays) {
  // Typical daily emissions breakdown (kg CO2e):
  // Transport: 3-8 kg (car dependent)
  // Diet: 2-5 kg (meat vs plant-based)
  // Energy: 1-3 kg (home size/efficiency)
  // Other: 1-2 kg
  // Total: 7-18 kg/day average
  
  const avgDaily = 10; // Conservative average
  
  switch (challengeType) {
    case 'daily_limit':
      return avgDaily * 0.7; // 30% reduction target
    case 'total_limit':
      return avgDaily * durationDays * 0.7;
    case 'activity_count':
      return durationDays; // 1 activity per day
    case 'consecutive_days':
      return Math.min(durationDays, 7); // Up to 1 week
    default:
      return 5.0;
  }
}

// Add suggestion helper to challenge form
function addTargetSuggestionHelper() {
  const form = document.getElementById('form-challenges');
  if (!form) return;
  
  const typeSelect = form.querySelector('[name="challenge_type"]');
  const targetInput = form.querySelector('[name="target_value"]');
  const durationInput = form.querySelector('[name="duration_days"]');
  
  if (!typeSelect || !targetInput) return;
  
  // Add suggestion button next to target input
  const targetControl = targetInput.closest('.form-control');
  if (!targetControl) return;
  
  const suggestionBtn = document.createElement('button');
  suggestionBtn.type = 'button';
  suggestionBtn.className = 'btn btn-sm btn-ghost mt-1';
  suggestionBtn.innerHTML = '<i class="fa-solid fa-lightbulb mr-1"></i> Suggest Target';
  
  suggestionBtn.addEventListener('click', async () => {
    const challengeType = typeSelect.value;
    const duration = parseInt(durationInput.value) || 7;
    
    const suggestions = await showTargetSuggestions(challengeType);
    if (!suggestions) return;
    
    // Show modal with suggestions
    const modal = document.createElement('dialog');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-box">
        <h3 class="font-bold text-lg mb-4">Target Suggestions for ${suggestions.description}</h3>
        <div class="space-y-2">
          ${suggestions.examples.map(ex => `
            <button type="button" class="btn btn-ghost w-full justify-start" onclick="document.querySelector('[name=\\'target_value\\']').value = ${ex.value}; this.closest('dialog').close()">
              <div class="text-left flex-1">
                <div class="font-semibold">${ex.label}: ${ex.value} ${challengeType === 'activity_count' ? 'activities' : 'kg CO₂e'}</div>
                <div class="text-xs text-muted">${ex.desc}</div>
              </div>
              <i class="fa-solid fa-arrow-right ml-2"></i>
            </button>
          `).join('')}
        </div>
        <div class="alert alert-info mt-4 text-xs">
          <i class="fa-solid fa-info-circle"></i>
          <span>These are suggestions based on typical emissions. Adjust based on your users' context.</span>
        </div>
        <div class="modal-action">
          <button type="button" class="btn" onclick="this.closest('dialog').close()">Close</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    `;
    
    document.body.appendChild(modal);
    modal.showModal();
    modal.addEventListener('close', () => modal.remove());
  });
  
  targetControl.appendChild(suggestionBtn);
}

// Initialize when admin page loads
if (window.location.pathname.includes('/admin/')) {
  document.addEventListener('DOMContentLoaded', () => {
    // Add helper after short delay to ensure form is rendered
    setTimeout(addTargetSuggestionHelper, 500);
  });
}
