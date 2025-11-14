# Activity-Based Challenge Generator

## Overview

This feature allows admins to **auto-generate challenges based on real emission activities** from the Climatiq API (or local database). Instead of manually calculating emission targets, admins can:

1. Search for specific activities (e.g., "driving Tesla Model 3", "eating beef", "natural gas")
2. View emission factors for each activity
3. Auto-generate 4 challenge templates with realistic targets
4. Customize and save the challenge

---

## How It Works

### For Admins

#### 1. **Open Challenge Creation**
- Navigate to Admin Panel → Challenges
- Click "Create Challenge" button
- You'll see a new button: **"Generate from Activity"**

#### 2. **Search Activities**
- Click "Generate from Activity"
- Enter search term (e.g., "car", "beef", "electricity")
- Optionally filter by category (Transport, Diet, Energy, Waste)
- Click Search

#### 3. **Browse Results**
Each activity shows:
- **Activity Name**: e.g., "Passenger car, gasoline"
- **Emission Factor**: e.g., 0.192 kg CO2e per mile
- **Category Badge**: Transport, Diet, Energy, Waste
- **Region**: US, Global, etc.
- **Source**: climatiq, local, etc.

#### 4. **Generate Challenge Templates**
Click any activity to see 4 auto-generated challenge suggestions:

| Template Type | Example | Target Calculation |
|--------------|---------|-------------------|
| **Daily Limit** | "Daily Car Usage Limit" | Emission factor × 10 units/day |
| **Weekly Total** | "Weekly Car Challenge" | Emission factor × 50 units/week |
| **Monthly Total** | "Month of Car Awareness" | Emission factor × 200 units/month |
| **Activity Tracker** | "Track Car Usage" | 15 logged activities |

Each suggestion includes:
- Pre-filled name, description, target, duration
- Reasoning (how target was calculated)
- Badge name suggestion

#### 5. **Customize & Save**
- Click "Use This Challenge" on any suggestion
- Form auto-fills with template values
- Edit as needed (name, description, target, duration)
- Click Save to create the challenge

---

## API Integration

### With Climatiq API Key (Recommended)

Add to `backend/.env`:
```env
CLIMATIQ_API_KEY=your_climatiq_api_key_here
```

**Benefits:**
- 1000+ real emission activities
- Scientific data sources (DEFRA, EPA, IEA)
- Regional variations (US, UK, EU, etc.)
- Regular updates

**Get API Key:**
1. Sign up at [climatiq.io](https://www.climatiq.io/)
2. Navigate to API Keys in dashboard
3. Copy your key to `.env`

### Without API Key (Fallback)

If no API key is configured:
- System uses local `emission_factors` table
- Shows activities already in database
- Still generates challenge templates
- Alert indicates "Using local database"

---

## Example Workflows

### 🚗 Transport Challenge

**Search:** "car"

**Selected Activity:**
- Name: "Passenger car, gasoline, medium size"
- Factor: 0.404 kg CO2e per mile
- Region: US

**Generated Challenge (Daily Limit):**
```
Name: Daily Car Usage Limit
Description: Keep your daily car usage emissions under 4.0 kg CO2e
Type: daily_limit
Target: 4.04 kg CO2e (allows ~10 miles/day)
Duration: 7 days
Badge: Car Saver
```

### 🥩 Diet Challenge

**Search:** "beef"

**Selected Activity:**
- Name: "Beef (red meat)"
- Factor: 27.0 kg CO2e per kg
- Region: Global

**Generated Challenge (Total Limit):**
```
Name: Weekly Beef Challenge
Description: Limit total beef consumption to 1350.0 kg CO2e this week
Type: total_limit
Target: 1350.0 kg CO2e (allows ~50kg beef/week)
Duration: 7 days
Badge: Beef Warrior
```

### ⚡ Energy Challenge

**Search:** "electricity"

**Selected Activity:**
- Name: "Electricity, grid average"
- Factor: 0.385 kg CO2e per kWh
- Region: US

**Generated Challenge (Activity Count):**
```
Name: Track Electricity
Description: Log 15 electricity usage activities to build awareness
Type: activity_count
Target: 15 activities
Duration: 14 days
Badge: Electricity Tracker
```

---

## Technical Details

### Backend Endpoints

#### `POST /api/admin/climatiq-search`
Search for activities from Climatiq API or local database.

**Request:**
```json
{
  "query": "car",
  "category": "transport"
}
```

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": "passenger_vehicle-vehicle_type_car-fuel_source_gasoline",
      "name": "Passenger car, gasoline",
      "category": "transport",
      "co2e_per_unit": 0.404,
      "unit": "kg per mile",
      "region": "US",
      "source": "climatiq",
      "description": "Medium-size gasoline passenger vehicle"
    }
  ],
  "fallback": false
}
```

#### `POST /api/admin/generate-challenge`
Generate challenge templates from activity data.

**Request:**
```json
{
  "activity_id": "passenger_vehicle-...",
  "activity_name": "Passenger car, gasoline",
  "co2e_per_unit": 0.404,
  "unit": "kg per mile",
  "category": "transport"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "suggestions": {
      "daily_limit": { /* template */ },
      "weekly_total": { /* template */ },
      "monthly_total": { /* template */ },
      "activity_tracker": { /* template */ }
    },
    "activity_info": { /* selected activity */ }
  }
}
```

### Frontend Components

**File:** `frontend/js/admin-activity-generator.js`

**Key Functions:**
- `initActivityGenerator()` - Adds "Generate from Activity" button to challenge form
- `searchClimatiqActivities()` - Fetches activities from API
- `displayActivityResults()` - Shows search results with emission factors
- `selectActivity()` - Generates challenge templates for selected activity
- `useChallengeSuggestion()` - Fills challenge form with template

---

## Benefits

### ✅ For Admins
- **Faster Challenge Creation** - No manual target calculations
- **Scientific Accuracy** - Based on real emission data
- **Variety** - 4 template types per activity
- **Flexibility** - Can still customize after generation

### ✅ For Users
- **Realistic Targets** - Challenges based on actual emission factors
- **Clear Context** - Know exactly what activity is targeted
- **Achievable Goals** - Targets calculated from reasonable usage patterns

---

## Best Practices

### 1. **Start with High-Impact Activities**
Focus on activities with high emission factors:
- 🥩 Red meat (27 kg CO2e/kg)
- ✈️ Air travel (0.255 kg CO2e/mile)
- 🚗 Gasoline cars (0.404 kg CO2e/mile)

### 2. **Create Progressive Challenges**
- **Week 1**: Activity tracking (build awareness)
- **Week 2**: Daily limits (develop habits)
- **Week 3**: Total limits (challenge mastery)

### 3. **Adjust Targets Based on Region**
- US users: Higher baseline emissions
- EU users: Lower baseline (better public transport)
- Adjust multipliers accordingly

### 4. **Test Challenges Yourself**
Before publishing:
- Join the challenge as a test user
- Log some activities
- Verify progress updates correctly

---

## Troubleshooting

### "Climatiq API key not configured"
**Solution:** Add `CLIMATIQ_API_KEY=your_key` to `backend/.env`

### "No activities found"
**Solution:** Try different search terms:
- Instead of "driving", try "car" or "vehicle"
- Instead of "food", try specific items like "beef" or "chicken"

### Generated targets seem too high/low
**Solution:** Targets are calculated as:
- Daily: factor × 10 units
- Weekly: factor × 50 units
- Monthly: factor × 200 units

Adjust the multipliers in `generate-challenge` endpoint if needed.

### Search is slow
**Solution:** 
- Climatiq API can take 1-2 seconds
- Local database fallback is instant
- Results are limited to 20 activities for performance

---

## Future Enhancements

- [ ] Save favorite activities for quick access
- [ ] Category-specific target multipliers
- [ ] Regional emission factor adjustments
- [ ] Bulk challenge generation
- [ ] Activity comparison tool
- [ ] Historical emission trends integration

---

## Related Documentation

- [CHALLENGES_SYSTEM.md](./CHALLENGES_SYSTEM.md) - Full challenge system overview
- [TARGET_BASED_CHALLENGES.md](./TARGET_BASED_CHALLENGES.md) - Migration from reduction-based
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Complete API reference
