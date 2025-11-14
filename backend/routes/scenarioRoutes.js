const express = require('express');
const router = express.Router();
const scenarioController = require('../controllers/scenarioController');
const { authenticate } = require('../middlewares/auth');

// Public user-side endpoints (no auth required)
router.get('/global-intensity', scenarioController.getGlobalIntensity);
router.get('/country-emissions', scenarioController.getCountryEmissions);

// All other scenario routes require authentication
router.use(authenticate);

// Scenario CRUD operations
router.post('/scenarios', scenarioController.createScenario);
router.get('/scenarios', scenarioController.getScenarios);
router.get('/scenarios/:scenarioId', scenarioController.getScenario);
router.delete('/scenarios/:scenarioId', scenarioController.deleteScenario);

// Activity operations
router.post('/scenarios/:scenarioId/activities', scenarioController.addActivity);
router.put('/activities/:activityId', scenarioController.updateActivity);
router.delete('/activities/:activityId', scenarioController.deleteActivity);
// Mark activity finished
router.post('/activities/:activityId/finish', scenarioController.finishActivity);

// Utility endpoints
router.get('/emission-factors', scenarioController.getEmissionFactors);
router.post('/calculate-preview', scenarioController.calculatePreview);
router.get('/leaderboard', scenarioController.getLeaderboard);
router.post('/social/motivation', scenarioController.getCarbonMotivation);
router.post('/social/chat', scenarioController.carbonChat);
router.get('/stats/summary', scenarioController.getUserStats);
router.get('/stats/weekly-chart', scenarioController.getWeeklyChart);
router.get('/stats/weekly-comparison', scenarioController.getWeeklyComparison);
// (moved above) Public user-side endpoints are defined before authenticate
// User report (JSON + PDF)
router.get('/me/report', scenarioController.getMyReport);
router.get('/me/report/pdf', scenarioController.getMyReportPdf);

module.exports = router;
