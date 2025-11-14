const express = require('express');
const router = express.Router();
const socialController = require('../controllers/socialController');
const { authenticate } = require('../middlewares/auth');

// All social routes require authentication
router.use(authenticate);

// Milestone likes
router.post('/likes/milestone', socialController.toggleMilestoneLike);
router.get('/likes/milestone', socialController.getMilestoneLikes);

// Milestones feed
router.get('/milestones', socialController.getMilestones);

// Tips
router.post('/tips', socialController.createTip);
router.get('/tips', socialController.getTips);
router.post('/likes/tip', socialController.toggleTipLike);

module.exports = router;
