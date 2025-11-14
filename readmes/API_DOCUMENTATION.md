# CarbonPlay-API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication

All scenario endpoints require authentication using JWT tokens.

### Headers
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

---

## Scenarios API

### 1. Create Scenario
Create a new carbon footprint scenario.

**Endpoint:** `POST /scenarios`

**Request Body:**
```json
{
  "name": "My Daily Commute",
  "description": "Comparing different transportation methods"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Scenario created successfully",
  "data": {
    "id": 1,
    "name": "My Daily Commute",
    "description": "Comparing different transportation methods",
    "total_co2e": 0,
    "activities": [],
    "created_at": "2025-10-08T12:00:00.000Z"
  }
}
```

### 2. Get All User Scenarios
Retrieve all scenarios for the authenticated user.

**Endpoint:** `GET /scenarios`

**Query Parameters:**
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "name": "My Daily Commute",
      "description": "Comparing different transportation methods",
      "total_co2e": 45.67,
      "vs_baseline": 0.00,
      "is_active": 1,
      "created_at": "2025-10-08T12:00:00.000Z",
      "updated_at": "2025-10-08T12:30:00.000Z",
      "activities": [
        {
          "id": 1,
          "category": "transport",
          "activity_type": "car_gasoline",
          "value": 20,
          "unit": "miles",
          "co2e_amount": 8.08,
          "api_source": "default"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "pages": 1
  }
}
```

### 3. Get Single Scenario
Retrieve a specific scenario by ID.

**Endpoint:** `GET /scenarios/:scenarioId`

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "My Daily Commute",
    "description": "Comparing different transportation methods",
    "total_co2e": 45.67,
    "activities": [...]
  }
}
```

### 4. Delete Scenario
Soft delete a scenario (marks as inactive).

**Endpoint:** `DELETE /scenarios/:scenarioId`

**Response:**
```json
{
  "status": "success",
  "message": "Scenario deleted successfully"
}
```

---

## Activities API

### 1. Add Activity to Scenario
Add a new activity to an existing scenario.

**Endpoint:** `POST /scenarios/:scenarioId/activities`

**Request Body:**
```json
{
  "category": "transport",
  "activity_type": "car_gasoline",
  "value": 20,
  "unit": "miles"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Activity added successfully",
  "data": {
    "id": 1,
    "scenario_id": 1,
    "category": "transport",
    "activity_type": "car_gasoline",
    "value": 20,
    "unit": "miles",
    "co2e_amount": 8.080,
    "api_source": "default",
    "scenario_total": 8.080
  }
}
```

### 2. Update Activity
Update an existing activity's value and unit.

**Endpoint:** `PUT /activities/:activityId`

**Request Body:**
```json
{
  "value": 25,
  "unit": "miles"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Activity updated successfully",
  "data": {
    "id": 1,
    "value": 25,
    "unit": "miles",
    "co2e_amount": 10.100,
    "api_source": "default",
    "scenario_total": 10.100
  }
}
```

### 3. Delete Activity
Remove an activity from a scenario.

**Endpoint:** `DELETE /activities/:activityId`

**Response:**
```json
{
  "status": "success",
  "message": "Activity deleted successfully",
  "data": {
    "scenario_total": 0.000
  }
}
```

---

## Utility APIs

### 1. Get Emission Factors
Retrieve all available activity types organized by category.

**Endpoint:** `GET /emission-factors`

**Response:**
```json
{
  "status": "success",
  "data": {
    "transport": [
      {
        "activity_type": "car_gasoline",
        "unit": "miles",
        "display_name": "Car Gasoline"
      },
      {
        "activity_type": "bus",
        "unit": "miles",
        "display_name": "Bus"
      }
    ],
    "diet": [
      {
        "activity_type": "beef",
        "unit": "kg",
        "display_name": "Beef"
      }
    ]
  }
}
```

### 2. Calculate Emissions Preview
Calculate CO₂e emissions for an activity without saving to database.

**Endpoint:** `POST /calculate-preview`

**Request Body:**
```json
{
  "category": "diet",
  "activity_type": "beef",
  "value": 0.5,
  "unit": "kg"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "category": "diet",
    "activity_type": "beef",
    "value": 0.5,
    "unit": "kg",
    "co2e_amount": 13.500,
    "source": "default"
  }
}
```

---

## Supported Activities

### Transport Category
| Activity Type | Unit | Factor (kg CO₂e/unit) | Description |
|---------------|------|----------------------|-------------|
| car_gasoline | miles | 0.404 | Gasoline-powered vehicle |
| car_diesel | miles | 0.358 | Diesel-powered vehicle |
| bus | miles | 0.089 | Public bus transport |
| train | miles | 0.045 | Rail transport |
| bicycle | miles | 0.000 | Bicycle transport |
| walking | miles | 0.000 | Walking |
| motorcycle | miles | 0.279 | Motorcycle transport |
| flight_domestic | miles | 0.255 | Domestic air travel |
| flight_international | miles | 0.298 | International air travel |

### Diet Category
| Activity Type | Unit | Factor (kg CO₂e/unit) | Description |
|---------------|------|----------------------|-------------|
| beef | kg | 27.000 | Beef consumption |
| pork | kg | 12.100 | Pork consumption |
| chicken | kg | 6.900 | Chicken consumption |
| fish | kg | 6.100 | Fish consumption |
| lamb | kg | 39.200 | Lamb consumption |
| cheese | kg | 13.500 | Cheese consumption |
| eggs | kg | 4.200 | Egg consumption |
| milk | liters | 3.200 | Milk consumption |
| rice | kg | 2.700 | Rice consumption |
| vegetables | kg | 2.000 | Vegetable consumption |
| fruits | kg | 1.100 | Fruit consumption |

### Energy Category
| Activity Type | Unit | Factor (kg CO₂e/unit) | Description |
|---------------|------|----------------------|-------------|
| electricity | kwh | 0.385 | Electricity consumption |
| natural_gas | therms | 5.300 | Natural gas usage |
| heating_oil | gallons | 10.400 | Heating oil usage |
| propane | gallons | 5.700 | Propane usage |
| coal | kg | 2.420 | Coal usage |

### Waste Category
| Activity Type | Unit | Factor (kg CO₂e/unit) | Description |
|---------------|------|----------------------|-------------|
| landfill | kg | 0.570 | Landfill waste |
| recycling | kg | 0.020 | Recycling |
| composting | kg | 0.010 | Composting |

---

## Error Handling

### Error Response Format
```json
{
  "status": "error",
  "message": "Detailed error description"
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created successfully |
| 400 | Bad Request (validation errors) |
| 401 | Unauthorized (invalid/missing token) |
| 404 | Resource not found |
| 500 | Internal server error |

### Common Error Messages

**Authentication Errors:**
- `"You are not logged in. Please log in to access this resource."`
- `"Invalid token or authorization error."`
- `"The user belonging to this token no longer exists."`

**Validation Errors:**
- `"Scenario name is required and must be a non-empty string"`
- `"Invalid category. Must be one of: transport, diet, energy, waste"`
- `"Value must be a positive number"`
- `"Maximum number of scenarios reached (50)"`

**Resource Errors:**
- `"Scenario not found"`
- `"Activity not found"`
- `"Scenario not found or access denied"`

---

## Rate Limits

| Resource | Limit |
|----------|-------|
| Scenarios per user | 50 |
| Activities per scenario | 100 |
| API requests | No limit (recommended: 1000/hour) |

---

## Data Sources

The API uses multiple data sources with fallback logic:

1. **Local Database** (`emission_factors` table)
2. **Climatiq API** (when API key configured)
3. **Default Factors** (built-in fallback values)

The `api_source` field in responses indicates which source was used:
- `"database"` - Local database
- `"climatiq"` - Climatiq API
- `"default"` - Built-in fallback factors

---

## Examples

### Complete Workflow Example

```javascript
// 1. Create a scenario
const scenario = await fetch('/api/scenarios', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Work From Home vs Office',
    description: 'Comparing carbon footprint of remote work vs office commute'
  })
});

// 2. Add activities
const commute = await fetch(`/api/scenarios/${scenario.data.id}/activities`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    category: 'transport',
    activity_type: 'car_gasoline',
    value: 40,
    unit: 'miles'
  })
});

const homeEnergy = await fetch(`/api/scenarios/${scenario.data.id}/activities`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    category: 'energy',
    activity_type: 'electricity',
    value: 8,
    unit: 'kwh'
  })
});

// 3. Get updated scenario
const updatedScenario = await fetch(`/api/scenarios/${scenario.data.id}`, {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

console.log('Total emissions:', updatedScenario.data.total_co2e, 'kg CO₂e');
```

---

## Testing

Use the provided test suite to verify API functionality:

```bash
cd backend
node test-scenarios.js
```

Or test individual endpoints using curl:

```bash
# Get emission factors
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/emission-factors

# Create scenario
curl -X POST \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Scenario","description":"Testing API"}' \
     http://localhost:3000/api/scenarios

# Calculate preview
curl -X POST \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"category":"transport","activity_type":"car_gasoline","value":10,"unit":"miles"}' \
     http://localhost:3000/api/calculate-preview
```