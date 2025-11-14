const db = require('../config/database');
const axios = require('axios');

const CLIMATIQ_API_BASE = 'https://api.climatiq.io';

// Validation schemas for different activity categories
const ACTIVITY_SCHEMAS = {
  transport: {
    car_gasoline: { unit: 'miles', factor: 0.404 },
    car_diesel: { unit: 'miles', factor: 0.358 },
    bus: { unit: 'miles', factor: 0.089 },
    train: { unit: 'miles', factor: 0.045 },
    // Use small non-zero defaults to account for indirect emissions (food energy etc.)
    bicycle: { unit: 'miles', factor: 0.026 },
    walking: { unit: 'miles', factor: 0.080 },
    motorcycle: { unit: 'miles', factor: 0.279 },
    flight_domestic: { unit: 'miles', factor: 0.255 },
    flight_international: { unit: 'miles', factor: 0.298 }
  },
  diet: {
    beef: { unit: 'kg', factor: 27.0 },
    pork: { unit: 'kg', factor: 12.1 },
    chicken: { unit: 'kg', factor: 6.9 },
    fish: { unit: 'kg', factor: 6.1 },
    lamb: { unit: 'kg', factor: 39.2 },
    cheese: { unit: 'kg', factor: 13.5 },
    eggs: { unit: 'kg', factor: 4.2 },
    milk: { unit: 'liters', factor: 3.2 },
    rice: { unit: 'kg', factor: 2.7 },
    vegetables: { unit: 'kg', factor: 2.0 },
    fruits: { unit: 'kg', factor: 1.1 }
  },
  energy: {
    electricity: { unit: 'kwh', factor: 0.385 },
    natural_gas: { unit: 'therms', factor: 5.3 },
    heating_oil: { unit: 'gallons', factor: 10.4 },
    propane: { unit: 'gallons', factor: 5.7 },
    coal: { unit: 'kg', factor: 2.42 }
  },
  waste: {
    landfill: { unit: 'kg', factor: 0.57 },
    recycling: { unit: 'kg', factor: 0.02 },
    composting: { unit: 'kg', factor: 0.01 }
  }
};

// Get emission factor from local database or fallback
const getEmissionFactor = async (category, activityType, region = 'global') => {
  try {
    // Try database first
    const [factors] = await db.query(
      'SELECT * FROM emission_factors WHERE category = ? AND activity_type = ? AND (region = ? OR region = "global") ORDER BY region DESC',
      [category, activityType, region]
    );
    
    if (factors.length > 0) {
      const dbFactor = Number(factors[0].co2e_per_unit);
      const schema = ACTIVITY_SCHEMAS[category]?.[activityType];
      // If DB factor is positive, use it. If it's missing/zero but schema has positive, prefer schema.
      if (!isNaN(dbFactor) && dbFactor > 0) {
        return {
          co2e_per_unit: dbFactor,
          unit: factors[0].unit || (schema?.unit || ''),
          source: factors[0].source || 'database'
        };
      }
      if (schema && typeof schema.factor === 'number' && schema.factor > 0) {
        return {
          co2e_per_unit: schema.factor,
          unit: schema.unit,
          source: 'default'
        };
      }
      // Fallback to DB entry even if zero to avoid surprises for intentional zeros
      return {
        co2e_per_unit: dbFactor || 0,
        unit: factors[0].unit || (schema?.unit || ''),
        source: factors[0].source || 'database'
      };
    }

    // Fallback to predefined factors
    const schema = ACTIVITY_SCHEMAS[category]?.[activityType];
    if (schema) {
      return {
        co2e_per_unit: schema.factor,
        unit: schema.unit,
        source: 'default'
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching emission factor:', error);
    return null;
  }
};

// Calculate emissions using Climatiq API with retry logic
const calculateEmissionsFromAPI = async (category, activityType, value, unit, retries = 2) => {
  if (!process.env.Climatiq_api_key) {
    console.warn('Climatiq API key not configured');
    return null;
  }

  try {
    const response = await axios.post(`${CLIMATIQ_API_BASE}/estimate`, {
      emission_factor: {
        category: category,
        activity_id: activityType,
        region: 'US'
      },
      parameters: {
        [unit]: value
      }
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.Climatiq_api_key}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      co2e: response.data.co2e,
      source: 'climatiq'
    };
  } catch (error) {
    if (retries > 0 && error.code !== 'ECONNREFUSED') {
      console.log(`Retrying Climatiq API call... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return calculateEmissionsFromAPI(category, activityType, value, unit, retries - 1);
    }
    
    console.error('Climatiq API error:', error.response?.data || error.message);
    return null;
  }
};

// Main emissions calculation function
const KM_TO_MILES = 0.621371; // exact enough for activity calculations

const calculateActivityEmissions = async (category, activityType, value, unit) => {
  // Input validation
  if (!category || !activityType || !value || !unit) {
    throw new Error('Missing required parameters for emissions calculation');
  }

  if (value <= 0) {
    throw new Error('Value must be greater than 0');
  }

  // Get emission factor
  const factor = await getEmissionFactor(category, activityType);

  if (factor) {
    // Harmonize units: allow input in km for transport factors defined per mile
    let effectiveValue = value;
    if (category === 'transport') {
      const inUnit = String(unit).trim().toLowerCase();
      const baseUnit = String(factor.unit).trim().toLowerCase();
      if (inUnit === 'km' && baseUnit === 'miles') {
        effectiveValue = value * KM_TO_MILES; // convert km → miles for per-mile factor
      }
    }

    const co2e = effectiveValue * factor.co2e_per_unit;
    return {
      co2e: parseFloat(co2e.toFixed(3)),
      source: factor.source,
      unit_used: factor.unit
    };
  }

  // Try API as backup
  // As a fallback, call API with compatible units (convert km → miles for transport)
  let apiValue = value;
  let apiUnit = unit;
  if (category === 'transport') {
    const inUnit = String(unit).trim().toLowerCase();
    if (inUnit === 'km') {
      apiValue = value * KM_TO_MILES;
      apiUnit = 'miles';
    }
  }
  const apiResult = await calculateEmissionsFromAPI(category, activityType, apiValue, apiUnit);
  if (apiResult) {
    return {
      co2e: parseFloat(apiResult.co2e.toFixed(3)),
      source: apiResult.source,
      unit_used: unit
    };
  }

  throw new Error(`Emission factor not found for ${category}/${activityType}`);
};

// Validate scenario data
const validateScenarioData = (data) => {
  const { name, description = '' } = data;
  
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Scenario name is required and must be a non-empty string');
  }

  if (name.trim().length > 100) {
    throw new Error('Scenario name must be 100 characters or less');
  }

  if (description && description.length > 500) {
    throw new Error('Description must be 500 characters or less');
  }

  return {
    name: name.trim(),
    description: description.trim()
  };
};

// Validate activity data
const validateActivityData = (data) => {
  const { category, activity_type, value, unit } = data;
  
  const validCategories = Object.keys(ACTIVITY_SCHEMAS);
  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
  }

  const validActivityTypes = Object.keys(ACTIVITY_SCHEMAS[category]);
  if (!validActivityTypes.includes(activity_type)) {
    throw new Error(`Invalid activity type for ${category}. Must be one of: ${validActivityTypes.join(', ')}`);
  }

  const parsedValue = parseFloat(value);
  if (isNaN(parsedValue) || parsedValue <= 0) {
    throw new Error('Value must be a positive number');
  }

  if (parsedValue > 1000000) {
    throw new Error('Value is too large');
  }

  if (!unit || typeof unit !== 'string') {
    throw new Error('Unit is required');
  }

  return {
    category,
    activity_type,
    value: parsedValue,
    unit: unit.trim()
  };
};

// Create a new scenario
exports.createScenario = async (req, res) => {
  try {
    const validatedData = validateScenarioData(req.body);
    const userId = req.user.id;

    // Check scenario limit (max 50 per user)
    const [existingScenarios] = await db.query(
      'SELECT COUNT(*) as count FROM scenarios WHERE user_id = ? AND is_active = 1',
      [userId]
    );

    if (existingScenarios[0].count >= 50) {
      return res.status(400).json({
        status: 'error',
        message: 'Maximum number of scenarios reached (50). Please delete some scenarios first.'
      });
    }

    const [result] = await db.query(
      'INSERT INTO scenarios (user_id, name, description) VALUES (?, ?, ?)',
      [userId, validatedData.name, validatedData.description]
    );

    res.status(201).json({
      status: 'success',
      message: 'Scenario created successfully',
      data: {
        id: result.insertId,
        name: validatedData.name,
        description: validatedData.description,
        total_co2e: 0,
        activities: [],
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Create scenario error:', error);
    
    if (error.message.includes('required') || error.message.includes('Invalid') || error.message.includes('must be')) {
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'An error occurred while creating the scenario'
    });
  }
};

// Add activity to scenario
exports.addActivity = async (req, res) => {
  try {
    const { scenarioId } = req.params;
    const { category, activity_type, value, unit } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!category || !activity_type || !value || !unit) {
      return res.status(400).json({
        status: 'error',
        message: 'All activity fields are required'
      });
    }

    if (value <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Value must be greater than 0'
      });
    }

    // Check if scenario exists and belongs to user
    const [scenarios] = await db.query(
      'SELECT * FROM scenarios WHERE id = ? AND user_id = ?',
      [scenarioId, userId]
    );

    if (scenarios.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Scenario not found'
      });
    }

    // Calculate emissions
    const emissions = await calculateActivityEmissions(category, activity_type, value, unit);

    // Add activity to scenario
    const [activityResult] = await db.query(
      'INSERT INTO scenario_activities (scenario_id, category, activity_type, value, unit, co2e_amount, api_source) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [scenarioId, category, activity_type, value, unit, emissions.co2e, emissions.source]
    );

    // Update scenario total
    await db.query(
      'UPDATE scenarios SET total_co2e = (SELECT COALESCE(SUM(co2e_amount), 0) FROM scenario_activities WHERE scenario_id = ?) WHERE id = ?',
      [scenarioId, scenarioId]
    );

    // Get updated scenario
    const [updatedScenario] = await db.query(
      'SELECT * FROM scenarios WHERE id = ?',
      [scenarioId]
    );

    res.status(201).json({
      status: 'success',
      message: 'Activity added successfully',
      data: {
        id: activityResult.insertId,
        scenario_id: scenarioId,
        category,
        activity_type,
        value,
        unit,
        co2e_amount: emissions.co2e,
        api_source: emissions.source,
        scenario_total: updatedScenario[0].total_co2e
      }
    });
  } catch (error) {
    console.error('Add activity error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while adding the activity'
    });
  }
};

// Get user's scenarios
exports.getScenarios = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Get scenarios with pagination
    const [scenarios] = await db.query(
      'SELECT * FROM scenarios WHERE user_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );

    // Get total count for pagination info
    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM scenarios WHERE user_id = ? AND is_active = 1',
      [userId]
    );

    // Get activities for each scenario
    for (const scenario of scenarios) {
      const [activities] = await db.query(
        'SELECT * FROM scenario_activities WHERE scenario_id = ? ORDER BY created_at ASC',
        [scenario.id]
      );
      scenario.activities = activities;
    }

    res.status(200).json({
      status: 'success',
      data: scenarios,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        pages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Get scenarios error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching scenarios'
    });
  }
};

// Get single scenario
exports.getScenario = async (req, res) => {
  try {
    const { scenarioId } = req.params;
    const userId = req.user.id;

    const [scenarios] = await db.query(
      'SELECT * FROM scenarios WHERE id = ? AND user_id = ?',
      [scenarioId, userId]
    );

    if (scenarios.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Scenario not found'
      });
    }

    const scenario = scenarios[0];

    // Get activities
    const [activities] = await db.query(
      'SELECT * FROM scenario_activities WHERE scenario_id = ? ORDER BY created_at ASC',
      [scenarioId]
    );

    scenario.activities = activities;

    res.status(200).json({
      status: 'success',
      data: scenario
    });
  } catch (error) {
    console.error('Get scenario error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching the scenario'
    });
  }
};

// Update activity
exports.updateActivity = async (req, res) => {
  try {
    const { activityId } = req.params;
    const { value, unit } = req.body;
    const userId = req.user.id;

    if (!value || !unit || value <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid value and unit are required'
      });
    }

    // Check if activity exists and belongs to user's scenario
    const [activities] = await db.query(
      `SELECT sa.*, s.user_id FROM scenario_activities sa 
       JOIN scenarios s ON sa.scenario_id = s.id 
       WHERE sa.id = ? AND s.user_id = ?`,
      [activityId, userId]
    );

    if (activities.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Activity not found'
      });
    }

    const activity = activities[0];

    // Recalculate emissions
    const emissions = await calculateActivityEmissions(
      activity.category,
      activity.activity_type,
      value,
      unit
    );

    // Update activity
    await db.query(
      'UPDATE scenario_activities SET value = ?, unit = ?, co2e_amount = ?, api_source = ? WHERE id = ?',
      [value, unit, emissions.co2e, emissions.source, activityId]
    );

    // Update scenario total
    await db.query(
      'UPDATE scenarios SET total_co2e = (SELECT COALESCE(SUM(co2e_amount), 0) FROM scenario_activities WHERE scenario_id = ?) WHERE id = ?',
      [activity.scenario_id, activity.scenario_id]
    );

    // Get updated scenario total
    const [updatedScenario] = await db.query(
      'SELECT total_co2e FROM scenarios WHERE id = ?',
      [activity.scenario_id]
    );

    res.status(200).json({
      status: 'success',
      message: 'Activity updated successfully',
      data: {
        id: activityId,
        value,
        unit,
        co2e_amount: emissions.co2e,
        api_source: emissions.source,
        scenario_total: updatedScenario[0].total_co2e
      }
    });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while updating the activity'
    });
  }
};

// Delete activity
exports.deleteActivity = async (req, res) => {
  try {
    const { activityId } = req.params;
    const userId = req.user.id;

    // Check if activity exists and belongs to user's scenario
    const [activities] = await db.query(
      `SELECT sa.scenario_id FROM scenario_activities sa 
       JOIN scenarios s ON sa.scenario_id = s.id 
       WHERE sa.id = ? AND s.user_id = ?`,
      [activityId, userId]
    );

    if (activities.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Activity not found'
      });
    }

    const scenarioId = activities[0].scenario_id;

    // Delete activity
    await db.query('DELETE FROM scenario_activities WHERE id = ?', [activityId]);

    // Update scenario total
    await db.query(
      'UPDATE scenarios SET total_co2e = (SELECT COALESCE(SUM(co2e_amount), 0) FROM scenario_activities WHERE scenario_id = ?) WHERE id = ?',
      [scenarioId, scenarioId]
    );

    // Get updated scenario total
    const [updatedScenario] = await db.query(
      'SELECT total_co2e FROM scenarios WHERE id = ?',
      [scenarioId]
    );

    res.status(200).json({
      status: 'success',
      message: 'Activity deleted successfully',
      data: {
        scenario_total: updatedScenario[0].total_co2e
      }
    });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while deleting the activity'
    });
  }
};

// Delete scenario
exports.deleteScenario = async (req, res) => {
  try {
    const { scenarioId } = req.params;
    const userId = req.user.id;

    // Check if scenario exists and belongs to user
    const [scenarios] = await db.query(
      'SELECT * FROM scenarios WHERE id = ? AND user_id = ?',
      [scenarioId, userId]
    );

    if (scenarios.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Scenario not found'
      });
    }

    // Soft delete (mark as inactive)
    await db.query(
      'UPDATE scenarios SET is_active = 0 WHERE id = ?',
      [scenarioId]
    );

    res.status(200).json({
      status: 'success',
      message: 'Scenario deleted successfully'
    });
  } catch (error) {
    console.error('Delete scenario error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while deleting the scenario'
    });
  }
};

// Get available emission factors/activities
exports.getEmissionFactors = async (req, res) => {
  try {
    // Return predefined activity schemas for consistency
    const factorsWithUnits = {};
    
    for (const [category, activities] of Object.entries(ACTIVITY_SCHEMAS)) {
      factorsWithUnits[category] = Object.entries(activities).map(([activityType, schema]) => ({
        activity_type: activityType,
        unit: schema.unit,
        display_name: activityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }));
    }

    res.status(200).json({
      status: 'success',
      data: factorsWithUnits
    });
  } catch (error) {
    console.error('Get emission factors error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching emission factors'
    });
  }
};

// Calculate real-time emissions preview
exports.calculatePreview = async (req, res) => {
  try {
    const validatedData = validateActivityData(req.body);
    
    const emissions = await calculateActivityEmissions(
      validatedData.category,
      validatedData.activity_type,
      validatedData.value,
      validatedData.unit
    );

    res.status(200).json({
      status: 'success',
      data: {
        category: validatedData.category,
        activity_type: validatedData.activity_type,
        value: validatedData.value,
        unit: validatedData.unit,
        co2e_amount: emissions.co2e,
        source: emissions.source
      }
    });
  } catch (error) {
    console.error('Calculate preview error:', error);
    
    if (error.message.includes('required') || error.message.includes('Invalid') || error.message.includes('must be')) {
      return res.status(400).json({
        status: 'error',
        message: error.message
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'An error occurred while calculating emissions'
    });
  }
};

// Get leaderboard data
exports.getLeaderboard = async (req, res) => {
  try {
    const type = req.query.type || 'scenarios'; // 'scenarios' or 'reduction'
    const limit = parseInt(req.query.limit) || 10;

    let leaderboardData = [];

    if (type === 'scenarios') {
      // Leaderboard by number of scenarios created
      const [results] = await db.query(`
        SELECT 
          u.id,
          u.username,
          up.profile_picture,
          COUNT(s.id) as scenario_count,
          COALESCE(SUM(s.total_co2e), 0) as total_emissions,
          COALESCE(AVG(s.total_co2e), 0) as avg_emissions
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN scenarios s ON u.id = s.user_id AND s.is_active = 1
        GROUP BY u.id, u.username, up.profile_picture
        HAVING scenario_count > 0
        ORDER BY scenario_count DESC, total_emissions ASC
        LIMIT ?
      `, [limit]);

      leaderboardData = results.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        profile_picture: user.profile_picture || null,
        metric: user.scenario_count,
        metricLabel: 'scenarios',
        secondaryMetric: parseFloat(Number(user.avg_emissions).toFixed(1)),
        secondaryLabel: 'avg CO₂e',
        badge: getBadgeForRank(index + 1, 'scenarios')
      }));

    } else if (type === 'reduction') {
      // Leaderboard by lowest carbon footprint (best performers)
      const [results] = await db.query(`
        SELECT 
          u.id,
          u.username,
          up.profile_picture,
          COUNT(s.id) as scenario_count,
          COALESCE(SUM(s.total_co2e), 0) as total_emissions,
          COALESCE(AVG(s.total_co2e), 0) as avg_emissions
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN scenarios s ON u.id = s.user_id AND s.is_active = 1
        GROUP BY u.id, u.username, up.profile_picture
        HAVING scenario_count >= 1
        ORDER BY avg_emissions ASC, scenario_count DESC
        LIMIT ?
      `, [limit]);

      leaderboardData = results.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        profile_picture: user.profile_picture || null,
        metric: parseFloat(Number(user.avg_emissions).toFixed(1)),
        metricLabel: 'avg CO₂e',
        secondaryMetric: user.scenario_count,
        secondaryLabel: 'scenarios',
        badge: getBadgeForRank(index + 1, 'reduction')
      }));

    } else if (type === 'activities') {
      // Leaderboard by number of activities tracked
      const [results] = await db.query(`
        SELECT 
          u.id,
          u.username,
          up.profile_picture,
          COUNT(sa.id) as activity_count,
          COUNT(DISTINCT s.id) as scenario_count,
          COALESCE(SUM(sa.co2e_amount), 0) as total_emissions
        FROM users u
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN scenarios s ON u.id = s.user_id AND s.is_active = 1
        LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
        GROUP BY u.id, u.username, up.profile_picture
        HAVING activity_count > 0
        ORDER BY activity_count DESC, scenario_count DESC
        LIMIT ?
      `, [limit]);

      leaderboardData = results.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        profile_picture: user.profile_picture || null,
        metric: user.activity_count,
        metricLabel: 'activities',
        secondaryMetric: user.scenario_count,
        secondaryLabel: 'scenarios',
        badge: getBadgeForRank(index + 1, 'activities')
      }));
    } else if (type === 'eco_saver') {
      // Country leaderboard by lowest total emissions (aggregate across users)
      const [results] = await db.query(
        `
        SELECT 
          up.country AS country,
          COUNT(DISTINCT u.id) AS user_count,
          COUNT(DISTINCT s.id) AS scenario_count,
          COUNT(sa.id) AS activity_count,
          COALESCE(SUM(sa.co2e_amount), 0) AS total_emissions
        FROM user_profiles up
        LEFT JOIN users u ON u.id = up.user_id
        LEFT JOIN scenarios s ON u.id = s.user_id AND s.is_active = 1
        LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
        GROUP BY up.country
        HAVING activity_count > 0
        ORDER BY total_emissions ASC, user_count DESC
        LIMIT ?
      `,
        [limit]
      );

      // Map country to username field for frontend display without changes
      leaderboardData = results.map((row, index) => ({
        rank: index + 1,
        username: row.country, // display country code as the main label
        profile_picture: null,
        metric: parseFloat(Number(row.total_emissions).toFixed(1)),
        metricLabel: 'CO₂e total',
        secondaryMetric: row.user_count,
        secondaryLabel: 'users',
        country: row.country,
        badge: getBadgeForRank(index + 1, 'eco_saver')
      }));
    }

    res.status(200).json({
      status: 'success',
      data: {
        type,
        leaderboard: leaderboardData,
        updated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while fetching leaderboard data'
    });
  }
};

// Simple social milestones feed
exports.getMilestones = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const currentUserId = req.user.id;

    const [rows] = await db.query(`
      SELECT 
        u.id,
        u.username,
        up.profile_picture,
        COUNT(DISTINCT s.id) AS scenario_count,
        COUNT(sa.id) AS activity_count,
        COALESCE(AVG(s.total_co2e), 0) AS avg_emissions,
        COALESCE(SUM(sa.co2e_amount), 0) AS total_emissions,
        MAX(COALESCE(sa.created_at, s.updated_at, s.created_at)) AS last_update
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN scenarios s ON u.id = s.user_id AND s.is_active = 1
      LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
      GROUP BY u.id, u.username, up.profile_picture
      ORDER BY last_update DESC
      LIMIT ?
    `, [limit]);

    // Get like counts and current user's likes
    const [likeCounts] = await db.query(`
      SELECT milestone_user_id, COUNT(*) as count 
      FROM social_likes 
      GROUP BY milestone_user_id
    `);

    const [userLikes] = await db.query(
      'SELECT milestone_user_id FROM social_likes WHERE user_id = ?',
      [currentUserId]
    );

    const likeCountMap = {};
    likeCounts.forEach(l => {
      likeCountMap[l.milestone_user_id] = l.count;
    });

    const likedUserIds = userLikes.map(l => l.milestone_user_id);

    const feed = rows.map((u) => {
      const avg = Number(u.avg_emissions) || 0;
      const scenarios = Number(u.scenario_count) || 0;
      const activities = Number(u.activity_count) || 0;

      const milestones = [];
      if (scenarios >= 1) milestones.push({ id: 'first_scenario', label: 'First Scenario' });
      if (scenarios >= 5) milestones.push({ id: 'five_scenarios', label: '5 Scenarios' });
      if (activities >= 10) milestones.push({ id: 'ten_activities', label: '10 Activities' });
      if (avg > 0 && avg < 100) milestones.push({ id: 'low_avg', label: 'Avg CO₂e < 100' });

      return {
        user: { 
          id: u.id, 
          username: u.username,
          profile_picture: u.profile_picture
        },
        stats: {
          scenarios,
          activities,
          avg_emissions: parseFloat(avg.toFixed(1))
        },
        milestones,
        last_update: u.last_update,
        like_count: likeCountMap[u.id] || 0,
        liked: likedUserIds.includes(u.id)
      };
    });

    res.status(200).json({
      status: 'success',
      data: {
        feed,
        updated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get milestones error:', error);
    res.status(500).json({ status: 'error', message: 'An error occurred while fetching milestones' });
  }
};

// Get quick user stats summary for dashboard
const { getXpWithLevel, xpToLevel } = require('../utils/xp');

exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all counts in parallel; each promise resolves to the rows array
    const [scRows, actRows, badgeRows, xpDetails] = await Promise.all([
      db.query('SELECT COUNT(*) AS scenarios_count FROM scenarios WHERE user_id = ? AND is_active = 1', [userId]).then(r => r[0]),
      db.query(`SELECT COUNT(sa.id) AS activities_count
                FROM scenarios s LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
               WHERE s.user_id = ? AND s.is_active = 1`, [userId]).then(r => r[0]),
      db.query('SELECT COUNT(*) AS badges_count FROM user_challenges WHERE user_id = ? AND completed = 1', [userId]).then(r => r[0]),
      getXpWithLevel(userId, 500)
    ]);

    const scenarios = Number(scRows?.[0]?.scenarios_count ?? 0);
    const activities = Number(actRows?.[0]?.activities_count ?? 0);
    const badges = Number(badgeRows?.[0]?.badges_count ?? 0);
    const xpInfo = xpDetails || xpToLevel(0, 500);

    res.json({
      status: 'success',
      data: {
        scenarios,
        activities,
        badges,
        xp_total: xpInfo.xp_total,
        level: xpInfo.level,
        level_size: xpInfo.level_size,
        xp_in_level: xpInfo.xp_in_level,
        xp_to_next: xpInfo.xp_to_next,
        xp_progress_pct: xpInfo.xp_progress_pct
      }
    });
  } catch (e) {
    console.error('getUserStats error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load stats' });
  }
};

// Get last 7 days of daily carbon emissions for chart
exports.getWeeklyChart = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query(`
      SELECT 
        DATE(sa.created_at) as day,
        COALESCE(SUM(sa.co2e_amount), 0) as daily_co2e
      FROM scenario_activities sa
      INNER JOIN scenarios s ON sa.scenario_id = s.id
      WHERE s.user_id = ? 
        AND s.is_active = 1
        AND sa.created_at >= (NOW() - INTERVAL 7 DAY)
      GROUP BY DATE(sa.created_at)
      ORDER BY day ASC
    `, [userId]);

    // Build 7-day labels
    const labels = [];
    const values = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      labels.push(dayName);
      const found = rows.find(r => r.day && r.day.toISOString().split('T')[0] === dayStr);
      values.push(found ? Number(found.daily_co2e || 0) : 0);
    }

    res.json({ status: 'success', data: { labels, values } });
  } catch (e) {
    console.error('getWeeklyChart error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load chart data' });
  }
};

// Return last 7 days: user daily totals vs community average daily totals
exports.getWeeklyComparison = async (req, res) => {
  try {
    const userId = req.user.id;

    // User per-day totals
    const [userRows] = await db.query(`
      SELECT DATE(sa.created_at) AS day, COALESCE(SUM(sa.co2e_amount), 0) AS total
        FROM scenario_activities sa
        INNER JOIN scenarios s ON sa.scenario_id = s.id
       WHERE s.user_id = ?
         AND s.is_active = 1
         AND sa.created_at >= (CURDATE() - INTERVAL 6 DAY)
       GROUP BY DATE(sa.created_at)
       ORDER BY day ASC
    `, [userId]);

    // Community per-day average (average of users' totals per day)
    const [commRows] = await db.query(`
      SELECT day, AVG(user_total) AS avg_total FROM (
        SELECT DATE(sa.created_at) AS day, s.user_id, COALESCE(SUM(sa.co2e_amount),0) AS user_total
          FROM scenarios s
          LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
            AND sa.created_at >= (CURDATE() - INTERVAL 6 DAY)
         WHERE s.is_active = 1
         GROUP BY s.user_id, DATE(sa.created_at)
      ) t
      WHERE day IS NOT NULL
      GROUP BY day
      ORDER BY day ASC
    `);

    // Build 7-day labels
    const labels = [];
    const userValues = [];
    const communityValues = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      labels.push(dayName);
      const u = userRows.find(r => r.day && r.day.toISOString().split('T')[0] === dayStr);
      const c = commRows.find(r => r.day && r.day.toISOString().split('T')[0] === dayStr);
      userValues.push(u ? Number(u.total || 0) : 0);
      communityValues.push(c ? Number(c.avg_total || 0) : 0);
    }

    res.json({ status: 'success', data: { labels, userValues, communityValues } });
  } catch (e) {
    console.error('getWeeklyComparison error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load weekly comparison' });
  }
};

// Helper function to get badges for rankings
const getBadgeForRank = (rank, type) => {
  const badges = {
    scenarios: {
      1: { icon: 'fas fa-crown', color: '#FFD700', title: 'Scenario Master' },
      2: { icon: 'fas fa-medal', color: '#C0C0C0', title: 'Scenario Expert' },
      3: { icon: 'fas fa-award', color: '#CD7F32', title: 'Scenario Pro' }
    },
    reduction: {
      1: { icon: 'fas fa-leaf', color: '#28a745', title: 'Eco Champion' },
      2: { icon: 'fas fa-seedling', color: '#20c997', title: 'Green Warrior' },
      3: { icon: 'fas fa-tree', color: '#6f42c1', title: 'Carbon Saver' }
    },
    activities: {
      1: { icon: 'fas fa-fire', color: '#dc3545', title: 'Activity King' },
      2: { icon: 'fas fa-bolt', color: '#fd7e14', title: 'Data Tracker' },
      3: { icon: 'fas fa-star', color: '#ffc107', title: 'Active User' }
    },
    eco_saver: {
      1: { icon: 'fas fa-shield', color: '#2ecc71', title: 'Eco Saver' },
      2: { icon: 'fas fa-recycle', color: '#27ae60', title: 'Carbon Minder' },
      3: { icon: 'fas fa-leaf', color: '#1abc9c', title: 'Green Steward' }
    }
  };

  if (rank <= 3 && badges[type] && badges[type][rank]) {
    return badges[type][rank];
  }

  return {
    icon: 'fas fa-user',
    color: '#6c757d',
    title: 'Participant'
  };
};

// Generate motivational message via Gemini (fallback to local if no API key)
exports.getCarbonMotivation = async (req, res) => {
  try {
    const userId = req.user.id;
    const provided = req.body?.userCarbonData;

    // Compute user's last 7 days emissions if not provided
    let [userRows] = [null];
    let userWeekly = null;
    if (typeof provided === 'number') {
      userWeekly = provided;
    } else {
      [userRows] = await db.query(`
        SELECT COALESCE(SUM(sa.co2e_amount), 0) AS weekly
        FROM scenario_activities sa
        INNER JOIN scenarios s ON sa.scenario_id = s.id
        WHERE s.user_id = ? 
          AND s.is_active = 1
          AND sa.created_at >= (NOW() - INTERVAL 7 DAY)
      `, [userId]);
      userWeekly = Number(userRows[0]?.weekly || 0);
    }

    // Community average (last 7 days per user)
    const [avgRows] = await db.query(`
      SELECT AVG(user_total) AS community_avg FROM (
        SELECT s.user_id, COALESCE(SUM(sa.co2e_amount), 0) AS user_total
        FROM scenarios s
        LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
          AND sa.created_at >= (NOW() - INTERVAL 7 DAY)
        WHERE s.is_active = 1
        GROUP BY s.user_id
      ) t
    `);
    const communityAvg = Number(avgRows[0]?.community_avg || 0);

    // Classification for fallback and prompt context
    const classify = (val, avg) => {
      if (avg <= 0) return 'medium';
      if (val <= 0.8 * avg) return 'low';
      if (val >= 1.2 * avg) return 'high';
      return 'medium';
    };

    const level = classify(userWeekly, communityAvg);

    // Try Gemini if configured
    let message = '';
    const apiKey = process.env.Gemini_api_key;
    if (apiKey) {
      try {
        const axios = require('axios');
        const model = 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const prompt = `User's carbon emission this week: ${userWeekly.toFixed(1)} kg CO₂. Community average: ${communityAvg.toFixed(1)} kg CO₂. In 1-2 sentences: 1) Say if this is low, medium, or high vs average (use the words low/medium/high), 2) Suggest a realistic goal for next week with a number, 3) Encourage them to improve or maintain habits. Keep it friendly and concise.`;

        const body = {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ]
        };

        const resp = await axios.post(url, body, { timeout: 10000 });
        const txt = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt && typeof txt === 'string') {
          message = txt.trim();
        }
      } catch (e) {
        // Fall back if Gemini fails
        message = '';
      }
    }

    if (!message) {
      // Fallback local generation
      const goal = level === 'low' ? Math.max(0, userWeekly * 0.95) :
                   level === 'medium' ? userWeekly * 0.9 : userWeekly * 0.85;
      const goalStr = `${goal.toFixed(1)} kg CO₂`;
      const prefix = `You're ${level} compared to the community average (${communityAvg.toFixed(1)} kg CO₂).`;
      const suggestion = `Aim for around ${goalStr} next week with one or two small changes (e.g., swap a short drive for a walk or trim meat at a meal).`;
      const encouragement = level === 'low'
        ? 'Great work—keep the momentum and maintain your habits!'
        : 'You’ve got this—small, steady steps add up quickly!';
      message = `${prefix} ${suggestion} ${encouragement}`;
    }

    res.status(200).json({
      status: 'success',
      data: {
        message,
        userWeekly: Number(userWeekly.toFixed(1)),
        communityAvg: Number(communityAvg.toFixed(1)),
        level
      }
    });
  } catch (error) {
    console.error('getCarbonMotivation error:', error);
    res.status(500).json({ status: 'error', message: 'Unable to generate motivation right now' });
  }
};

// Carbon-focused chat using Gemini with strict topical guardrails
exports.carbonChat = async (req, res) => {
  try {
    const userId = req.user.id;
  const { message = '', mode = 'qa' } = req.body || {};

    const text = String(message || '').trim();
    if (!text) return res.status(400).json({ status: 'error', message: 'Message is required' });

  // Topical guard with expanded synonyms and units
  const topicRegex = /(carbon|carbon dioxide|co2e|co₂e|co2|co₂|emission|footprints?|greenhouse|ghg|climate( change)?|energy|electric(ity| vehicle| car)?|ev|hybrid|natural gas|propane|heating( oil)?|diesel|gasoline|petrol|coal|diet|meat|beef|pork|chicken|lamb|fish|vegan|vegetarian|plant[- ]?based|rice|milk|cheese|eggs|transport|commute|car|bus|train|bicycle|bike|walking|motorcycle|flight|flights|plane|airplane|aviation|waste|garbage|trash|landfill|recycl(e|ing)|compost|kwh|mile(s)?|km|kilometer(s)?|gallon(s)?|liter(s)?|kg|kilogram(s)?)/i;
  const numericUnitRegex = /\b\d+(\.\d+)?\s*(kwh|mile(s)?|km|kilometer(s)?|kg|kilogram(s)?|gallon(s)?|liter(s)?|minutes?|hours?)\b/i;
  const onTopic = topicRegex.test(text) || numericUnitRegex.test(text);
    if (!onTopic && mode === 'qa') {
      return res.status(200).json({
        status: 'success',
        data: {
          reply: "I only answer questions about carbon emissions, footprints, and related actions. Try asking about your CO₂e, activities, or ways to reduce it.",
          mode: 'qa',
          guarded: true,
          source: 'guard'
        }
      });
    }

    // Personal context for tips mode
    let userWeekly = null;
    let scenarios = 0;
    let activities = 0;
    try {
      const [[wRow]] = await Promise.all([
        db.query(`
          SELECT COALESCE(SUM(sa.co2e_amount), 0) AS weekly
            FROM scenarios s
            LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
              AND sa.created_at >= (NOW() - INTERVAL 7 DAY)
           WHERE s.user_id = ? AND s.is_active = 1`, [userId]
        )
      ]);
      userWeekly = Number(wRow?.[0]?.weekly || 0);

      const [[scCount]] = await db.query('SELECT COUNT(*) AS c FROM scenarios WHERE user_id = ? AND is_active = 1', [userId]);
      scenarios = Number(scCount?.[0]?.c || 0);
      const [[actCount]] = await db.query(`SELECT COUNT(sa.id) AS c
        FROM scenarios s LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
       WHERE s.user_id = ? AND s.is_active = 1`, [userId]);
      activities = Number(actCount?.[0]?.c || 0);
    } catch (_) { /* best-effort */ }

  const apiKey = process.env.Gemini_api_key;
    const baseGuard = `You are CarbonBot, a helpful assistant that ONLY answers about carbon emissions (CO₂e), carbon footprints, and evidence-based ways to reduce emissions across transport, diet, home energy, and waste. If the user asks about unrelated topics, politely refuse and redirect to emissions. Keep responses concise (2-6 sentences). Use kg CO₂e where applicable.`;

    const modeInstructions = mode === 'tips'
      ? `User context (approximate): weekly_co2e=${(userWeekly ?? 0).toFixed(1)} kg; scenarios=${scenarios}; activities=${activities}. Provide personalized, practical tips grounded in these numbers. If numbers are near 0 or unknown, give general beginner tips.`
      : `Q&A mode: Provide accurate, friendly explanations, with simple comparisons and 1-2 actionable suggestions when relevant.`;

  const topicTag = mode === 'tips' ? '[Topic: Personalized Carbon Tips]' : '[Topic: Carbon Emissions Q&A]';
  // Prefix the user content so the model is explicitly anchored to carbon topic
  const prefixedUser = `Carbon emission — ${text}`;
  const finalPrompt = `${baseGuard}\n\n${modeInstructions}\n${topicTag}\n\nUser: ${prefixedUser}`;

    let reply = '';
    let usedSource = 'fallback';
    let failReason = '';
    if (apiKey) {
      try {
        const axios = require('axios');
        // Preferred model/version (use Gemini 2.x models available in free tier)
        const preferredVersion = (process.env.GEMINI_API_VERSION || 'v1beta').trim();
        const preferredModel = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

        // Build ordered, de-duplicated try lists (free tier: v1beta + gemini 2.x models)
        const versions = [preferredVersion, 'v1beta'].filter((v, i, a) => v && a.indexOf(v) === i);
        const models = [preferredModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest']
          .filter((m, i, a) => m && a.indexOf(m) === i);
        const body = {
          contents: [
            { role: 'user', parts: [{ text: finalPrompt }] }
          ],
          generationConfig: { temperature: 0.3 }
        };

        let success = false;
        for (const ver of versions) {
          if (success) break;
          for (const model of models) {
            const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`;
            try {
              const resp = await axios.post(url, body, { timeout: 12000 });
              const cand = resp.data?.candidates?.[0];
              const parts = cand?.content?.parts || [];
              const joined = parts.map(p => (typeof p.text === 'string' ? p.text : '')).join('\n').trim();
              if (joined) {
                reply = joined;
                usedSource = `gemini (${model}/${ver})`;
                success = true;
                break;
              }
            } catch (e1) {
              // continue trying next model/version; capture last error
              failReason = e1.response?.data || e1.message || 'unknown error';
            }
          }
        }

        if (!success) reply = '';
      } catch (e) {
        failReason = e.response?.data || e.message || 'unknown error';
        reply = '';
      }
    }

    if (!reply) {
      // Fallback deterministic response
      if (mode === 'tips') {
        const w = Number(userWeekly || 0);
        const goal = w > 0 ? Math.max(0, w * 0.9) : 5;
        reply = `Based on your recent week (~${w.toFixed(1)} kg CO₂e), aim for ~${goal.toFixed(1)} kg next week. Try one transport swap (walk/bike for a short trip), a meat-light meal (swap beef for legumes), and turn off standby devices. Small changes add up.`;
      } else {
        reply = `I can help with carbon emissions and footprints—ask about your activities (transport, diet, energy, waste) and how they translate to kg CO₂e, or how to reduce them.`;
      }
    }

    // As a final guard, if the text was off-topic in QA, prepend a brief reminder
    if (!onTopic && mode === 'qa') {
      reply = `Let’s stay on carbon emissions. ${reply}`;
    }

    if (usedSource !== 'gemini' && failReason) {
      console.warn('Gemini fallback reason:', failReason);
    }
  res.status(200).json({ status: 'success', data: { reply, mode, guarded: !onTopic, source: usedSource } });
  } catch (error) {
    console.error('carbonChat error:', error);
    res.status(500).json({ status: 'error', message: 'Unable to process chat right now' });
  }
};

// ===================== USER REPORT (JSON + PDF) =====================
const { generatePdfFromHtml } = require('../utils/pdfGenerator');

exports.getMyReport = async (req, res) => {
  try {
    const userId = req.user.id;
    // Parallel queries for efficiency
    const [weeklyRows, allRows, catWeeklyRows, catAllRows, scCountRows, actCountRows, userRows] = await Promise.all([
      db.query(`
        SELECT COALESCE(SUM(sa.co2e_amount), 0) AS total
          FROM scenarios s
          LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
           AND sa.created_at >= (NOW() - INTERVAL 7 DAY)
         WHERE s.user_id = ? AND s.is_active = 1
      `, [userId]).then(r => r[0]),
      db.query(`
        SELECT COALESCE(SUM(sa.co2e_amount), 0) AS total
          FROM scenarios s
          LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
         WHERE s.user_id = ? AND s.is_active = 1
      `, [userId]).then(r => r[0]),
      db.query(`
        SELECT sa.category, COALESCE(SUM(sa.co2e_amount),0) AS total
          FROM scenarios s
          LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
           AND sa.created_at >= (NOW() - INTERVAL 7 DAY)
         WHERE s.user_id = ? AND s.is_active = 1
         GROUP BY sa.category
      `, [userId]).then(r => r[0]),
      db.query(`
        SELECT sa.category, COALESCE(SUM(sa.co2e_amount),0) AS total
          FROM scenarios s
          LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
         WHERE s.user_id = ? AND s.is_active = 1
         GROUP BY sa.category
      `, [userId]).then(r => r[0]),
      db.query('SELECT COUNT(*) AS c FROM scenarios WHERE user_id = ? AND is_active = 1', [userId]).then(r => r[0]),
      db.query(`SELECT COUNT(sa.id) AS c
                 FROM scenarios s LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
                WHERE s.user_id = ? AND s.is_active = 1`, [userId]).then(r => r[0]),
      db.query('SELECT id, username, email FROM users WHERE id = ?', [userId]).then(r => r[0])
    ]);

    const weekly = Number(weeklyRows?.[0]?.total || 0);
    const allTime = Number(allRows?.[0]?.total || 0);
    const byCatWeek = (catWeeklyRows || []).filter(r => r.category).map(r => ({ category: r.category, total: Number(r.total || 0) }));
    const byCatAll = (catAllRows || []).filter(r => r.category).map(r => ({ category: r.category, total: Number(r.total || 0) }));
    const scenarios = Number(scCountRows?.[0]?.c || 0);
    const activities = Number(actCountRows?.[0]?.c || 0);
    const user = userRows?.[0] || { id: userId, username: 'User' };

    return res.json({
      status: 'success',
      data: {
        user: { id: user.id, username: user.username, email: user.email },
        generated_at: new Date().toISOString(),
        weekly_total: Number(weekly.toFixed(1)),
        all_time_total: Number(allTime.toFixed(1)),
        categories_week: byCatWeek,
        categories_all: byCatAll,
        counts: { scenarios, activities }
      }
    });
  } catch (e) {
    console.error('getMyReport error', e);
    res.status(500).json({ status: 'error', message: 'Failed to build report' });
  }
};

exports.getMyReportPdf = async (req, res) => {
  try {
    const userId = req.user.id;
    // Reuse JSON builder to avoid duplication
    const fakeReq = { ...req };
    const summary = await (async () => {
      const [weeklyRows, allRows, catWeeklyRows, catAllRows, scCountRows, actCountRows, userRows] = await Promise.all([
        db.query(`
          SELECT COALESCE(SUM(sa.co2e_amount), 0) AS total
            FROM scenarios s
            LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
             AND sa.created_at >= (NOW() - INTERVAL 7 DAY)
           WHERE s.user_id = ? AND s.is_active = 1
        `, [userId]).then(r => r[0]),
        db.query(`
          SELECT COALESCE(SUM(sa.co2e_amount), 0) AS total
            FROM scenarios s
            LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
           WHERE s.user_id = ? AND s.is_active = 1
        `, [userId]).then(r => r[0]),
        db.query(`
          SELECT sa.category, COALESCE(SUM(sa.co2e_amount),0) AS total
            FROM scenarios s
            LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
             AND sa.created_at >= (NOW() - INTERVAL 7 DAY)
           WHERE s.user_id = ? AND s.is_active = 1
           GROUP BY sa.category
        `, [userId]).then(r => r[0]),
        db.query(`
          SELECT sa.category, COALESCE(SUM(sa.co2e_amount),0) AS total
            FROM scenarios s
            LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
           WHERE s.user_id = ? AND s.is_active = 1
           GROUP BY sa.category
        `, [userId]).then(r => r[0]),
        db.query('SELECT COUNT(*) AS c FROM scenarios WHERE user_id = ? AND is_active = 1', [userId]).then(r => r[0]),
        db.query(`SELECT COUNT(sa.id) AS c
                   FROM scenarios s LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
                  WHERE s.user_id = ? AND s.is_active = 1`, [userId]).then(r => r[0]),
        db.query('SELECT id, username, email FROM users WHERE id = ?', [userId]).then(r => r[0])
      ]);
      return {
        weekly: Number(weeklyRows?.[0]?.total || 0),
        allTime: Number(allRows?.[0]?.total || 0),
        byCatWeek: (catWeeklyRows || []).filter(r => r.category).map(r => ({ category: r.category, total: Number(r.total || 0) })),
        byCatAll: (catAllRows || []).filter(r => r.category).map(r => ({ category: r.category, total: Number(r.total || 0) })),
        scenarios: Number(scCountRows?.[0]?.c || 0),
        activities: Number(actCountRows?.[0]?.c || 0),
        user: userRows?.[0] || { id: userId, username: 'User' }
      };
    })();

  const dt = new Date();
    const dateStr = dt.toISOString().split('T')[0];

  // Local helper for category labels
  const capitalize = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

    // Basic professional layout with inline CSS (safe for Puppeteer)
    const css = `
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 24px; }
        .header { display:flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 16px; }
        .brand { font-size: 20px; font-weight: 700; color: #065f46; }
        .muted { color: #6b7280; font-size: 12px; }
        .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
        .card .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
        .card .value { font-size: 18px; font-weight: 700; color: #065f46; }
        h2 { font-size: 14px; margin: 18px 0 8px; color: #111827; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; }
        th { background: #f9fafb; text-align: left; }
        .right { text-align: right; }
        .footer { margin-top: 16px; font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; }
      </style>`;

    const row = (name, val) => `<tr><td>${name}</td><td class="right">${val.toFixed(1)} kg CO₂e</td></tr>`;

    const html = `
      <html><head><meta charset="utf-8"/>${css}</head>
      <body>
        <div class="header">
          <div class="brand">CarbonPlay — Personal Emissions Report</div>
          <div class="muted">Generated: ${dateStr}</div>
        </div>
        <div class="muted">User: ${summary.user.username}</div>

        <div class="cards">
          <div class="card"><div class="label">This Week</div><div class="value">${summary.weekly.toFixed(1)} kg CO₂e</div></div>
          <div class="card"><div class="label">All Time</div><div class="value">${summary.allTime.toFixed(1)} kg CO₂e</div></div>
          <div class="card"><div class="label">Scenarios / Activities</div><div class="value">${summary.scenarios} / ${summary.activities}</div></div>
        </div>

        <h2>Weekly by Category</h2>
        <table>
          <thead><tr><th>Category</th><th>Total</th></tr></thead>
          <tbody>
            ${(summary.byCatWeek.length ? summary.byCatWeek : [{category:'—',total:0}])
              .map(c => row(capitalize(c.category), c.total)).join('')}
          </tbody>
        </table>

        <h2>All Time by Category</h2>
        <table>
          <thead><tr><th>Category</th><th>Total</th></tr></thead>
          <tbody>
            ${(summary.byCatAll.length ? summary.byCatAll : [{category:'—',total:0}])
              .map(c => row(capitalize(c.category), c.total)).join('')}
          </tbody>
        </table>

        <div class="footer">CarbonPlay · Your guide to understanding and improving your carbon impact.</div>
      </body></html>
    `;

    const pdf = await generatePdfFromHtml(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CarbonPlay_Report_${summary.user.username || 'User'}_${dateStr}.pdf"`);
    return res.send(pdf);
  } catch (e) {
    console.error('getMyReportPdf error', e);
    res.status(500).json({ status: 'error', message: 'Failed to generate PDF' });
  }
};

// Mark a scenario activity as finished and send a simple email notification (best-effort)
exports.finishActivity = async (req, res) => {
  try {
    const userId = req.user.id;
    const activityId = parseInt(req.params.activityId, 10);
    if (!activityId) return res.status(400).json({ status: 'error', message: 'Invalid activity id' });

    // Ensure finished_at column exists for graceful rollout
    try {
      await db.query("ALTER TABLE scenario_activities ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP NULL DEFAULT NULL");
    } catch (_) { /* ignore non-critical */ }

    // Verify ownership and fetch details for email
    const [rows] = await db.query(
      `SELECT sa.*, s.name AS scenario_name, s.user_id, u.email, u.username
         FROM scenario_activities sa
         JOIN scenarios s ON s.id = sa.scenario_id
         JOIN users u ON u.id = s.user_id
        WHERE sa.id = ? AND s.user_id = ?`,
      [activityId, userId]
    );
    if (!rows.length) return res.status(404).json({ status: 'error', message: 'Activity not found' });
    const act = rows[0];

    // Update finished_at if not already set
    await db.query('UPDATE scenario_activities SET finished_at = COALESCE(finished_at, NOW()) WHERE id = ?', [activityId]);

    // Attempt to send an email; ignore failures so UX remains smooth
    try {
      const { loadTemplate } = require('../utils/emailService');
      const { sendMail } = require('../utils/mailer');
      const html = loadTemplate('activity_completion.html', {
        username: act.username || 'there',
        scenario: act.scenario_name || 'Your Scenario',
        activity_type: act.activity_type,
        category: act.category,
        value: String(act.value),
        unit: act.unit,
        co2e_amount: String(act.co2e_amount)
      });
      await sendMail({ to: act.email, subject: 'Nice work! Activity finished ✅', html });
    } catch (mailErr) {
      console.warn('finishActivity mail skipped/failed:', mailErr && mailErr.message ? mailErr.message : mailErr);
    }

    res.json({ status: 'success', message: 'Activity marked as finished' });
  } catch (e) {
    console.error('finishActivity error:', e);
    res.status(500).json({ status: 'error', message: 'Failed to finish activity' });
  }
};

// ===================== SIMPLE GLOBAL INTENSITY (for choropleth) =====================
// Returns electricity grid intensity (kg CO₂e per kWh) per country code using Climatiq.
// Falls back to local DB if the API key is missing or calls fail.
exports.getGlobalIntensity = async (req, res) => {
  try {
    const apiKey = process.env.CLIMATIQ_API_KEY;

    // Curated list of major emitters (ISO A2) to keep calls minimal yet useful
  const COUNTRIES = ['US','CN','IN','RU','JP','DE','IR','KR','SA','ID','CA','MX','BR','ZA','AU','TR','GB','IT','FR','PL','PH'];

    const useClimatiq = async () => {
      if (!apiKey) return null;
      const headers = { headers: { Authorization: `Bearer ${apiKey}` } };
      const activity_id = 'electricity-supply_grid-source_production_mix';
      const axios = require('axios');

      const calls = await Promise.all(COUNTRIES.map(async code => {
        try {
          const body = {
            emission_factor: { activity_id, data_version: '^0', region: code },
            parameters: { energy: 1, energy_unit: 'kwh' }
          };
          const resp = await axios.post('https://api.climatiq.io/data/v1/estimate', body, headers);
          const co2e = Number(resp.data?.co2e || 0);
          if (!isFinite(co2e) || co2e <= 0) return null;
          return { code, value: co2e };
        } catch (_) { return null; }
      }));

      const data = calls.filter(Boolean);
      if (!data.length) return null;
      const values = data.map(d => d.value);
      return {
        source: 'climatiq',
        data,
        summary: {
          count: data.length,
          min: Math.min(...values),
          max: Math.max(...values)
        },
        debug: {
          hasApiKey: true,
          requested: COUNTRIES,
          returned: data.map(d => d.code)
        }
      };
    };

    // Try Climatiq first
  const fromApi = await useClimatiq();
  if (fromApi) return res.json({ status: 'success', ...fromApi });

    // Fallback: local DB electricity-like rows
    const [rows] = await db.query(
      `SELECT region, co2e_per_unit
         FROM emission_factors
        WHERE (LOWER(category) LIKE '%energy%' OR LOWER(activity_type) LIKE '%electric%')
          AND co2e_per_unit IS NOT NULL`
    );
    const byRegion = new Map();
    for (const r of rows || []) {
      const region = String(r.region || '').trim();
      const val = Number(r.co2e_per_unit || 0);
      if (!region || !isFinite(val) || val <= 0) continue;
      const key = region.toUpperCase();
      if (key === 'GLOBAL' || key === 'WORLD') continue;
      if (!byRegion.has(key) || val < byRegion.get(key)) byRegion.set(key, val);
    }
    const data = Array.from(byRegion.entries()).map(([code, value]) => ({ code, value }));
    const values = data.map(d => d.value);
    const reason = apiKey ? 'api_failed' : 'no_api_key';
    return res.json({
      status: 'success',
      source: 'local',
      reason,
      data,
      summary: {
        count: data.length,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null
      },
      debug: {
        hasApiKey: !!apiKey,
        requested: COUNTRIES,
        returned: data.map(d => d.code)
      }
    });
  } catch (e) {
    console.error('getGlobalIntensity error:', e);
    return res.status(500).json({ status: 'error', message: 'Failed to load global intensity' });
  }
};

// ===================== COUNTRY TOTAL CO2 EMISSIONS (Primary: World Bank, Fallback: OWID) =====================
// Returns country-level total CO2 emissions (MtCO2) for a given year.
// Primary: World Bank indicator EN.ATM.CO2E.KT (kilotons) -> convert to MtCO2 by / 1000
// Fallback: OWID Grapher CSV (co2.csv)
// Both are cached in-memory for a few hours.
let __wbCache = { lastFetch: 0, rows: null, byYear: new Map(), meta: null };
let __owidCache = { lastFetch: 0, rows: null, byYear: new Map(), meta: null };

exports.getCountryEmissions = async (req, res) => {
  try {
    const requestedYear = parseInt(req.query.year || '0', 10);
  const preferSource = String(req.query.source || 'auto').toLowerCase(); // 'auto' | 'worldbank' | 'owid' | 'best'
    const now = Date.now();
    const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
    // World Bank API (kilotons): https://api.worldbank.org/v2/country/all/indicator/EN.ATM.CO2E.KT
    // We will convert KT -> MtCO2 by dividing by 1000.
    const wbBase = 'https://api.worldbank.org/v2/country/all/indicator/EN.ATM.CO2E.KT';

    // 1) Try World Bank first
    const fromWorldBank = async () => {
      try {
        const cacheKey = requestedYear || 'latest';
        if (__wbCache.byYear.has(cacheKey) && (now - __wbCache.lastFetch) <= TTL_MS) {
          const cached = __wbCache.byYear.get(cacheKey);
          return { ok: true, ...cached, source: 'worldbank' };
        }

        // Refresh WB rows cache if stale/empty
        if (!__wbCache.rows || (now - __wbCache.lastFetch) > TTL_MS) {
          // Use a wide date range to capture latest for each country
          const wbUrl = `${wbBase}?date=1960:2050&format=json&per_page=20000`;
          const wbResp = await axios.get(wbUrl, { timeout: 30000 });
          const wb = wbResp.data;
          const wbRows = Array.isArray(wb) && Array.isArray(wb[1]) ? wb[1] : [];
          // Normalize to rows { code, year, value(MtCO2) }
          const rows = [];
          for (const r of wbRows) {
            const code = String(r?.countryiso3code || '').toUpperCase();
            const year = Number(r?.date || 0);
            const valKT = r?.value; // in kilotons
            if (code.length !== 3 || !isFinite(year) || year <= 0) continue;
            if (typeof valKT !== 'number' || !isFinite(valKT) || valKT < 0) continue;
            const valMt = valKT / 1000;
            rows.push({ code, year, co2: valMt });
          }
          __wbCache.rows = rows;
          __wbCache.byYear.clear();
          __wbCache.lastFetch = Date.now();
          __wbCache.meta = { sourceUrl: wbUrl };
        }

        const rows = __wbCache.rows || [];
        if (!rows.length) return { ok: false };

        // Determine target year
        if (requestedYear > 0) {
          const byCodeYear = new Map(); // code -> best (<= requestedYear)
          for (const r of rows) {
            if (r.year > requestedYear) continue;
            const prev = byCodeYear.get(r.code);
            if (!prev || r.year > prev.year) byCodeYear.set(r.code, { year: r.year, co2: r.co2 });
          }
          const data = [];
          for (const [code, v] of byCodeYear.entries()) {
            if (!isFinite(v.co2) || v.co2 < 0) continue;
            data.push({ code, value: v.co2 });
          }
          const values = data.map(d => d.value);
          const summary = { count: data.length, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
          if (summary.count) {
            const payload = { year: requestedYear, data, summary };
            __wbCache.byYear.set(requestedYear, payload);
            return { ok: true, ...payload, source: 'worldbank' };
          }
          return { ok: false };
        }

        // Latest per country
        const byCodeLatest = new Map(); // code -> best latest
        let globalLatest = 0;
        for (const r of rows) {
          const prev = byCodeLatest.get(r.code);
          if (!prev || r.year > prev.year) byCodeLatest.set(r.code, { year: r.year, co2: r.co2 });
          if (r.year > globalLatest) globalLatest = r.year;
        }
        const data = [];
        for (const [code, v] of byCodeLatest.entries()) {
          if (!isFinite(v.co2) || v.co2 < 0) continue;
          data.push({ code, value: v.co2 });
        }
        const values = data.map(d => d.value);
        const summary = { count: data.length, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
        if (summary.count) {
          const payload = { year: globalLatest, data, summary };
          __wbCache.byYear.set('latest', payload);
          return { ok: true, ...payload, source: 'worldbank' };
        }
        return { ok: false };
      } catch (err) {
        return { ok: false };
      }
    };

    // Helper: OWID path wrapped as a function so we can force it
    const fromOwid = async () => {
      try {
        const sourceUrl = 'https://ourworldindata.org/grapher/co2.csv';
        // Refresh cache if empty or stale
        if (!__owidCache.rows || (now - __owidCache.lastFetch) > TTL_MS) {
          const resp = await axios.get(sourceUrl, {
            timeout: 30000,
            responseType: 'text',
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          });
          const csvText = String(resp.data || '');
          const splitCsvLine = (line) => {
            const out = [];
            let cur = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const ch = line[i];
              if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
                else { inQuotes = !inQuotes; }
              } else if (ch === ',' && !inQuotes) {
                out.push(cur); cur = '';
              } else { cur += ch; }
            }
            out.push(cur);
            return out;
          };
          const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
          const header = splitCsvLine(lines.shift() || '');
          const idxCode = header.indexOf('code');
          const idxYear = header.indexOf('year');
          const idxCo2 = header.indexOf('co2');
          if (idxCode === -1 || idxYear === -1 || idxCo2 === -1) throw new Error('Unexpected OWID CSV format');
          const rows = [];
          for (const line of lines) {
            const parts = splitCsvLine(line);
            const code = String(parts[idxCode] || '').trim().toUpperCase();
            const year = Number(parts[idxYear] || '');
            const co2 = Number(parts[idxCo2] || '');
            if (!code || code.length !== 3) continue;
            if (!isFinite(year) || year <= 0) continue;
            if (!isFinite(co2) || co2 < 0) continue;
            if (code.startsWith('OWID')) continue;
            rows.push({ code, year, co2 });
          }
          __owidCache.rows = rows;
          __owidCache.byYear.clear();
          __owidCache.lastFetch = Date.now();
          __owidCache.meta = { header, sourceUrl };
        }

        const cacheKey = requestedYear || 'latest';
        if (__owidCache.byYear.has(cacheKey)) {
          const cached = __owidCache.byYear.get(cacheKey);
          return { ok: true, unit: 'MtCO2', year: cached.year, data: cached.data, summary: cached.summary, debug: { cache: 'hit', yearRequested: requestedYear || null, sourceUrl: __owidCache.meta?.sourceUrl } };
        }

        const rows = __owidCache.rows || [];
        let globalLatest = 0;
        for (const r of rows) if (r.year > globalLatest) globalLatest = r.year;
        const targetYear = requestedYear > 0 ? requestedYear : globalLatest;
        const byCode = new Map();
        for (const r of rows) {
          if (r.year > targetYear) continue;
          const prev = byCode.get(r.code);
          if (!prev || r.year > prev.year) byCode.set(r.code, { year: r.year, co2: r.co2 });
        }
        const data = [];
        for (const [code, v] of byCode.entries()) { if (isFinite(v.co2) && v.co2 >= 0) data.push({ code, value: v.co2 }); }
        const values = data.map(d => d.value);
        const summary = { count: data.length, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
        __owidCache.byYear.set(cacheKey, { year: targetYear, data, summary });
        if (summary.count) {
          return { ok: true, unit: 'MtCO2', year: targetYear, data, summary, debug: { cache: 'miss', yearRequested: requestedYear || null, sourceUrl: __owidCache.meta?.sourceUrl, parsed: 'csv' } };
        }
        return { ok: false };
      } catch (_) {
        return { ok: false };
      }
    };

    // If user forces a particular source, honor it
    if (preferSource === 'worldbank') {
      const wbResult = await fromWorldBank();
      if (wbResult && wbResult.ok) {
        return res.json({ status: 'success', source: 'worldbank', unit: 'MtCO2', year: wbResult.year, data: wbResult.data, summary: wbResult.summary, debug: { cache: (__wbCache.byYear.has(requestedYear || 'latest') ? 'hit' : 'miss'), yearRequested: requestedYear || null, sourceUrl: __wbCache.meta?.sourceUrl, forced: 'worldbank' } });
      }
      const ow = await fromOwid();
      if (ow && ow.ok) return res.json({ status: 'success', source: 'owid', unit: ow.unit, year: ow.year, data: ow.data, summary: ow.summary, debug: { ...ow.debug, forcedFallback: 'owid' } });
      // fall through to static below
    } else if (preferSource === 'owid') {
      const ow = await fromOwid();
      if (ow && ow.ok) return res.json({ status: 'success', source: 'owid', unit: ow.unit, year: ow.year, data: ow.data, summary: ow.summary, debug: { ...ow.debug, forced: 'owid' } });
      const wbResult = await fromWorldBank();
      if (wbResult && wbResult.ok) {
        return res.json({ status: 'success', source: 'worldbank', unit: 'MtCO2', year: wbResult.year, data: wbResult.data, summary: wbResult.summary, debug: { cache: (__wbCache.byYear.has(requestedYear || 'latest') ? 'hit' : 'miss'), yearRequested: requestedYear || null, sourceUrl: __wbCache.meta?.sourceUrl, forcedFallback: 'worldbank' } });
      }
      // fall through to static
    } else if (preferSource === 'best') {
      // Fetch both and choose the one with the newest year; tie-break on count
      const [wbResult, ow] = await Promise.all([fromWorldBank(), fromOwid()]);
      const cand = [];
      if (wbResult && wbResult.ok) cand.push({ key: 'worldbank', year: wbResult.year, count: wbResult.summary?.count || 0, unit: 'MtCO2', data: wbResult.data, summary: wbResult.summary, debug: { cache: (__wbCache.byYear.has(requestedYear || 'latest') ? 'hit' : 'miss'), yearRequested: requestedYear || null, sourceUrl: __wbCache.meta?.sourceUrl, forced: 'best' } });
      if (ow && ow.ok) cand.push({ key: 'owid', year: ow.year, count: ow.summary?.count || 0, unit: ow.unit, data: ow.data, summary: ow.summary, debug: { ...ow.debug, forced: 'best' } });
      if (cand.length) {
        cand.sort((a,b) => (b.year||0) - (a.year||0) || (b.count||0) - (a.count||0));
        const pick = cand[0];
        return res.json({ status: 'success', source: pick.key, unit: pick.unit, year: pick.year, data: pick.data, summary: pick.summary, debug: pick.debug });
      }
      // fall through to static
    } else {
      // auto (default): try WB then OWID
      const wbResult = await fromWorldBank();
      if (wbResult && wbResult.ok) {
        return res.json({ status: 'success', source: 'worldbank', unit: 'MtCO2', year: wbResult.year, data: wbResult.data, summary: wbResult.summary, debug: { cache: (__wbCache.byYear.has(requestedYear || 'latest') ? 'hit' : 'miss'), yearRequested: requestedYear || null, sourceUrl: __wbCache.meta?.sourceUrl } });
      }
      const ow = await fromOwid();
      if (ow && ow.ok) return res.json({ status: 'success', source: 'owid', unit: ow.unit, year: ow.year, data: ow.data, summary: ow.summary, debug: ow.debug });
      // fall through
    }

    // If we reached here, both sources failed or were unavailable; fall back to static sample
    // (The original static fallback block remains)
  } catch (e) {
    console.error('getCountryEmissions error:', e);
    // Final static fallback (approximate top emitters MtCO2 values - illustrative, not exact)
    const staticData = [
      { code: 'CHN', value: 12000 },
      { code: 'USA', value: 5000 },
      { code: 'IND', value: 3000 },
      { code: 'RUS', value: 1700 },
      { code: 'JPN', value: 1100 },
      { code: 'DEU', value: 750 },
      { code: 'IRN', value: 700 },
      { code: 'CAN', value: 600 },
      { code: 'KOR', value: 610 },
      { code: 'IDN', value: 580 },
      { code: 'BRA', value: 520 },
      { code: 'SAU', value: 520 },
      { code: 'ZAF', value: 470 },
      { code: 'AUS', value: 400 },
      { code: 'GBR', value: 350 },
      { code: 'FRA', value: 320 },
      { code: 'TUR', value: 420 },
      { code: 'ITA', value: 300 },
      { code: 'POL', value: 300 },
      { code: 'PHL', value: 150 }
    ];
    const values = staticData.map(d => d.value);
    return res.json({
      status: 'success',
      source: 'static',
      unit: 'MtCO2',
      year: 2022, // Use a fixed recent year for static data
      data: staticData,
      summary: { count: staticData.length, min: Math.min(...values), max: Math.max(...values) },
      debug: { errorShort: e && e.message ? e.message : String(e), fallback: 'static' }
    });
  }
};
