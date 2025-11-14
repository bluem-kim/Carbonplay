const db = require('../config/database');
const { xpToLevel } = require('../utils/xp');

// Toggle like on a milestone (user's feed item)
exports.toggleMilestoneLike = async (req, res) => {
  try {
    const userId = req.user.id;
    const { milestone_user_id } = req.body;

    if (!milestone_user_id) {
      return res.status(400).json({
        status: 'error',
        message: 'milestone_user_id is required'
      });
    }

    // Check if already liked
    const [existing] = await db.query(
      'SELECT * FROM social_likes WHERE user_id = ? AND milestone_user_id = ?',
      [userId, milestone_user_id]
    );

    if (existing.length > 0) {
      // Unlike
      await db.query(
        'DELETE FROM social_likes WHERE user_id = ? AND milestone_user_id = ?',
        [userId, milestone_user_id]
      );

      // Get updated count
      const [countResult] = await db.query(
        'SELECT COUNT(*) as count FROM social_likes WHERE milestone_user_id = ?',
        [milestone_user_id]
      );

      return res.json({
        status: 'success',
        data: {
          liked: false,
          count: countResult[0]?.count || 0
        }
      });
    } else {
      // Like
      await db.query(
        'INSERT INTO social_likes (user_id, milestone_user_id) VALUES (?, ?)',
        [userId, milestone_user_id]
      );

      // Get updated count
      const [countResult] = await db.query(
        'SELECT COUNT(*) as count FROM social_likes WHERE milestone_user_id = ?',
        [milestone_user_id]
      );

      return res.json({
        status: 'success',
        data: {
          liked: true,
          count: countResult[0]?.count || 0
        }
      });
    }
  } catch (error) {
    console.error('Toggle milestone like error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to toggle like'
    });
  }
};

// Get milestone likes status for current user
exports.getMilestoneLikes = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all milestone user IDs that current user has liked
    const [likes] = await db.query(
      'SELECT milestone_user_id FROM social_likes WHERE user_id = ?',
      [userId]
    );

    // Get like counts for all users
    const [counts] = await db.query(
      `SELECT milestone_user_id, COUNT(*) as count 
       FROM social_likes 
       GROUP BY milestone_user_id`
    );

    const likedUserIds = likes.map(l => l.milestone_user_id);
    const likeCounts = {};
    counts.forEach(c => {
      likeCounts[c.milestone_user_id] = c.count;
    });

    res.json({
      status: 'success',
      data: {
        liked: likedUserIds,
        counts: likeCounts
      }
    });
  } catch (error) {
    console.error('Get milestone likes error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get likes'
    });
  }
};

// Create a new tip
exports.createTip = async (req, res) => {
  try {
    const userId = req.user.id;
    const { content, tip_type = 'general' } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Content is required'
      });
    }

    const [result] = await db.query(
      'INSERT INTO social_tips (user_id, content, tip_type) VALUES (?, ?, ?)',
      [userId, content.trim(), tip_type]
    );

    res.status(201).json({
      status: 'success',
      data: {
        id: result.insertId,
        user_id: userId,
        content: content.trim(),
        tip_type,
        likes_count: 0,
        created_at: new Date()
      }
    });
  } catch (error) {
    console.error('Create tip error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create tip'
    });
  }
};

// Get all tips with user info
exports.getTips = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;

    const [tips] = await db.query(
      `SELECT 
        st.id,
        st.content,
        st.tip_type,
        st.likes_count,
        st.created_at,
        u.id as user_id,
        u.username,
        up.profile_picture
      FROM social_tips st
      JOIN users u ON st.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      ORDER BY st.created_at DESC
      LIMIT ?`,
      [limit]
    );

    // Get current user's liked tips
    const [userLikes] = await db.query(
      'SELECT tip_id FROM social_tip_likes WHERE user_id = ?',
      [userId]
    );

    const likedTipIds = userLikes.map(l => l.tip_id);

    const tipsWithLikeStatus = tips.map(tip => ({
      ...tip,
      liked: likedTipIds.includes(tip.id)
    }));

    res.json({
      status: 'success',
      data: {
        tips: tipsWithLikeStatus
      }
    });
  } catch (error) {
    console.error('Get tips error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get tips'
    });
  }
};

// Toggle like on a tip
exports.toggleTipLike = async (req, res) => {
  try {
    const userId = req.user.id;
    const { tip_id } = req.body;

    if (!tip_id) {
      return res.status(400).json({
        status: 'error',
        message: 'tip_id is required'
      });
    }

    // Check if already liked
    const [existing] = await db.query(
      'SELECT * FROM social_tip_likes WHERE user_id = ? AND tip_id = ?',
      [userId, tip_id]
    );

    if (existing.length > 0) {
      // Unlike
      await db.query(
        'DELETE FROM social_tip_likes WHERE user_id = ? AND tip_id = ?',
        [userId, tip_id]
      );

      // Decrement count
      await db.query(
        'UPDATE social_tips SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ?',
        [tip_id]
      );

      const [tip] = await db.query(
        'SELECT likes_count FROM social_tips WHERE id = ?',
        [tip_id]
      );

      return res.json({
        status: 'success',
        data: {
          liked: false,
          count: tip[0]?.likes_count || 0
        }
      });
    } else {
      // Like
      await db.query(
        'INSERT INTO social_tip_likes (user_id, tip_id) VALUES (?, ?)',
        [userId, tip_id]
      );

      // Increment count
      await db.query(
        'UPDATE social_tips SET likes_count = likes_count + 1 WHERE id = ?',
        [tip_id]
      );

      const [tip] = await db.query(
        'SELECT likes_count FROM social_tips WHERE id = ?',
        [tip_id]
      );

      return res.json({
        status: 'success',
        data: {
          liked: true,
          count: tip[0]?.likes_count || 0
        }
      });
    }
  } catch (error) {
    console.error('Toggle tip like error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to toggle like'
    });
  }
};

// Get milestones feed (users activity snapshots) with optional filters
exports.getMilestones = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 200));
    const filter = String(req.query.filter || 'all').toLowerCase();
    
    console.log(`[getMilestones] User ${currentUserId} requesting filter="${filter}", limit=${limit}`);

    // Aggregate per-user activity stats + XP
    const [rows] = await db.query(
      `SELECT 
         u.id AS user_id,
         u.username,
         up.profile_picture,
         ux.xp_total,
         COALESCE(COUNT(DISTINCT s.id), 0) AS scenarios,
         COALESCE(COUNT(a.id), 0) AS activities,
         COUNT(DISTINCT CASE WHEN s.created_at >= (NOW() - INTERVAL 30 DAY) THEN s.id END) AS recent_scenarios_30d,
         (SELECT name FROM scenarios s2 WHERE s2.user_id = u.id AND s2.is_active = 1 ORDER BY s2.created_at DESC LIMIT 1) AS last_scenario_name,
         (SELECT s2.created_at FROM scenarios s2 WHERE s2.user_id = u.id AND s2.is_active = 1 ORDER BY s2.created_at DESC LIMIT 1) AS last_scenario_created_at,
         SUM(CASE WHEN a.created_at >= (NOW() - INTERVAL 7 DAY) THEN a.co2e_amount ELSE 0 END) AS recent_total_7d,
         (SELECT sa.co2e_amount FROM scenario_activities sa
            JOIN scenarios s2 ON sa.scenario_id = s2.id
           WHERE s2.user_id = u.id AND s2.is_active = 1
           ORDER BY sa.created_at DESC LIMIT 1) AS last_activity_co2e,
         (SELECT sa.created_at FROM scenario_activities sa
            JOIN scenarios s2 ON sa.scenario_id = s2.id
           WHERE s2.user_id = u.id AND s2.is_active = 1
           ORDER BY sa.created_at DESC LIMIT 1) AS last_activity_time,
         COALESCE(AVG(a.co2e_amount), 0) AS avg_emissions,
         GREATEST(
           COALESCE(MAX(s.updated_at), '1970-01-01'),
           COALESCE(MAX(a.created_at), '1970-01-01')
         ) AS last_update
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN user_xp ux ON ux.user_id = u.id
       LEFT JOIN scenarios s ON s.user_id = u.id AND s.is_active = 1
       LEFT JOIN scenario_activities a ON a.scenario_id = s.id
       GROUP BY u.id
       ORDER BY last_update DESC, u.id ASC`
    );
    // Badge catalog (same thresholds as /auth/me/badges)
    const badgeCatalog = [
      { key: 'sprout', name: 'Starter Seed', level_required: 1, icon: '🌱' },
      { key: 'leaf_learner', name: 'Leaf Learner', level_required: 3, icon: '🍃' },
      { key: 'green_rookie', name: 'Green Rookie', level_required: 5, icon: '🟢' },
      { key: 'eco_explorer', name: 'Eco Explorer', level_required: 10, icon: '🧭' },
      { key: 'carbon_cutter', name: 'Carbon Cutter', level_required: 15, icon: '✂️' },
      { key: 'planet_protector', name: 'Planet Protector', level_required: 20, icon: '🛡️' }
    ];

    // Likes info
    const [likedByMe] = await db.query(
      'SELECT milestone_user_id FROM social_likes WHERE user_id = ?',
      [currentUserId]
    );
    const likedSet = new Set(likedByMe.map((r) => r.milestone_user_id));
    const [likeCounts] = await db.query(
      'SELECT milestone_user_id, COUNT(*) AS cnt FROM social_likes GROUP BY milestone_user_id'
    );
    const likeCountMap = new Map(likeCounts.map((r) => [r.milestone_user_id, r.cnt]));

    const now = new Date();
    const daysAgo = (d) => {
      const dt = new Date(d);
      return (now - dt) / (1000 * 60 * 60 * 24);
    };

    const decorate = (r) => {
      const stats = {
        scenarios: Number(r.scenarios || 0),
        activities: Number(r.activities || 0),
        avg_emissions: Number(r.avg_emissions || 0),
        recent_scenarios: Number(r.recent_scenarios_30d || 0),
        last_scenario_name: r.last_scenario_name || null,
        last_scenario_created_at: r.last_scenario_created_at ? new Date(r.last_scenario_created_at) : null,
        recent_total_7d: Number(r.recent_total_7d || 0),
        last_activity_co2e: r.last_activity_co2e != null ? Number(r.last_activity_co2e) : null,
        last_activity_time: r.last_activity_time ? new Date(r.last_activity_time) : null,
      };
      const lastUpdate = r.last_update ? new Date(r.last_update) : null;
      // Derive level from XP and build badge-based milestones
      const levelInfo = xpToLevel(Number(r.xp_total || 0), 500);
      const earnedBadges = badgeCatalog.filter(b => levelInfo.level >= b.level_required);
      // Build user-facing milestone sentences like: "<username> unlocked <badge> badge"
      const ms = earnedBadges.map(b => ({ label: `${r.username} unlocked ${b.name} badge` }));

      return {
        user: {
          id: r.user_id,
          username: r.username,
          profile_picture: r.profile_picture || null,
        },
        stats,
        milestones: ms,
        last_update: lastUpdate,
        like_count: Number(likeCountMap.get(r.user_id) || 0),
        liked: likedSet.has(r.user_id),
      };
    };

    // Apply server-side filtering to match tabs
    let feed = rows.map(decorate);
    console.log(`[getMilestones] Total users before filter: ${feed.length}`);
    
    // Debug: log each user's stats and milestones (badges)
    feed.forEach(f => {
      console.log(`  User: ${f.user.username}, scenarios=${f.stats.scenarios}, activities=${f.stats.activities}, avg_co2e=${f.stats.avg_emissions.toFixed(2)}, badges=[${(f.milestones||[]).map(m => m.label).join(', ')}], last_update=${f.last_update ? daysAgo(f.last_update).toFixed(1) + 'd ago' : 'never'}`);
    });
    
    if (filter === 'milestones') {
      const before = feed.length;
      feed = feed
        .filter((f) => {
          // Show users with at least one badge (completed challenge)
          const hasBadges = (f.milestones || []).length > 0;
          if (!hasBadges) console.log(`    → FILTERED OUT ${f.user.username}: no badges`);
          return hasBadges;
        })
        // Rank: more milestone badges first, then more likes, then most recent
        .sort((a, b) => {
          const am = (a.milestones?.length || 0);
          const bm = (b.milestones?.length || 0);
          if (bm !== am) return bm - am;
          if (b.like_count !== a.like_count) return b.like_count - a.like_count;
          return (b.last_update?.getTime?.() || 0) - (a.last_update?.getTime?.() || 0);
        });
      console.log(`[getMilestones] After "milestones" filter (badges): ${feed.length} users (filtered out ${before - feed.length})`);
    } else if (filter === 'low') {
      // Show users with low average emissions and rank by lowest first
      const before = feed.length;
      feed = feed
        .filter((f) => {
          const isLow = f.stats.avg_emissions > 0 && f.stats.avg_emissions < 100;
          if (!isLow && f.stats.avg_emissions > 0) console.log(`    → FILTERED OUT ${f.user.username}: avg_emissions=${f.stats.avg_emissions.toFixed(2)} (too high or zero)`);
          return isLow;
        })
        .sort((a, b) => {
          if (a.stats.avg_emissions !== b.stats.avg_emissions) return a.stats.avg_emissions - b.stats.avg_emissions;
          // tie-breaker: more activities (more evidence) first, then recent
          if (b.stats.activities !== a.stats.activities) return b.stats.activities - a.stats.activities;
          return (b.last_update?.getTime?.() || 0) - (a.last_update?.getTime?.() || 0);
        });
      console.log(`[getMilestones] After "low" filter: ${feed.length} users with avg < 100 CO2e (filtered out ${before - feed.length})`);
    } else if (filter === 'active') {
      // Active within last 30 days, rank by most scenarios then activities then recency
      const before = feed.length;
      feed = feed
        .filter((f) => {
          const isActive = f.last_update && daysAgo(f.last_update) <= 30;
          if (!isActive) console.log(`    → FILTERED OUT ${f.user.username}: last_update=${f.last_update ? daysAgo(f.last_update).toFixed(1) + 'd ago' : 'never'} (not within 30d)`);
          return isActive;
        })
        .sort((a, b) => {
          if (b.stats.scenarios !== a.stats.scenarios) return b.stats.scenarios - a.stats.scenarios;
          if (b.stats.activities !== a.stats.activities) return b.stats.activities - a.stats.activities;
          return (b.last_update?.getTime?.() || 0) - (a.last_update?.getTime?.() || 0);
        });
      console.log(`[getMilestones] After "active" filter: ${feed.length} users active in 30d (filtered out ${before - feed.length})`);
    } else {
      // 'all': default recent-first (already ordered by SQL), but re-apply to be explicit
      feed = feed.sort((a, b) => (b.last_update?.getTime?.() || 0) - (a.last_update?.getTime?.() || 0));
      console.log(`[getMilestones] Using "all" filter (no reduction): ${feed.length} users`);
    }

    // Limit results after filtering/sorting
    feed = feed.slice(0, limit);

    res.json({ status: 'success', data: { feed } });
  } catch (error) {
    console.error('Get milestones error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to get milestones feed' });
  }
};
