const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const challengeController = require('../controllers/challengeController');
const dailyChallengeController = require('../controllers/dailyChallengeController');

// All challenge routes require authentication
router.use(authenticate);

// User-facing challenge endpoints
router.get('/challenges', challengeController.listChallenges);
router.post('/challenges/:id/join', challengeController.joinChallenge);
router.get('/my/challenges', challengeController.getMyChallenges);
router.post('/my/challenges/:id/progress', challengeController.updateProgress);
router.get('/my/xp', challengeController.getMyXp);

// Daily challenge tracking endpoints
router.get('/my/challenges-with-days', dailyChallengeController.getMyChallengesWithDays);
router.get('/my/challenges/:id/days', dailyChallengeController.getChallengeWithDays);
router.post('/my/challenges/:id/log-day', dailyChallengeController.logDailyProgress);

module.exports = router;
