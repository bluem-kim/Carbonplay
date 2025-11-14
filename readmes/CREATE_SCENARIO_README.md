# CarbonPlay-API: Create Scenario Feature

## Overview

The **Create Scenario** feature allows users to simulate different lifestyle scenarios and calculate their carbon footprint in real-time. Users can create scenarios, add various activities (transport, diet, energy, waste), and see immediate CO₂e emissions calculations.

## Features

### 1. Scenario Management
- ✅ Create new scenarios with name and description
- ✅ View all user scenarios with pagination
- ✅ Update scenario details
- ✅ Soft delete scenarios
- ✅ Scenario limit (max 50 per user)

### 2. Activity Management
- ✅ Add activities to scenarios across 4 categories:
  - **Transport**: Cars, buses, bikes, flights, etc.
  - **Diet**: Beef, chicken, vegetables, dairy, etc.
  - **Energy**: Electricity, gas, heating oil, etc.
  - **Waste**: Landfill, recycling, composting
- ✅ Real-time emissions preview as users type
- ✅ Update activity values and units
- ✅ Delete activities from scenarios
- ✅ Activity limit (max 100 per scenario)

### 3. Emissions Calculation
- ✅ Multiple data sources with fallback:
  1. Local database emission factors
  2. Climatiq API (when available)
  3. Predefined emission factors
- ✅ Automatic CO₂e calculation with 3-decimal precision
- ✅ Source tracking (database/API/default)
- ✅ Unit validation and conversion

### 4. Data Validation & Security
- ✅ Input validation for all endpoints
- ✅ User authentication required
- ✅ Scenario ownership verification
- ✅ SQL injection protection
- ✅ Error handling with meaningful messages

## API Endpoints

### Authentication Required
All scenario endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

### Scenarios

#### Create Scenario
```http
POST /api/scenarios
Content-Type: application/json

{
  "name": "My Daily Commute",
  "description": "Comparing car vs public transport options"
}
```

#### Get User Scenarios
```http
GET /api/scenarios?page=1&limit=20
```

#### Get Single Scenario
```http
GET /api/scenarios/:scenarioId
```

#### Delete Scenario
```http
DELETE /api/scenarios/:scenarioId
```

### Activities

#### Add Activity to Scenario
```http
POST /api/scenarios/:scenarioId/activities
Content-Type: application/json

{
  "category": "transport",
  "activity_type": "car_gasoline",
  "value": 20,
  "unit": "miles"
}
```

#### Update Activity
```http
PUT /api/activities/:activityId
Content-Type: application/json

{
  "value": 25,
  "unit": "miles"
}
```

#### Delete Activity
```http
DELETE /api/activities/:activityId
```

### Utility Endpoints

#### Get Available Activities
```http
GET /api/emission-factors
```

#### Calculate Emissions Preview
```http
POST /api/calculate-preview
Content-Type: application/json

{
  "category": "diet",
  "activity_type": "beef",
  "value": 0.5,
  "unit": "kg"
}
```

## Database Schema

### `scenarios` table
- `id` - Primary key
- `user_id` - Foreign key to users table
- `name` - Scenario name (max 100 chars)
- `description` - Optional description (max 500 chars)
- `total_co2e` - Calculated total emissions
- `vs_baseline` - Comparison to baseline (future feature)
- `is_active` - Soft delete flag
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### `scenario_activities` table
- `id` - Primary key
- `scenario_id` - Foreign key to scenarios table
- `category` - Activity category (transport/diet/energy/waste)
- `activity_type` - Specific activity
- `value` - Numeric value
- `unit` - Unit of measurement
- `co2e_amount` - Calculated CO₂e emissions
- `api_source` - Data source (database/climatiq/default)
- `created_at` - Creation timestamp

## Supported Activities

### Transport
- `car_gasoline` - Gasoline cars (miles)
- `car_diesel` - Diesel cars (miles)
- `bus` - Public bus (miles)
- `train` - Rail transport (miles)
- `bicycle` - Cycling (miles)
- `walking` - Walking (miles)
- `motorcycle` - Motorcycles (miles)
- `flight_domestic` - Domestic flights (miles)
- `flight_international` - International flights (miles)

### Diet
- `beef` - Beef consumption (kg)
- `pork` - Pork consumption (kg)
- `chicken` - Chicken consumption (kg)
- `fish` - Fish consumption (kg)
- `lamb` - Lamb consumption (kg)
- `cheese` - Cheese consumption (kg)
- `eggs` - Egg consumption (kg)
- `milk` - Milk consumption (liters)
- `rice` - Rice consumption (kg)
- `vegetables` - Vegetable consumption (kg)
- `fruits` - Fruit consumption (kg)

### Energy
- `electricity` - Electricity usage (kwh)
- `natural_gas` - Natural gas usage (therms)
- `heating_oil` - Heating oil usage (gallons)
- `propane` - Propane usage (gallons)
- `coal` - Coal usage (kg)

### Waste
- `landfill` - Landfill waste (kg)
- `recycling` - Recycling (kg)
- `composting` - Composting (kg)

## Frontend Implementation

### Scenario Management UI (`scenarios.html`)
- Interactive grid layout for scenarios
- Modal dialogs for creating scenarios
- Real-time emissions display
- Activity management within scenarios

### Key Frontend Features
- **Real-time Preview**: Shows CO₂e calculations as users type
- **Category-based Activity Selection**: Dropdown menus organized by category
- **Visual Feedback**: Loading states and error handling
- **Responsive Design**: Works on desktop and mobile
- **Data Validation**: Client-side validation before API calls

## Testing

### Automated Test Suite (`test-scenarios.js`)
Run the test suite to verify all functionality:

```bash
cd backend
node test-scenarios.js
```

The test suite covers:
- User registration/authentication
- Scenario creation and management
- Activity addition and calculation
- Emissions preview functionality
- Error handling scenarios

### Manual Testing Steps

1. **Setup Environment**:
   ```bash
   # Start MySQL database
   # Import database schema from backend/database/carbonplay.sql
   
   # Start the server
   cd backend
   npm install
   npm start
   ```

2. **Test User Flow**:
   - Register/login at `login.html`
   - Navigate to `scenarios.html`
   - Create a new scenario
   - Add various activities
   - Verify real-time calculations
   - Test different activity categories

3. **Test API Directly**:
   ```bash
   # Run the automated test suite
   node backend/test-scenarios.js
   ```

## Configuration

### Environment Variables (`.env`)
```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=carbonplay

# Climatiq API (optional)
Climatiq_api_key=your_api_key_here

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=24h

# Server
PORT=3000
```

### Dependencies
Key packages used:
- `express` - Web framework
- `mysql2` - Database connectivity
- `axios` - HTTP client for Climatiq API
- `jsonwebtoken` - JWT authentication
- `bcrypt` - Password hashing

## Error Handling

The API provides detailed error messages for:
- **Validation Errors**: Invalid input data
- **Authentication Errors**: Missing/invalid tokens
- **Authorization Errors**: Access denied
- **Resource Errors**: Not found scenarios/activities
- **Calculation Errors**: Unable to calculate emissions
- **Rate Limits**: Too many scenarios/activities

Example error response:
```json
{
  "status": "error",
  "message": "Invalid category. Must be one of: transport, diet, energy, waste"
}
```

## Performance Considerations

- **Database Indexing**: Indexes on user_id and scenario_id for fast queries
- **Connection Pooling**: MySQL connection pool for concurrent requests
- **Transaction Support**: Database transactions for data consistency
- **API Retry Logic**: Automatic retries for external API calls
- **Caching**: Emission factors cached in memory
- **Pagination**: Scenarios paginated for large datasets

## Security Features

- **JWT Authentication**: Secure user sessions
- **Input Validation**: All inputs validated and sanitized
- **SQL Injection Protection**: Parameterized queries
- **Rate Limiting**: Per-user scenario/activity limits
- **Error Information**: No sensitive data in error messages
- **Ownership Verification**: Users can only access their own data

## Future Enhancements

1. **Baseline Comparison**: Compare scenarios to user's baseline
2. **Scenario Sharing**: Share scenarios with other users
3. **Bulk Import**: Import activities from CSV/Excel
4. **Advanced Analytics**: Charts and trend analysis
5. **Challenges Integration**: Link scenarios to carbon reduction challenges
6. **Mobile App**: Native mobile application
7. **API Rate Limiting**: Implement proper rate limiting
8. **Caching Layer**: Redis for improved performance

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Verify MySQL is running
   - Check database credentials in `.env`
   - Ensure database exists and schema is imported

2. **Authentication Errors**
   - Check JWT token is included in request headers
   - Verify token hasn't expired
   - Ensure JWT_SECRET is set correctly

3. **Climatiq API Errors**
   - API key not configured (falls back to local factors)
   - Rate limit exceeded (falls back to local factors)
   - Network connectivity issues (falls back to local factors)

4. **Calculation Errors**
   - Invalid activity type for category
   - Missing emission factors in database
   - Invalid input values (negative numbers, etc.)

### Debug Mode
Enable detailed logging by setting:
```env
NODE_ENV=development
```

This will provide more detailed error messages and stack traces.

---

## Summary

The Create Scenario feature provides a comprehensive carbon footprint simulation system with:
- ✅ Full CRUD operations for scenarios and activities
- ✅ Real-time emissions calculations
- ✅ Multiple data sources with intelligent fallbacks
- ✅ Robust validation and error handling
- ✅ Secure authentication and authorization
- ✅ Interactive frontend interface
- ✅ Comprehensive testing suite

The implementation follows senior developer best practices with proper error handling, input validation, database transactions, and clean code architecture.