/**
 * Climatiq Activity-Based Challenge Generator
 * Allows admins to search real emission activities and auto-generate challenges
 */

let searchResults = [];
let selectedActivity = null;

// Initialize the activity generator UI
function initActivityGenerator() {
  const modal = document.getElementById('modal-challenges');
  if (!modal) {
    console.log('Modal not found: modal-challenges');
    return;
  }

  // Check if button already exists
  if (document.getElementById('btn-generate-from-activity')) {
    return;
  }

  // Add "Generate from Activity" button to challenge form
  const form = modal.querySelector('#form-challenges');
  if (!form) {
    console.log('Form not found: form-challenges');
    return;
  }

  const generatorButton = document.createElement('button');
  generatorButton.id = 'btn-generate-from-activity';
  generatorButton.type = 'button';
  generatorButton.className = 'btn btn-outline btn-info btn-sm mb-4 w-full';
  generatorButton.innerHTML = '<i class="fas fa-magic mr-2"></i> Generate from Activity (Search Climatiq)';
  generatorButton.onclick = showActivitySearchModal;

  // Insert button at the top of the form (before first label)
  const firstLabel = form.querySelector('label');
  if (firstLabel) {
    form.insertBefore(generatorButton, firstLabel);
  } else {
    form.prepend(generatorButton);
  }
  
  console.log('Activity generator button added successfully');
}

// Show activity search modal
function showActivitySearchModal() {
  const form = document.getElementById('form-challenges');
  if (!form) return;
  
  // Hide the form temporarily
  form.style.display = 'none';
  
  // Get the modal box
  const modalBox = form.closest('.modal-box');
  if (!modalBox) return;
  
  // Create search interface
  const searchHTML = `
    <div id="activitySearchContainer">
      <h3 class="font-bold text-lg mb-4">
        <i class="fas fa-search text-info mr-2"></i>
        Search Activities from Climatiq
      </h3>
      
      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text">Search for activities (e.g., "car", "beef", "electricity")</span>
        </label>
        <div class="flex gap-2">
          <input 
            type="text" 
            id="activitySearchInput" 
            class="input input-bordered flex-1" 
            placeholder="Enter activity name..."
            onkeypress="if(event.key==='Enter'){event.preventDefault();searchClimatiqActivities();}"
          />
          <select id="categoryCombFilter" class="select select-bordered">
            <option value="">All Categories</option>
            <option value="transport">Transport</option>
            <option value="diet">Diet</option>
            <option value="energy">Energy</option>
            <option value="waste">Waste</option>
          </select>
          <button type="button" class="btn btn-primary" onclick="searchClimatiqActivities()">
            <i class="fas fa-search"></i>
          </button>
        </div>
      </div>

      <div id="searchStatus" class="alert alert-info mb-4 hidden">
        <span>Searching...</span>
      </div>

      <div id="activityResults" class="max-h-96 overflow-y-auto mb-4">
        <p class="text-gray-500 text-center py-8">Enter a search term to find activities</p>
      </div>

      <div class="flex gap-2">
        <button type="button" class="btn btn-ghost" onclick="closeActivitySearchModal()">
          <i class="fas fa-arrow-left mr-2"></i>Back to Form
        </button>
      </div>
    </div>
  `;

  // Remove existing search container if any
  const existing = document.getElementById('activitySearchContainer');
  if (existing) existing.remove();

  // Insert search interface after title
  const title = modalBox.querySelector('h3');
  if (title) {
    title.insertAdjacentHTML('afterend', searchHTML);
  }

  // Focus search input
  setTimeout(() => {
    document.getElementById('activitySearchInput')?.focus();
  }, 100);
}

// Search Climatiq API for activities
async function searchClimatiqActivities() {
  const query = document.getElementById('activitySearchInput')?.value || '';
  const category = document.getElementById('categoryCombFilter')?.value || '';
  
  if (!query.trim()) {
    showToast('Please enter a search term', 'warning');
    return;
  }

  const statusDiv = document.getElementById('searchStatus');
  const resultsDiv = document.getElementById('activityResults');
  
  statusDiv.classList.remove('hidden');
  resultsDiv.innerHTML = '<div class="loading loading-spinner loading-lg mx-auto"></div>';

  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/admin/climatiq-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query, category })
    });

    const data = await response.json();
    statusDiv.classList.add('hidden');

    if (data.status === 'success') {
      searchResults = data.data;
      displayActivityResults(searchResults, data.fallback);
      
      if (data.fallback) {
        showToast(data.message || 'Using local database', 'info');
      }
    } else {
      throw new Error(data.message || 'Search failed');
    }
  } catch (error) {
    console.error('Search error:', error);
    statusDiv.classList.add('hidden');
    resultsDiv.innerHTML = `
      <div class="alert alert-error">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Search failed: ${error.message}</span>
      </div>
    `;
  }
}

// Display search results
function displayActivityResults(activities, isFallback = false) {
  const resultsDiv = document.getElementById('activityResults');
  
  if (!activities || activities.length === 0) {
    resultsDiv.innerHTML = `
      <div class="alert alert-warning">
        <i class="fas fa-info-circle"></i>
        <span>No activities found. Try a different search term.</span>
      </div>
    `;
    return;
  }

  const categoryColors = {
    transport: 'badge-primary',
    diet: 'badge-success',
    energy: 'badge-warning',
    waste: 'badge-error',
    other: 'badge-neutral'
  };

  const html = activities.map((activity, index) => `
    <div class="card bg-base-200 mb-2 hover:bg-base-300 cursor-pointer" onclick="selectActivity(${index})">
      <div class="card-body p-4">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <h4 class="font-semibold text-lg">${activity.name}</h4>
            <p class="text-sm text-gray-600 mt-1">${activity.description || 'No description'}</p>
            <div class="flex gap-2 mt-2 flex-wrap">
              <span class="badge ${categoryColors[activity.category] || 'badge-neutral'} badge-sm">
                ${activity.category || 'Other'}
              </span>
              <span class="badge badge-outline badge-sm">
                ${activity.region || 'Global'}
              </span>
              <span class="badge badge-outline badge-sm">
                ${activity.source || 'Unknown'}
              </span>
            </div>
          </div>
          <div class="text-right ml-4">
            <div class="stat-value text-xl">${parseFloat(activity.co2e_per_unit).toFixed(3)}</div>
            <div class="stat-desc">${activity.unit || 'kg CO2e'}</div>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  resultsDiv.innerHTML = `
    ${isFallback ? `
      <div class="alert alert-info mb-4">
        <i class="fas fa-database"></i>
        <span>Showing results from local database. Configure CLIMATIQ_API_KEY for live data.</span>
      </div>
    ` : ''}
    ${html}
  `;
}

// Select an activity and show challenge suggestions
async function selectActivity(index) {
  selectedActivity = searchResults[index];
  
  if (!selectedActivity) return;

  // Show loading
  const resultsDiv = document.getElementById('activityResults');
  resultsDiv.innerHTML = '<div class="loading loading-spinner loading-lg mx-auto"></div>';

  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/admin/generate-challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        activity_id: selectedActivity.id,
        activity_name: selectedActivity.name,
        co2e_per_unit: selectedActivity.co2e_per_unit,
        unit: selectedActivity.unit,
        category: selectedActivity.category
      })
    });

    const data = await response.json();
    
    if (data.status === 'success') {
      displayChallengeSuggestions(data.data.suggestions, data.data.activity_info);
    } else {
      throw new Error(data.message || 'Failed to generate challenges');
    }
  } catch (error) {
    console.error('Generate error:', error);
    resultsDiv.innerHTML = `
      <div class="alert alert-error">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Failed to generate challenges: ${error.message}</span>
      </div>
    `;
  }
}

// Display challenge suggestions
function displayChallengeSuggestions(suggestions, activityInfo) {
  const resultsDiv = document.getElementById('activityResults');
  
  const html = `
    <div class="mb-4">
      <button type="button" class="btn btn-sm btn-ghost" onclick="searchClimatiqActivities()">
        <i class="fas fa-arrow-left mr-2"></i> Back to Search
      </button>
    </div>

    <div class="alert alert-success mb-4">
      <i class="fas fa-check-circle"></i>
      <div>
        <div class="font-bold">Selected: ${activityInfo.activity_name}</div>
        <div class="text-sm">
          ${activityInfo.co2e_per_unit.toFixed(3)} ${activityInfo.unit || 'kg CO2e per unit'}
        </div>
      </div>
    </div>

    <h4 class="font-bold text-lg mb-3">
      <i class="fas fa-lightbulb text-warning mr-2"></i>
      Auto-Generated Challenge Suggestions
    </h4>

    ${Object.entries(suggestions).map(([key, challenge], index) => `
      <div class="card bg-base-200 mb-3 hover:shadow-lg transition-shadow">
        <div class="card-body p-4">
          <div class="flex justify-between items-start mb-2">
            <h5 class="font-semibold text-lg">${challenge.name}</h5>
            <span class="badge badge-primary">${challenge.challenge_type.replace('_', ' ')}</span>
          </div>
          <p class="text-sm mb-3">${challenge.description}</p>
          <div class="grid grid-cols-2 gap-2 text-sm mb-3">
            <div><strong>Target:</strong> ${challenge.target_value} ${challenge.target_unit}</div>
            <div><strong>Duration:</strong> ${challenge.duration_days} days</div>
            <div><strong>Badge:</strong> ${challenge.badge_name}</div>
            <div><strong>Type:</strong> ${challenge.challenge_type}</div>
          </div>
          <div class="text-xs text-gray-500 mb-3">
            <i class="fas fa-info-circle mr-1"></i> ${challenge.reasoning}
          </div>
          <button 
            type="button" 
            class="btn btn-primary btn-sm w-full use-challenge-btn"
            data-challenge-index="${index}">
            <i class="fas fa-check mr-2"></i> Use This Challenge
          </button>
        </div>
      </div>
    `).join('')}
  `;

  resultsDiv.innerHTML = html;
  
  // Add event listeners to all "Use This Challenge" buttons
  const suggestionArray = Object.values(suggestions);
  resultsDiv.querySelectorAll('.use-challenge-btn').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      useChallengeSuggestion(suggestionArray[index]);
    });
  });
}

// Use selected challenge suggestion
function useChallengeSuggestion(challenge) {
  console.log('Using challenge suggestion:', challenge);
  
  // Fill the main challenge form with suggested values
  const form = document.getElementById('form-challenges');
  if (!form) {
    console.error('Form not found');
    return;
  }
  
  try {
    form.querySelector('[name="name"]').value = challenge.name;
    form.querySelector('[name="description"]').value = challenge.description;
    form.querySelector('[name="challenge_type"]').value = challenge.challenge_type;
    form.querySelector('[name="target_value"]').value = challenge.target_value;
    form.querySelector('[name="target_unit"]').value = challenge.target_unit;
    form.querySelector('[name="duration_days"]').value = challenge.duration_days;
    form.querySelector('[name="badge_name"]').value = challenge.badge_name || '';
    form.querySelector('[name="is_active"]').checked = true;

    // Close the activity search modal
    closeActivitySearchModal();
    
    showToast('Challenge template loaded! Review and save.', 'success');
    console.log('Form filled successfully');
  } catch (error) {
    console.error('Error filling form:', error);
    showToast('Error loading template: ' + error.message, 'error');
  }
}

// Close activity search modal
function closeActivitySearchModal() {
  const container = document.getElementById('activitySearchContainer');
  if (container) {
    container.remove();
  }
  
  // Show the form again
  const form = document.getElementById('form-challenges');
  if (form) {
    form.style.display = '';
  }
}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type} fixed top-4 right-4 w-96 z-50 shadow-lg`;
  toast.innerHTML = `<span>${message}</span>`;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Initialize when DOM is ready
function tryInitActivityGenerator() {
  const modal = document.getElementById('modal-challenges');
  if (modal) {
    initActivityGenerator();
  } else {
    console.log('Waiting for modal to load...');
    setTimeout(tryInitActivityGenerator, 500);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(tryInitActivityGenerator, 100);
  });
} else {
  setTimeout(tryInitActivityGenerator, 100);
}

// Also re-initialize when modal is opened
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="open-modal"]');
  if (btn && btn.getAttribute('data-modal') === 'modal-challenges') {
    setTimeout(initActivityGenerator, 100);
  }
});
