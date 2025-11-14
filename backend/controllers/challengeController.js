const db = require('../config/database');
const { addXp, getXp } = require('../utils/xp');

// Ensure scope columns exist for targeted challenges
async function ensureChallengeScopeColumns() {
  try {
    await db.query("ALTER TABLE user_challenges ADD COLUMN IF NOT EXISTS scope_type ENUM('all','scenario','category','activity') DEFAULT 'all'");
    await db.query('ALTER TABLE user_challenges ADD COLUMN IF NOT EXISTS scope_ref_id INT NULL');
    await db.query('ALTER TABLE user_challenges ADD COLUMN IF NOT EXISTS scope_value VARCHAR(100) NULL');
  } catch (e) {
    // Ignore if not supported; assume columns already exist in most deployments
  }
}

// List active challenges with basic stats and joined state for current user
// Only shows challenges where is_active = 1 (hidden from users when set to 0)
exports.listChallenges = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query(
      `SELECT c.*,
              EXISTS(
                SELECT 1 FROM user_challenges uc
                WHERE uc.challenge_id = c.id AND uc.user_id = ? AND uc.completed = 0
              ) AS joined,
              (SELECT COUNT(*) FROM user_challenges uc2 WHERE uc2.challenge_id = c.id AND uc2.completed = 1) AS completions,
              (SELECT COUNT(*) FROM user_challenges uc3 WHERE uc3.challenge_id = c.id) AS participants
         FROM challenges c
        WHERE c.is_active = 1
        ORDER BY c.created_at DESC`
      , [userId]
    );

    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error('listChallenges error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load challenges' });
  }
};

// Join a challenge; for target-based challenges, no baseline needed
exports.joinChallenge = async (req, res) => {
  try {
    const userId = req.user.id;
    const challengeId = parseInt(req.params.id, 10);
    if (!challengeId) return res.status(400).json({ status: 'error', message: 'Invalid challenge id' });

    await ensureChallengeScopeColumns();

    // Validate challenge is active
    const [chs] = await db.query('SELECT * FROM challenges WHERE id = ? AND is_active = 1', [challengeId]);
    if (!chs.length) return res.status(404).json({ status: 'error', message: 'Challenge not found' });
    const challenge = chs[0];

    // Prevent duplicate active join
    const [existing] = await db.query(
      'SELECT id FROM user_challenges WHERE user_id = ? AND challenge_id = ? AND completed = 0',
      [userId, challengeId]
    );
    if (existing.length) {
      return res.status(409).json({ status: 'error', message: 'Already joined' });
    }

    // Optional scope: scenario-specific or category-specific challenge
    const { scenario_id: scenarioIdBody, category: categoryBody } = req.body || {};
    let scopeType = 'all';
    let scopeRefId = null;
    let scopeValue = null;

    if (scenarioIdBody) {
      const scenarioId = parseInt(scenarioIdBody, 10);
      const [own] = await db.query('SELECT id FROM scenarios WHERE id = ? AND user_id = ? AND is_active = 1', [scenarioId, userId]);
      if (!own.length) return res.status(400).json({ status: 'error', message: 'Invalid scenario for this user' });
      scopeType = 'scenario';
      scopeRefId = scenarioId;
    } else if (categoryBody) {
      const allowed = new Set(['transport','diet','energy','waste','other']);
      if (!allowed.has(categoryBody)) {
        return res.status(400).json({ status: 'error', message: 'Invalid category' });
      }
      scopeType = 'category';
      scopeValue = categoryBody;
    }

    // For target-based challenges, starting_co2e is not a baseline but a tracker
    // Initialize to 0 and track progress from join date forward
    await db.query(
      `INSERT INTO user_challenges (user_id, challenge_id, start_date, starting_co2e, current_co2e, completed, scope_type, scope_ref_id, scope_value)
       VALUES (?, ?, CURDATE(), 0, 0, 0, ?, ?, ?)`,
      [userId, challengeId, scopeType, scopeRefId, scopeValue]
    );

    // Award small XP for joining
    await addXp(userId, 10);

    res.status(201).json({ 
      status: 'success', 
      message: 'Joined challenge', 
      data: { 
        challenge_id: challengeId, 
        challenge_type: challenge.challenge_type,
        target_value: challenge.target_value,
        scope_type: scopeType, 
        scope_ref_id: scopeRefId, 
        scope_value: scopeValue 
      } 
    });
  } catch (e) {
    console.error('joinChallenge error', e);
    res.status(500).json({ status: 'error', message: 'Failed to join challenge' });
  }
};

// Get current user's challenges with computed progress
// Only shows challenges where the challenge is still active
// Returns target-based progress info
exports.getMyChallenges = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.query(
      `SELECT uc.*, c.name, c.description, c.challenge_type, c.target_value, c.target_unit, c.duration_days, c.badge_name, c.is_active
         FROM user_challenges uc
         JOIN challenges c ON c.id = uc.challenge_id
        WHERE uc.user_id = ? AND c.is_active = 1
        ORDER BY uc.created_at DESC`,
      [userId]
    );

    const data = rows.map((r) => {
      const challengeType = r.challenge_type || 'daily_limit';
      const targetValue = Number(r.target_value || 0);
      const current = Number(r.current_co2e || 0);
      const durationDays = Number(r.duration_days || 7);
      const startDate = new Date(r.start_date);
      const now = new Date();
      const daysElapsed = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));
      
      let progress = 0;
      let statusText = '';
      
      switch (challengeType) {
        case 'daily_limit':
          const avgDaily = current / daysElapsed;
          progress = targetValue > 0 && avgDaily <= targetValue ? 100 : Math.max(0, 100 - ((avgDaily - targetValue) / targetValue * 100));
          statusText = `${avgDaily.toFixed(2)} kg/day`;
          break;
        case 'total_limit':
          progress = targetValue > 0 ? Math.min(100, Math.max(0, (1 - (current / targetValue)) * 100)) : 0;
          statusText = `${current.toFixed(2)} / ${targetValue} kg`;
          break;
        case 'activity_count':
          progress = targetValue > 0 ? Math.min(100, (current / targetValue) * 100) : 0;
          statusText = `${Math.floor(current)} / ${targetValue} activities`;
          break;
        case 'consecutive_days':
          progress = (daysElapsed / durationDays) * 100;
          statusText = `${daysElapsed} / ${durationDays} days`;
          break;
        default:
          progress = 0;
          statusText = 'Unknown';
      }
      
      return { 
        ...r, 
        progress: Number(progress.toFixed(1)),
        status_text: statusText
      };
    });

    res.json({ status: 'success', data });
  } catch (e) {
    console.error('getMyChallenges error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load your challenges' });
  }
};

// Update progress for TARGET-BASED challenges
// Challenge types:
// - daily_limit: Keep daily emissions under target_value
// - total_limit: Keep total emissions under target_value for duration
// - activity_count: Log at least target_value activities
// - consecutive_days: Achieve target_value consecutive days under daily limit
exports.updateProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const challengeId = parseInt(req.params.id, 10);
    if (!challengeId) return res.status(400).json({ status: 'error', message: 'Invalid challenge id' });

    // Load enrollment and challenge
    const [[uc], [cRows]] = await Promise.all([
      db.query('SELECT * FROM user_challenges WHERE user_id = ? AND challenge_id = ?', [userId, challengeId]).then(r => r[0]),
      db.query('SELECT * FROM challenges WHERE id = ?', [challengeId]).then(r => r[0])
    ]);

    const challenge = Array.isArray(cRows) ? cRows[0] : undefined;
    if (!uc || !challenge) return res.status(404).json({ status: 'error', message: 'Enrollment or challenge not found' });
    if (uc.completed) {
      return res.json({ status: 'success', data: { challenge_id: challengeId, completed: true, progress: 100 } });
    }

    const durationDays = Number(challenge.duration_days || 30);
    const startDate = new Date(uc.start_date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);
    const now = new Date();
    const isExpired = now >= endDate;
    const checkUntil = isExpired ? endDate : now;

    const challengeType = challenge.challenge_type || 'daily_limit';
    const targetValue = Number(challenge.target_value || 0);
    let progress = 0;
    let completed = false;
    let statusMessage = '';

    // Calculate total emissions during challenge period
    let totalEmissions = 0;
    if (uc.scope_type === 'scenario' && uc.scope_ref_id) {
      const [rows] = await db.query(
        `SELECT COALESCE(SUM(sa.co2e_amount), 0) AS total
           FROM scenario_activities sa
           INNER JOIN scenarios s ON sa.scenario_id = s.id
          WHERE s.id = ? AND s.user_id = ?
            AND sa.created_at >= ?
            AND sa.created_at < ?`,
        [uc.scope_ref_id, userId, uc.start_date, checkUntil]
      );
      totalEmissions = Number(rows[0]?.total || 0);
    } else if (uc.scope_type === 'category' && uc.scope_value) {
      const [rows] = await db.query(
        `SELECT COALESCE(SUM(sa.co2e_amount), 0) AS total
           FROM scenario_activities sa
           INNER JOIN scenarios s ON sa.scenario_id = s.id
          WHERE s.user_id = ? AND s.is_active = 1
            AND sa.category = ?
            AND sa.created_at >= ?
            AND sa.created_at < ?`,
        [userId, uc.scope_value, uc.start_date, checkUntil]
      );
      totalEmissions = Number(rows[0]?.total || 0);
    } else {
      const [rows] = await db.query(
        `SELECT COALESCE(SUM(sa.co2e_amount), 0) AS total
           FROM scenario_activities sa
           INNER JOIN scenarios s ON sa.scenario_id = s.id
          WHERE s.user_id = ? AND s.is_active = 1
            AND sa.created_at >= ?
            AND sa.created_at < ?`,
        [userId, uc.start_date, checkUntil]
      );
      totalEmissions = Number(rows[0]?.total || 0);
    }

    await db.query('UPDATE user_challenges SET current_co2e = ? WHERE id = ?', [totalEmissions, uc.id]);

    // Calculate progress based on challenge type
    const daysElapsed = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));

    switch (challengeType) {
      case 'daily_limit':
        // Target: Keep average daily emissions under target_value
        const avgDaily = totalEmissions / daysElapsed;
        if (targetValue > 0) {
          progress = avgDaily <= targetValue ? 100 : Math.max(0, 100 - ((avgDaily - targetValue) / targetValue * 100));
        }
        statusMessage = `${avgDaily.toFixed(2)} kg/day (target: <${targetValue} kg/day)`;
        completed = isExpired && avgDaily <= targetValue;
        break;

      case 'total_limit':
        // Target: Keep total emissions under target_value for entire duration
        if (targetValue > 0) {
          progress = Math.min(100, (1 - (totalEmissions / targetValue)) * 100);
          progress = Math.max(0, progress);
        }
        statusMessage = `${totalEmissions.toFixed(2)} / ${targetValue} kg total`;
        completed = (isExpired && totalEmissions <= targetValue) || totalEmissions <= targetValue;
        break;

      case 'activity_count':
        // Target: Log at least target_value activities
        const [activityRows] = await db.query(
          `SELECT COUNT(*) as count
           FROM scenario_activities sa
           INNER JOIN scenarios s ON sa.scenario_id = s.id
          WHERE s.user_id = ? AND s.is_active = 1
            AND sa.created_at >= ?
            AND sa.created_at < ?`,
          [userId, uc.start_date, checkUntil]
        );
        const activityCount = Number(activityRows[0]?.count || 0);
        if (targetValue > 0) {
          progress = Math.min(100, (activityCount / targetValue) * 100);
        }
        statusMessage = `${activityCount} / ${targetValue} activities logged`;
        completed = activityCount >= targetValue;
        break;

      case 'consecutive_days':
        // Target: Achieve target_value consecutive days under daily limit (stored in target_reduction as daily max)
        // This is complex - simplified: check if current avg is under limit
        const dailyLimit = Number(challenge.target_reduction || 5);
        const currentAvg = totalEmissions / daysElapsed;
        progress = currentAvg <= dailyLimit ? (daysElapsed / durationDays) * 100 : 0;
        statusMessage = `${daysElapsed} days, avg ${currentAvg.toFixed(2)} kg/day (limit: ${dailyLimit})`;
        completed = isExpired && currentAvg <= dailyLimit;
        break;

      default:
        progress = 0;
        statusMessage = 'Unknown challenge type';
    }

    // Award XP if completed successfully
    if (completed && !uc.completed) {
      await db.query('UPDATE user_challenges SET completed = 1, end_date = CURDATE() WHERE id = ?', [uc.id]);
      await addXp(userId, 100);
    } else if (isExpired && !uc.completed && !completed) {
      // Failed to complete - mark as done but no XP
      await db.query('UPDATE user_challenges SET completed = 1, end_date = ? WHERE id = ?', [endDate.toISOString().split('T')[0], uc.id]);
    }

    res.json({
      status: 'success',
      data: {
        challenge_id: challengeId,
        challenge_type: challengeType,
        total_emissions: totalEmissions,
        target_value: targetValue,
        progress: Number(progress.toFixed(1)),
        status_message: statusMessage,
        completed,
        is_expired: isExpired,
        days_remaining: isExpired ? 0 : Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)))
      }
    });
  } catch (e) {
    console.error('updateProgress error', e);
    res.status(500).json({ status: 'error', message: 'Failed to update progress' });
  }
};

// Get current user's XP summary
exports.getMyXp = async (req, res) => {
  try {
    const userId = req.user.id;
    const xp = await getXp(userId);
    res.json({ status: 'success', data: xp });
  } catch (e) {
    console.error('getMyXp error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load XP' });
  }
};
