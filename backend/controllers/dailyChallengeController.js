const db = require('../config/database');
const { addXp } = require('../utils/xp');

// XP rules: total cap depends on challenge duration. We award per completed day.
// 7 days = 300 XP, 14 days = 700 XP, 30 days = 1000 XP.
// Per-day XP = floor(totalXP / duration); remainder is granted on the final day
// to ensure the user reaches the exact maximum.
function getMaxXpForDuration(durationDays) {
  if (durationDays === 7) return 300;
  if (durationDays === 14) return 700;
  if (durationDays === 30) return 1000;
  // Fallback: scale to 1000 XP over 30 days proportionally (kept simple)
  // You can adjust this if you decide to support other fixed durations later.
  return Math.round((1000 / 30) * durationDays);
}

/**
 * Daily Challenge Tracking Controller
 * Handles day-by-day progress logging for challenges
 */

// Get challenge details with daily tracking status
exports.getChallengeWithDays = async (req, res) => {
  try {
    const userId = req.user.id;
    const userChallengeId = parseInt(req.params.id, 10);

    // Get user challenge info
    const [userChallenges] = await db.query(
      `SELECT uc.*, c.name, c.description, c.challenge_type, c.target_value, 
              c.target_unit, c.duration_days, c.badge_name,
              DATEDIFF(CURDATE(), uc.start_date) + 1 AS days_elapsed
       FROM user_challenges uc
       JOIN challenges c ON uc.challenge_id = c.id
       WHERE uc.id = ? AND uc.user_id = ?`,
      [userChallengeId, userId]
    );

    if (userChallenges.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Challenge not found' });
    }

    const userChallenge = userChallenges[0];
    const durationDays = userChallenge.duration_days;
    const daysElapsed = userChallenge.days_elapsed;

    // Calculate daily goal
    let dailyGoal = 0;
    if (userChallenge.challenge_type === 'daily_limit') {
      dailyGoal = parseFloat(userChallenge.target_value);
    } else if (userChallenge.challenge_type === 'total_limit') {
      dailyGoal = parseFloat(userChallenge.target_value) / durationDays;
    } else if (userChallenge.challenge_type === 'activity_count') {
      dailyGoal = Math.ceil(parseFloat(userChallenge.target_value) / durationDays);
    } else if (userChallenge.challenge_type === 'consecutive_days') {
      dailyGoal = parseFloat(userChallenge.target_value); // Daily limit for consecutive days
    }

    // Get all daily logs
    const [logs] = await db.query(
      `SELECT * FROM challenge_daily_logs 
       WHERE user_challenge_id = ? 
       ORDER BY day_number ASC`,
      [userChallengeId]
    );

    // Create day structure
    const days = [];
    for (let i = 1; i <= durationDays; i++) {
      const logDate = new Date(userChallenge.start_date);
      logDate.setDate(logDate.getDate() + (i - 1));
      
      const existingLog = logs.find(l => l.day_number === i);
      
      // Determine if day is unlocked
      // Current day is unlocked if it matches elapsed days
      // OR if previous day was completed
      const isCurrentDay = i === Math.min(daysElapsed, durationDays);
      const isPastDay = i < daysElapsed;
      const previousDayCompleted = i === 1 || logs.find(l => l.day_number === (i - 1) && l.is_completed);
      
      const isUnlocked = isPastDay || (isCurrentDay && (i === 1 || previousDayCompleted));
      const isFuture = i > daysElapsed;

      days.push({
        day_number: i,
        log_date: logDate.toISOString().split('T')[0],
        daily_goal: dailyGoal,
        value_logged: existingLog ? parseFloat(existingLog.value_logged) : null,
        notes: existingLog ? existingLog.notes : null,
        is_completed: existingLog ? existingLog.is_completed : 0,
        logged_at: existingLog ? existingLog.logged_at : null,
        is_unlocked: isUnlocked,
        is_current: isCurrentDay && !existingLog?.is_completed,
        is_future: isFuture,
        status: existingLog?.is_completed 
          ? 'completed' 
          : (isUnlocked ? 'unlocked' : 'locked')
      });
    }

    // Calculate overall progress
    const completedDays = logs.filter(l => l.is_completed).length;
    const totalLogged = logs.reduce((sum, l) => sum + parseFloat(l.value_logged || 0), 0);
    const progressPercent = (completedDays / durationDays) * 100;

    res.json({
      status: 'success',
      data: {
        user_challenge: userChallenge,
        days: days,
        summary: {
          total_days: durationDays,
          completed_days: completedDays,
          current_day: Math.min(daysElapsed, durationDays),
          days_remaining: Math.max(0, durationDays - daysElapsed + 1),
          total_logged: totalLogged,
          target_value: parseFloat(userChallenge.target_value),
          progress_percent: progressPercent,
          daily_goal: dailyGoal
        }
      }
    });
  } catch (error) {
    console.error('getChallengeWithDays error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load challenge days' });
  }
};

// Log data for a specific day
exports.logDailyProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const userChallengeId = parseInt(req.params.id, 10);
    const { day_number, value_logged, notes } = req.body;

    if (!day_number || value_logged === undefined) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'day_number and value_logged are required' 
      });
    }

    // Verify ownership and get challenge details
    const [userChallenges] = await db.query(
      `SELECT uc.*, c.duration_days, c.challenge_type, c.target_value, c.badge_name,
              DATEDIFF(CURDATE(), uc.start_date) + 1 AS days_elapsed
       FROM user_challenges uc
       JOIN challenges c ON uc.challenge_id = c.id
       WHERE uc.id = ? AND uc.user_id = ?`,
      [userChallengeId, userId]
    );

    if (userChallenges.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Challenge not found' });
    }

    const userChallenge = userChallenges[0];
    const daysElapsed = userChallenge.days_elapsed;

    // Validate day_number
    if (day_number < 1 || day_number > userChallenge.duration_days) {
      return res.status(400).json({ status: 'error', message: 'Invalid day number' });
    }

    // Check if day is unlocked (current day or previous day was completed)
    const isCurrentDay = day_number === Math.min(daysElapsed, userChallenge.duration_days);
    const isPastDay = day_number < daysElapsed;

    if (day_number > daysElapsed) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'This day is locked. Complete previous days first.' 
      });
    }

    // If not current day and not past, check if previous day was completed
    if (!isCurrentDay && !isPastDay) {
      const [prevLog] = await db.query(
        'SELECT is_completed FROM challenge_daily_logs WHERE user_challenge_id = ? AND day_number = ?',
        [userChallengeId, day_number - 1]
      );

      if (prevLog.length === 0 || !prevLog[0].is_completed) {
        return res.status(403).json({ 
          status: 'error', 
          message: 'Previous day must be completed first' 
        });
      }
    }

    // Calculate if this day is completed based on challenge type and daily goal
    let dailyGoal = 0;
    let isCompleted = false;

    if (userChallenge.challenge_type === 'daily_limit') {
      dailyGoal = parseFloat(userChallenge.target_value);
      isCompleted = parseFloat(value_logged) <= dailyGoal;
    } else if (userChallenge.challenge_type === 'total_limit') {
      dailyGoal = parseFloat(userChallenge.target_value) / userChallenge.duration_days;
      isCompleted = parseFloat(value_logged) <= dailyGoal;
    } else if (userChallenge.challenge_type === 'activity_count') {
      dailyGoal = Math.ceil(parseFloat(userChallenge.target_value) / userChallenge.duration_days);
      isCompleted = parseFloat(value_logged) >= dailyGoal;
    } else if (userChallenge.challenge_type === 'consecutive_days') {
      dailyGoal = parseFloat(userChallenge.target_value);
      isCompleted = parseFloat(value_logged) <= dailyGoal;
    }

    // Calculate log_date
    const logDate = new Date(userChallenge.start_date);
    logDate.setDate(logDate.getDate() + (day_number - 1));
    const logDateStr = logDate.toISOString().split('T')[0];

    // Get current log (to detect transition to completed and avoid double-awards)
    const [existingLogRows] = await db.query(
      'SELECT is_completed FROM challenge_daily_logs WHERE user_challenge_id = ? AND day_number = ?',
      [userChallengeId, day_number]
    );
    const wasCompletedBefore = existingLogRows.length ? !!existingLogRows[0].is_completed : false;

    // Insert or update daily log
    await db.query(
      `INSERT INTO challenge_daily_logs 
       (user_challenge_id, day_number, log_date, value_logged, notes, is_completed, logged_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
       value_logged = VALUES(value_logged),
       notes = VALUES(notes),
       is_completed = VALUES(is_completed),
       logged_at = NOW()`,
      [userChallengeId, day_number, logDateStr, value_logged, notes, isCompleted]
    );

    // Update user_challenges summary
    const [allLogs] = await db.query(
      'SELECT * FROM challenge_daily_logs WHERE user_challenge_id = ?',
      [userChallengeId]
    );

    const completedDays = allLogs.filter(l => l.is_completed).length;
    const totalProgress = allLogs.reduce((sum, l) => sum + parseFloat(l.value_logged || 0), 0);

    await db.query(
      `UPDATE user_challenges 
       SET days_completed = ?, total_progress = ?, last_log_date = CURDATE()
       WHERE id = ?`,
      [completedDays, totalProgress, userChallengeId]
    );

    // Award XP only when a day transitions to completed
    if (isCompleted && !wasCompletedBefore) {
      const maxXp = getMaxXpForDuration(userChallenge.duration_days);
      const perDayFloor = Math.floor(maxXp / userChallenge.duration_days);
      const remainder = maxXp - (perDayFloor * userChallenge.duration_days);

      // If the entire challenge is completed with this log, include remainder
      const isNowChallengeCompleted = (completedDays === userChallenge.duration_days);
      const xpToAward = perDayFloor + (isNowChallengeCompleted ? remainder : 0);
      if (xpToAward > 0) await addXp(userId, xpToAward, 'challenge_day_completed');
    }

    // Check if entire challenge is completed; mark complete (no extra XP bonus per spec)
    if (completedDays === userChallenge.duration_days) {
      await db.query(
        'UPDATE user_challenges SET completed = 1, end_date = CURDATE() WHERE id = ?',
        [userChallengeId]
      );
    }

    res.json({
      status: 'success',
      message: isCompleted ? 'Day completed!' : 'Progress logged',
      data: {
        day_number,
        value_logged: parseFloat(value_logged),
        daily_goal: dailyGoal,
        is_completed: isCompleted,
        completed_days: completedDays,
        total_days: userChallenge.duration_days,
        challenge_completed: completedDays === userChallenge.duration_days
      }
    });
  } catch (error) {
    console.error('logDailyProgress error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to log progress' });
  }
};

// Get user's active challenges with daily tracking
exports.getMyChallengesWithDays = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if challenge_daily_logs table exists, if not use fallback
    let challenges;
    try {
      [challenges] = await db.query(
        `SELECT uc.id AS user_challenge_id, uc.start_date, uc.completed, 
                COALESCE(uc.days_completed, 0) AS days_completed, 
                COALESCE(uc.total_progress, 0) AS total_progress,
                c.id AS challenge_id, c.name, c.description, c.challenge_type, c.target_value, 
                c.target_unit, c.duration_days, c.badge_name,
                DATEDIFF(CURDATE(), uc.start_date) + 1 AS days_elapsed,
                (SELECT COUNT(*) FROM challenge_daily_logs cdl 
                 WHERE cdl.user_challenge_id = uc.id AND cdl.is_completed = 1) AS completed_days_count
         FROM user_challenges uc
         JOIN challenges c ON uc.challenge_id = c.id
         WHERE uc.user_id = ?
         ORDER BY uc.completed ASC, uc.start_date DESC`,
        [userId]
      );
    } catch (tableError) {
      // Fallback if challenge_daily_logs doesn't exist yet
      console.warn('challenge_daily_logs table not found, using fallback');
      [challenges] = await db.query(
        `SELECT uc.id AS user_challenge_id, uc.start_date, uc.completed,
                0 AS days_completed, 0 AS total_progress,
                c.id AS challenge_id, c.name, c.description, c.challenge_type, c.target_value, 
                c.target_unit, c.duration_days, c.badge_name,
                DATEDIFF(CURDATE(), uc.start_date) + 1 AS days_elapsed,
                0 AS completed_days_count
         FROM user_challenges uc
         JOIN challenges c ON uc.challenge_id = c.id
         WHERE uc.user_id = ?
         ORDER BY uc.completed ASC, uc.start_date DESC`,
        [userId]
      );
    }

    const result = challenges.map(ch => {
      const progressPercent = (ch.completed_days_count / ch.duration_days) * 100;
      const currentDay = Math.min(ch.days_elapsed, ch.duration_days);
      
      return {
        ...ch,
        current_day: currentDay,
        progress_percent: progressPercent,
        days_remaining: Math.max(0, ch.duration_days - ch.days_elapsed + 1),
        status: ch.completed ? 'completed' : (ch.days_elapsed > ch.duration_days ? 'expired' : 'active')
      };
    });

    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('getMyChallengesWithDays error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to load challenges' });
  }
};

module.exports = exports;
