const express = require('express');
const bcrypt = require('bcrypt');
const axios = require('axios');
const router = express.Router();
const db = require('../config/database');
const { authenticate, authorizeAdmin } = require('../middlewares/auth');
const { generatePdfFromHtml } = require('../utils/pdfGenerator');
const { verifyTransport, sendMail } = require('../utils/mailer');

// Protect all admin routes (optionally add admin-role check later)
router.use(authenticate);
router.use(authorizeAdmin);

// --- Admin Analytics Overview ---
router.get('/analytics/overview', async (req, res) => {
  try {
    // Users summary
    const usersP = db.query(`
      SELECT 
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeUsers
      FROM users
    `);

    // Profiles: countries, household, baselines
    const profilesP = db.query(`
      SELECT 
        AVG(household_size) AS avgHousehold,
        SUM(CASE WHEN baseline_calculated = 1 THEN 1 ELSE 0 END) AS baselineCalculated
      FROM user_profiles
    `);
    const countriesP = db.query(`
      SELECT country, COUNT(*) AS count
      FROM user_profiles
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `);

    // XP summary and top users
    const xpSummaryP = db.query(`
      SELECT COALESCE(SUM(xp_total),0) AS totalXP, COALESCE(AVG(xp_total),0) AS avgXP FROM user_xp
    `);
    const topXPUsersP = db.query(`
      SELECT u.id, u.username, x.xp_total
      FROM user_xp x
      JOIN users u ON u.id = x.user_id
      ORDER BY x.xp_total DESC
      LIMIT 10
    `);

    // Challenges and enrollments
    const challengesP = db.query(`
      SELECT 
        COUNT(*) AS totalChallenges,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeChallenges
      FROM challenges
    `);
    const enrollmentsP = db.query(`
      SELECT 
        COUNT(*) AS totalEnrollments,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completedEnrollments
      FROM user_challenges
    `);

    // Scenarios summary
    const scenariosP = db.query(`
      SELECT 
        COUNT(*) AS totalScenarios,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeScenarios
      FROM scenarios
    `);
    const emissionsTrendP = db.query(`
      SELECT DATE(sa.created_at) AS day, COALESCE(SUM(sa.co2e_amount),0) AS total
      FROM scenario_activities sa
      WHERE sa.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(sa.created_at)
      ORDER BY day
    `);
    const emissionsByCategoryP = db.query(`
      SELECT category, COALESCE(SUM(co2e_amount),0) AS total
      FROM scenario_activities
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY category
      ORDER BY total DESC
    `);

    // Social summary
    const tipsP = db.query('SELECT COUNT(*) AS totalTips FROM social_tips');
    const tipLikesP = db.query('SELECT COUNT(*) AS totalTipLikes FROM social_tip_likes');
    const milestoneLikesP = db.query('SELECT COUNT(*) AS totalMilestoneLikes FROM social_likes');

    const [usersR, profilesR, countriesR, xpSummaryR, topXPUsersR, challengesR, enrollmentsR, scenariosR, emissionsTrendR, emissionsByCategoryR, tipsR, tipLikesR, milestoneLikesR] = await Promise.all([
      usersP, profilesP, countriesP, xpSummaryP, topXPUsersP, challengesP, enrollmentsP, scenariosP, emissionsTrendP, emissionsByCategoryP, tipsP, tipLikesP, milestoneLikesP
    ]);

    const users = usersR[0][0] || { totalUsers: 0, activeUsers: 0 };
    const profiles = profilesR[0][0] || { avgHousehold: 0, baselineCalculated: 0 };
    const countries = (countriesR[0] || []).map(r => ({ country: r.country || 'Unknown', count: Number(r.count || 0) }));
    const xpSummary = xpSummaryR[0][0] || { totalXP: 0, avgXP: 0 };
    const topXPUsers = (topXPUsersR[0] || []).map(r => ({ id: r.id, username: r.username, xp: Number(r.xp_total || 0) }));
    const challenges = challengesR[0][0] || { totalChallenges: 0, activeChallenges: 0 };
    const enrollments = enrollmentsR[0][0] || { totalEnrollments: 0, completedEnrollments: 0 };
    const scenarios = scenariosR[0][0] || { totalScenarios: 0, activeScenarios: 0 };
    const emissionsTrend = (emissionsTrendR[0] || []).map(r => ({ day: r.day, total: Number(r.total || 0) }));
    const emissionsByCategory = (emissionsByCategoryR[0] || []).map(r => ({ category: r.category || 'other', total: Number(r.total || 0) }));
    const social = {
      totalTips: Number(tipsR[0][0]?.totalTips || 0),
      totalTipLikes: Number(tipLikesR[0][0]?.totalTipLikes || 0),
      totalMilestoneLikes: Number(milestoneLikesR[0][0]?.totalMilestoneLikes || 0)
    };

    res.json({
      status: 'success',
      data: {
        users,
        profiles: {
          avgHousehold: Number(profiles.avgHousehold || 0),
          baselineCalculated: Number(profiles.baselineCalculated || 0),
          countries
        },
        xp: {
          totalXP: Number(xpSummary.totalXP || 0),
          avgXP: Number(xpSummary.avgXP || 0),
          topUsers: topXPUsers
        },
        challenges: {
          totalChallenges: Number(challenges.totalChallenges || 0),
          activeChallenges: Number(challenges.activeChallenges || 0),
          totalEnrollments: Number(enrollments.totalEnrollments || 0),
          completedEnrollments: Number(enrollments.completedEnrollments || 0)
        },
        scenarios: {
          totalScenarios: Number(scenarios.totalScenarios || 0),
          activeScenarios: Number(scenarios.activeScenarios || 0),
          emissionsTrend,
          emissionsByCategory
        },
        social
      }
    });
  } catch (e) {
    console.error('admin GET /analytics/overview error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load analytics overview' });
  }
});

// --- Admin Analytics Overview: Download as PDF ---
router.get('/analytics/overview/pdf', async (req, res) => {
  try {
    // Reuse the same data as /analytics/overview
    const usersP = db.query(`
      SELECT 
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeUsers
      FROM users
    `);
    const profilesP = db.query(`
      SELECT 
        AVG(household_size) AS avgHousehold,
        SUM(CASE WHEN baseline_calculated = 1 THEN 1 ELSE 0 END) AS baselineCalculated
      FROM user_profiles
    `);
    const countriesP = db.query(`
      SELECT country, COUNT(*) AS count
      FROM user_profiles
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `);
    const xpSummaryP = db.query(`
      SELECT COALESCE(SUM(xp_total),0) AS totalXP, COALESCE(AVG(xp_total),0) AS avgXP FROM user_xp
    `);
    const topXPUsersP = db.query(`
      SELECT u.username, x.xp_total
      FROM user_xp x
      JOIN users u ON u.id = x.user_id
      ORDER BY x.xp_total DESC
      LIMIT 10
    `);
    const challengesP = db.query(`
      SELECT 
        COUNT(*) AS totalChallenges,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeChallenges
      FROM challenges
    `);
    const enrollmentsP = db.query(`
      SELECT 
        COUNT(*) AS totalEnrollments,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completedEnrollments
      FROM user_challenges
    `);
    const scenariosP = db.query(`
      SELECT 
        COUNT(*) AS totalScenarios,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeScenarios
      FROM scenarios
    `);
    const emissionsByCategoryP = db.query(`
      SELECT category, COALESCE(SUM(co2e_amount),0) AS total
      FROM scenario_activities
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY category
      ORDER BY total DESC
    `);

    const [usersR, profilesR, countriesR, xpSummaryR, topXPUsersR, challengesR, enrollmentsR, scenariosR, emissionsByCategoryR] = await Promise.all([
      usersP, profilesP, countriesP, xpSummaryP, topXPUsersP, challengesP, enrollmentsP, scenariosP, emissionsByCategoryP
    ]);

    const users = usersR[0][0] || { totalUsers: 0, activeUsers: 0 };
    const profiles = profilesR[0][0] || { avgHousehold: 0, baselineCalculated: 0 };
    const countries = (countriesR[0] || []).map(r => ({ country: r.country || 'Unknown', count: Number(r.count || 0) }));
    const xpSummary = xpSummaryR[0][0] || { totalXP: 0, avgXP: 0 };
    const topXPUsers = (topXPUsersR[0] || []).map(r => ({ username: r.username, xp: Number(r.xp_total || 0) }));
    const challenges = challengesR[0][0] || { totalChallenges: 0, activeChallenges: 0 };
    const enrollments = enrollmentsR[0][0] || { totalEnrollments: 0, completedEnrollments: 0 };
    const scenarios = scenariosR[0][0] || { totalScenarios: 0, activeScenarios: 0 };
    const emissionsByCategory = (emissionsByCategoryR[0] || []).map(r => ({ category: r.category || 'other', total: Number(r.total || 0) }));

    // Build simple printable HTML
    const html = `
      <!doctype html>
      <html><head><meta charset="utf-8" />
        <title>Analytics Overview Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h1 { margin: 0 0 8px; }
          h2 { margin: 24px 0 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background: #f3f4f6; text-align: left; }
          .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .card { border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; }
          .muted { color: #6b7280; font-size: 12px; }
        </style>
      </head><body>
        <h1>Analytics Overview</h1>
        <div class="muted">Generated ${new Date().toLocaleString()}</div>
        <div class="kpis">
          <div class="card"><div>Total Users</div><div><b>${Number(users.totalUsers||0).toLocaleString()}</b> <span class="muted">(${Number(users.activeUsers||0)} active)</span></div></div>
          <div class="card"><div>Scenarios</div><div><b>${Number(scenarios.totalScenarios||0).toLocaleString()}</b> <span class="muted">(${Number(scenarios.activeScenarios||0)} active)</span></div></div>
          <div class="card"><div>Challenges</div><div><b>${Number(challenges.totalChallenges||0).toLocaleString()}</b> <span class="muted">(${Number(challenges.activeChallenges||0)} active)</span></div></div>
          <div class="card"><div>Total XP</div><div><b>${Number(xpSummary.totalXP||0).toLocaleString()}</b></div></div>
        </div>

        <h2>Emissions by Category (30 days)</h2>
        <table><thead><tr><th>Category</th><th>kg CO₂e</th></tr></thead>
          <tbody>
            ${emissionsByCategory.map(x => `<tr><td>${x.category}</td><td>${x.total.toFixed(2)}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>Users by Country (top 10)</h2>
        <table><thead><tr><th>Country</th><th>Users</th></tr></thead>
          <tbody>
            ${countries.map(x => `<tr><td>${x.country}</td><td>${x.count}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>Top Users by XP</h2>
        <table><thead><tr><th>User</th><th>XP</th></tr></thead>
          <tbody>
            ${topXPUsers.map(u => `<tr><td>${u.username}</td><td>${u.xp.toLocaleString()}</td></tr>`).join('')}
          </tbody>
        </table>
      </body></html>
    `;

    const pdf = await generatePdfFromHtml(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="analytics-overview.pdf"');
    res.send(pdf);
  } catch (e) {
    console.error('admin GET /analytics/overview/pdf error', e);
    res.status(500).json({ status: 'error', message: 'Failed to generate PDF' });
  }
});

// --- Admin Analytics: Users-focused ---
router.get('/analytics/users', async (req, res) => {
  try {
    const lastDays = Number(req.query.days || 30);

    // User counts
    const usersP = db.query(`
      SELECT 
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeUsers
      FROM users
    `);

    // Activities and emissions in window
    const actWindowP = db.query(`
      SELECT 
        COUNT(*) AS totalActivities,
        COALESCE(SUM(co2e_amount),0) AS totalEmissions
      FROM scenario_activities
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [lastDays]);

    // Activity trend (count) and emissions trend (sum)
    const activityTrendP = db.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM scenario_activities
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY day
    `, [lastDays]);
    const emissionsTrendP = db.query(`
      SELECT DATE(created_at) AS day, COALESCE(SUM(co2e_amount),0) AS total
      FROM scenario_activities
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY day
    `, [lastDays]);

    // Emissions by category (window)
    const byCategoryP = db.query(`
      SELECT category, COALESCE(SUM(co2e_amount),0) AS total
      FROM scenario_activities
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY category
      ORDER BY total DESC
    `, [lastDays]);

    // Top users by emissions in window
    const topUsersEmissionsP = db.query(`
      SELECT u.id, u.username, COALESCE(SUM(sa.co2e_amount),0) AS total
      FROM scenario_activities sa
      JOIN scenarios s ON sa.scenario_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE sa.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY u.id
      ORDER BY total DESC
      LIMIT 10
    `, [lastDays]);

    // Participation: enrollments and by type
    const enrollmentsP = db.query(`
      SELECT 
        COUNT(*) AS totalEnrollments,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completedEnrollments,
        COUNT(DISTINCT user_id) AS participants
      FROM user_challenges
    `);
    const byChallengeTypeP = db.query(`
      SELECT c.challenge_type, COUNT(*) AS count
      FROM user_challenges uc
      JOIN challenges c ON c.id = uc.challenge_id
      GROUP BY c.challenge_type
    `);

    // Active participants in window (users who logged any activity)
    const activeParticipantsP = db.query(`
      SELECT COUNT(DISTINCT s.user_id) AS activeParticipants
      FROM scenario_activities sa
      JOIN scenarios s ON sa.scenario_id = s.id
      WHERE sa.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [lastDays]);

    const [usersR, actWindowR, actTrendR, emTrendR, byCategoryR, topUsersEmissionsR, enrollmentsR, byTypeR, activeParticipantsR] = await Promise.all([
      usersP, actWindowP, activityTrendP, emissionsTrendP, byCategoryP, topUsersEmissionsP, enrollmentsP, byChallengeTypeP, activeParticipantsP
    ]);

    const users = usersR[0][0] || { totalUsers: 0, activeUsers: 0 };
    const window = actWindowR[0][0] || { totalActivities: 0, totalEmissions: 0 };
    const activityTrend = (actTrendR[0] || []).map(r => ({ day: r.day, count: Number(r.count || 0) }));
    const emissionsTrend = (emTrendR[0] || []).map(r => ({ day: r.day, total: Number(r.total || 0) }));
    const category = (byCategoryR[0] || []).map(r => ({ category: r.category || 'other', total: Number(r.total || 0) }));
    const topUsersEmissions = (topUsersEmissionsR[0] || []).map(r => ({ id: r.id, username: r.username, total: Number(r.total || 0) }));
    const enrollments = enrollmentsR[0][0] || { totalEnrollments: 0, completedEnrollments: 0, participants: 0 };
    const challengeTypes = (byTypeR[0] || []).map(r => ({ type: r.challenge_type || 'unknown', count: Number(r.count || 0) }));
    const activeParticipants = Number(activeParticipantsR[0][0]?.activeParticipants || 0);

    res.json({
      status: 'success',
      data: {
        window: {
          days: lastDays,
          totalActivities: Number(window.totalActivities || 0),
          totalEmissions: Number(window.totalEmissions || 0)
        },
        users: {
          total: Number(users.totalUsers || 0),
          active: Number(users.activeUsers || 0),
          activeParticipants
        },
        participation: {
          totalEnrollments: Number(enrollments.totalEnrollments || 0),
          completedEnrollments: Number(enrollments.completedEnrollments || 0),
          participants: Number(enrollments.participants || 0),
          byType: challengeTypes
        },
        emissions: {
          byCategory: category,
          topUsers: topUsersEmissions,
          dailyTotal: emissionsTrend
        },
        activityTrend
      }
    });
  } catch (e) {
    console.error('admin GET /analytics/users error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load users analytics' });
  }
});

// --- Admin Users Analytics: Download as PDF ---
router.get('/analytics/users/pdf', async (req, res) => {
  try {
    const lastDays = Number(req.query.days || 30);

    const usersP = db.query(`
      SELECT 
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeUsers
      FROM users
    `);
    const actWindowP = db.query(`
      SELECT 
        COUNT(*) AS totalActivities,
        COALESCE(SUM(co2e_amount),0) AS totalEmissions
      FROM scenario_activities
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [lastDays]);
    const emissionsTrendP = db.query(`
      SELECT DATE(created_at) AS day, COALESCE(SUM(co2e_amount),0) AS total
      FROM scenario_activities
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY day
    `, [lastDays]);
    const byCategoryP = db.query(`
      SELECT category, COALESCE(SUM(co2e_amount),0) AS total
      FROM scenario_activities
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY category
      ORDER BY total DESC
    `, [lastDays]);
    const topUsersEmissionsP = db.query(`
      SELECT u.username, COALESCE(SUM(sa.co2e_amount),0) AS total
      FROM scenario_activities sa
      JOIN scenarios s ON sa.scenario_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE sa.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY u.id
      ORDER BY total DESC
      LIMIT 10
    `, [lastDays]);
    const enrollmentsP = db.query(`
      SELECT 
        COUNT(*) AS totalEnrollments,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completedEnrollments,
        COUNT(DISTINCT user_id) AS participants
      FROM user_challenges
    `);
    const byChallengeTypeP = db.query(`
      SELECT c.challenge_type, COUNT(*) AS count
      FROM user_challenges uc
      JOIN challenges c ON c.id = uc.challenge_id
      GROUP BY c.challenge_type
    `);
    const activeParticipantsP = db.query(`
      SELECT COUNT(DISTINCT s.user_id) AS activeParticipants
      FROM scenario_activities sa
      JOIN scenarios s ON sa.scenario_id = s.id
      WHERE sa.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    `, [lastDays]);

    const [usersR, actWindowR, emTrendR, byCategoryR, topUsersEmissionsR, enrollmentsR, byTypeR, activeParticipantsR] = await Promise.all([
      usersP, actWindowP, emissionsTrendP, byCategoryP, topUsersEmissionsP, enrollmentsP, byChallengeTypeP, activeParticipantsP
    ]);

    const users = usersR[0][0] || { totalUsers: 0, activeUsers: 0 };
    const window = actWindowR[0][0] || { totalActivities: 0, totalEmissions: 0 };
    const emissionsTrend = (emTrendR[0] || []).map(r => ({ day: r.day, total: Number(r.total || 0) }));
    const category = (byCategoryR[0] || []).map(r => ({ category: r.category || 'other', total: Number(r.total || 0) }));
    const topUsersEmissions = (topUsersEmissionsR[0] || []).map(r => ({ username: r.username, total: Number(r.total || 0) }));
    const enrollments = enrollmentsR[0][0] || { totalEnrollments: 0, completedEnrollments: 0, participants: 0 };
    const challengeTypes = (byTypeR[0] || []).map(r => ({ type: r.challenge_type || 'unknown', count: Number(r.count || 0) }));
    const activeParticipants = Number(activeParticipantsR[0][0]?.activeParticipants || 0);

    const html = `
      <!doctype html>
      <html><head><meta charset="utf-8" />
        <title>Users Analytics Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h1 { margin: 0 0 8px; }
          h2 { margin: 24px 0 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background: #f3f4f6; text-align: left; }
          .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .card { border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; }
          .muted { color: #6b7280; font-size: 12px; }
        </style>
      </head><body>
        <h1>Users Analytics</h1>
        <div class="muted">Window: last ${lastDays} days • Generated ${new Date().toLocaleString()}</div>
        <div class="kpis">
          <div class="card"><div>Users</div><div><b>${Number(users.totalUsers||0).toLocaleString()}</b> <span class="muted">(${Number(users.activeUsers||0)} active, ${activeParticipants} participants)</span></div></div>
          <div class="card"><div>Activities (window)</div><div><b>${Number(window.totalActivities||0).toLocaleString()}</b></div></div>
          <div class="card"><div>Emissions (window)</div><div><b>${Number(window.totalEmissions||0).toFixed(1)} kg CO₂e</b></div></div>
          <div class="card"><div>Enrollments</div><div><b>${Number(enrollments.totalEnrollments||0).toLocaleString()}</b> <span class="muted">(${Number(enrollments.completedEnrollments||0)} completed)</span></div></div>
        </div>

        <h2>Emissions by Category</h2>
        <table><thead><tr><th>Category</th><th>kg CO₂e</th></tr></thead>
          <tbody>
            ${category.map(x => `<tr><td>${x.category}</td><td>${x.total.toFixed(2)}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>Enrollments by Challenge Type</h2>
        <table><thead><tr><th>Type</th><th>Enrollments</th></tr></thead>
          <tbody>
            ${challengeTypes.map(x => `<tr><td>${x.type}</td><td>${x.count}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>Top Users by Emissions (window)</h2>
        <table><thead><tr><th>User</th><th>kg CO₂e</th></tr></thead>
          <tbody>
            ${topUsersEmissions.map(u => `<tr><td>${u.username}</td><td>${u.total.toFixed(1)}</td></tr>`).join('')}
          </tbody>
        </table>

        <h2>Daily Emissions (window)</h2>
        <table><thead><tr><th>Date</th><th>kg CO₂e</th></tr></thead>
          <tbody>
            ${emissionsTrend.map(p => `<tr><td>${p.day}</td><td>${p.total.toFixed(1)}</td></tr>`).join('')}
          </tbody>
        </table>
      </body></html>
    `;

    const pdf = await generatePdfFromHtml(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="users-analytics-${lastDays}d.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('admin GET /analytics/users/pdf error', e);
    res.status(500).json({ status: 'error', message: 'Failed to generate PDF' });
  }
});

// --- Users ---
router.get('/users', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, email, role, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 200'
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error('admin GET /users error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load users' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { username, email, password, role = 'user', is_active = 1 } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ status: 'error', message: 'username, email, password are required' });
    }

    const [exists] = await db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (exists.length) {
      return res.status(400).json({ status: 'error', message: 'Username or email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
      [username, email, hash, role, is_active ? 1 : 0]
    );

    res.status(201).json({ status: 'success', data: { id: result.insertId, username, email, role, is_active: !!is_active } });
  } catch (e) {
    console.error('admin POST /users error', e);
    res.status(500).json({ status: 'error', message: 'Failed to create user' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, password, role, is_active } = req.body || {};

    // Build dynamic update
    const fields = [];
    const vals = [];
    if (username) { fields.push('username = ?'); vals.push(username); }
    if (email) { fields.push('email = ?'); vals.push(email); }
    if (typeof role !== 'undefined') { fields.push('role = ?'); vals.push(role); }
    if (typeof is_active !== 'undefined') { fields.push('is_active = ?'); vals.push(is_active ? 1 : 0); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      fields.push('password_hash = ?'); vals.push(hash);
    }

    if (!fields.length) {
      return res.status(400).json({ status: 'error', message: 'No fields to update' });
    }

    vals.push(id);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);
    res.json({ status: 'success', message: 'User updated' });
  } catch (e) {
    console.error('admin PUT /users/:id error', e);
    res.status(500).json({ status: 'error', message: 'Failed to update user' });
  }
});

// --- Profiles ---
router.get('/profiles', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, u.username FROM user_profiles p JOIN users u ON p.user_id = u.id ORDER BY p.updated_at DESC LIMIT 200`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error('admin GET /profiles error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load profiles' });
  }
});

router.post('/profiles', async (req, res) => {
  try {
    const { user_id, country = 'US', household_size = 1, baseline_calculated = 0, baseline_co2e = 0 } = req.body || {};
    if (!user_id) return res.status(400).json({ status: 'error', message: 'user_id is required' });

    const [result] = await db.query(
      'INSERT INTO user_profiles (user_id, country, household_size, baseline_calculated, baseline_co2e) VALUES (?, ?, ?, ?, ?)',
      [user_id, country, household_size, baseline_calculated ? 1 : 0, baseline_co2e]
    );
    res.status(201).json({ status: 'success', data: { id: result.insertId } });
  } catch (e) {
    console.error('admin POST /profiles error', e);
    res.status(500).json({ status: 'error', message: 'Failed to create profile' });
  }
});

router.put('/profiles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { country, household_size, baseline_calculated, baseline_co2e } = req.body || {};
    const fields = [];
    const vals = [];
    if (typeof country !== 'undefined') { fields.push('country = ?'); vals.push(country); }
    if (typeof household_size !== 'undefined') { fields.push('household_size = ?'); vals.push(household_size); }
    if (typeof baseline_calculated !== 'undefined') { fields.push('baseline_calculated = ?'); vals.push(baseline_calculated ? 1 : 0); }
    if (typeof baseline_co2e !== 'undefined') { fields.push('baseline_co2e = ?'); vals.push(baseline_co2e); }
    if (!fields.length) return res.status(400).json({ status: 'error', message: 'No fields to update' });
    vals.push(id);
    await db.query(`UPDATE user_profiles SET ${fields.join(', ')} WHERE id = ?`, vals);
    res.json({ status: 'success', message: 'Profile updated' });
  } catch (e) {
    console.error('admin PUT /profiles/:id error', e);
    res.status(500).json({ status: 'error', message: 'Failed to update profile' });
  }
});

// Compute and store a user's baseline emissions over a lookback window
// POST /api/admin/profiles/:userId/compute-baseline?days=30
// - Sums co2e from scenario_activities for all scenarios of the user within the past `days`
// - Updates user_profiles.baseline_co2e and sets baseline_calculated = 1
// - Optionally updates scenarios.vs_baseline = scenarios.total_co2e - baseline
router.post('/profiles/:userId/compute-baseline', async (req, res) => {
  try {
    const { userId } = req.params;
    const days = Math.max(1, parseInt(req.query.days, 10) || 30);

    // Sum emissions from the past `days` across all of the user's scenarios
    const [[sumRow]] = await db.query(
      `SELECT COALESCE(SUM(sa.co2e_amount), 0) AS total
         FROM scenario_activities sa
         JOIN scenarios s ON s.id = sa.scenario_id
        WHERE s.user_id = ?
          AND sa.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [userId, days]
    );

    const baseline = Number(sumRow?.total || 0);

    // Ensure a profile row exists; update if present, insert if missing
    const [existing] = await db.query('SELECT id FROM user_profiles WHERE user_id = ?', [userId]);
    if (existing.length) {
      await db.query(
        'UPDATE user_profiles SET baseline_co2e = ?, baseline_calculated = 1, updated_at = NOW() WHERE user_id = ?',
        [baseline, userId]
      );
    } else {
      await db.query(
        'INSERT INTO user_profiles (user_id, country, household_size, baseline_calculated, baseline_co2e) VALUES (?, ?, ?, 1, ?)',
        [userId, 'US', 1, baseline]
      );
    }

    // Optionally update scenario vs_baseline to reflect difference from baseline
    // (simple difference: scenario.total_co2e - baseline)
    try {
      await db.query(
        'UPDATE scenarios SET vs_baseline = (total_co2e - ?) WHERE user_id = ? AND is_active = 1',
        [baseline, userId]
      );
    } catch (_) {
      // Ignore if column not present or other non-critical issues
    }

    res.json({ status: 'success', data: { user_id: Number(userId), baseline_co2e: baseline, days } });
  } catch (e) {
    console.error('admin POST /profiles/:userId/compute-baseline error', e);
    res.status(500).json({ status: 'error', message: 'Failed to compute baseline' });
  }
});

// --- Challenges ---
router.get('/challenges', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM challenges ORDER BY created_at DESC LIMIT 200');
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error('admin GET /challenges error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load challenges' });
  }
});

router.post('/challenges', async (req, res) => {
  try {
    const { 
      name, 
      description = null, 
      challenge_type = 'daily_limit',
      target_value = null,
      target_unit = 'kg_co2e',
      duration_days = 7, 
      badge_name = null, 
      is_active = 1 
    } = req.body || {};
    
    if (!name || typeof target_value === 'undefined') {
      return res.status(400).json({ status: 'error', message: 'name and target_value are required' });
    }
    
    const [result] = await db.query(
      'INSERT INTO challenges (name, description, challenge_type, target_value, target_unit, duration_days, badge_name, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, description, challenge_type, target_value, target_unit, duration_days, badge_name, is_active ? 1 : 0]
    );
    res.status(201).json({ status: 'success', data: { id: result.insertId } });
  } catch (e) {
    console.error('admin POST /challenges error', e);
    res.status(500).json({ status: 'error', message: 'Failed to create challenge: ' + e.message });
  }
});

router.put('/challenges/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, challenge_type, target_value, target_unit, duration_days, badge_name, is_active } = req.body || {};
    const fields = [];
    const vals = [];
    if (typeof name !== 'undefined') { fields.push('name = ?'); vals.push(name); }
    if (typeof description !== 'undefined') { fields.push('description = ?'); vals.push(description); }
    if (typeof challenge_type !== 'undefined') { fields.push('challenge_type = ?'); vals.push(challenge_type); }
    if (typeof target_value !== 'undefined') { fields.push('target_value = ?'); vals.push(target_value); }
    if (typeof target_unit !== 'undefined') { fields.push('target_unit = ?'); vals.push(target_unit); }
    if (typeof duration_days !== 'undefined') { fields.push('duration_days = ?'); vals.push(duration_days); }
    if (typeof badge_name !== 'undefined') { fields.push('badge_name = ?'); vals.push(badge_name); }
    if (typeof is_active !== 'undefined') { fields.push('is_active = ?'); vals.push(is_active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ status: 'error', message: 'No fields to update' });
    vals.push(id);
    await db.query(`UPDATE challenges SET ${fields.join(', ')} WHERE id = ?`, vals);
    res.json({ status: 'success', message: 'Challenge updated' });
  } catch (e) {
    console.error('admin PUT /challenges/:id error', e);
    res.status(500).json({ status: 'error', message: 'Failed to update challenge: ' + e.message });
  }
});

router.delete('/challenges/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Check if challenge has user enrollments
    const [enrollments] = await db.query('SELECT COUNT(*) as count FROM user_challenges WHERE challenge_id = ?', [id]);
    const count = enrollments[0]?.count || 0;
    
    if (count > 0) {
      return res.status(400).json({ 
        status: 'error', 
        message: `Cannot delete: ${count} user(s) have joined this challenge. Hide it instead.` 
      });
    }
    
    await db.query('DELETE FROM challenges WHERE id = ?', [id]);
    res.json({ status: 'success', message: 'Challenge deleted' });
  } catch (e) {
    console.error('admin DELETE /challenges/:id error', e);
    res.status(500).json({ status: 'error', message: 'Failed to delete challenge' });
  }
});

// --- Emission Factors ---
router.get('/emission-factors', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM emission_factors ORDER BY last_updated DESC LIMIT 500');
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error('admin GET /emission-factors error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load emission factors' });
  }
});

router.post('/emission-factors', async (req, res) => {
  try {
    const { category, activity_type, region = 'global', co2e_per_unit, unit, source = null } = req.body || {};
    if (!category || !activity_type || typeof co2e_per_unit === 'undefined' || !unit) {
      return res.status(400).json({ status: 'error', message: 'category, activity_type, co2e_per_unit, unit are required' });
    }
    const [result] = await db.query(
      'INSERT INTO emission_factors (category, activity_type, region, co2e_per_unit, unit, source) VALUES (?, ?, ?, ?, ?, ?)',
      [category, activity_type, region, co2e_per_unit, unit, source]
    );
    res.status(201).json({ status: 'success', data: { id: result.insertId } });
  } catch (e) {
    console.error('admin POST /emission-factors error', e);
    const msg = e.code === 'ER_DUP_ENTRY' ? 'Duplicate factor for category/activity/region' : 'Failed to create factor';
    res.status(500).json({ status: 'error', message: msg });
  }
});

router.put('/emission-factors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { category, activity_type, region, co2e_per_unit, unit, source } = req.body || {};
    const fields = [];
    const vals = [];
    if (typeof category !== 'undefined') { fields.push('category = ?'); vals.push(category); }
    if (typeof activity_type !== 'undefined') { fields.push('activity_type = ?'); vals.push(activity_type); }
    if (typeof region !== 'undefined') { fields.push('region = ?'); vals.push(region); }
    if (typeof co2e_per_unit !== 'undefined') { fields.push('co2e_per_unit = ?'); vals.push(co2e_per_unit); }
    if (typeof unit !== 'undefined') { fields.push('unit = ?'); vals.push(unit); }
    if (typeof source !== 'undefined') { fields.push('source = ?'); vals.push(source); }
    if (!fields.length) return res.status(400).json({ status: 'error', message: 'No fields to update' });
    vals.push(id);
    await db.query(`UPDATE emission_factors SET ${fields.join(', ')} WHERE id = ?`, vals);
    res.json({ status: 'success', message: 'Emission factor updated' });
  } catch (e) {
    console.error('admin PUT /emission-factors/:id error', e);
    res.status(500).json({ status: 'error', message: 'Failed to update factor' });
  }
});

// --- Scenarios (overview) ---
router.get('/scenarios', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, u.username, up.baseline_co2e AS user_baseline_co2e, up.baseline_calculated AS user_baseline_calculated
         FROM scenarios s 
         JOIN users u ON s.user_id = u.id 
         LEFT JOIN user_profiles up ON up.user_id = s.user_id
        WHERE s.is_active = 1 
        ORDER BY s.updated_at DESC 
        LIMIT 200`
    );
    res.json({ status: 'success', data: rows });
  } catch (e) {
    console.error('admin GET /scenarios error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load scenarios' });
  }
});

// --- Helper: Get emission estimates for challenge target suggestions ---
router.get('/emission-estimates', async (req, res) => {
  try {
    // Calculate average emissions from existing user data
    const [avgData] = await db.query(`
      SELECT 
        AVG(daily_avg) as avg_daily_emissions,
        MIN(daily_avg) as min_daily,
        MAX(daily_avg) as max_daily
      FROM (
        SELECT 
          s.user_id,
          COALESCE(SUM(sa.co2e_amount) / GREATEST(DATEDIFF(MAX(sa.created_at), MIN(sa.created_at)), 1), 0) as daily_avg
        FROM scenarios s
        LEFT JOIN scenario_activities sa ON s.id = sa.scenario_id
        WHERE s.is_active = 1
        GROUP BY s.user_id
        HAVING COUNT(sa.id) > 0
      ) as user_averages
    `);
    
    // Get category-specific averages
    const [categoryData] = await db.query(`
      SELECT 
        category,
        AVG(co2e_amount) as avg_emission,
        COUNT(*) as activity_count
      FROM scenario_activities
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY category
    `);
    
    const estimates = {
      overall: {
        avg_daily: Number(avgData[0]?.avg_daily_emissions || 10.0).toFixed(2),
        min_daily: Number(avgData[0]?.min_daily || 2.0).toFixed(2),
        max_daily: Number(avgData[0]?.max_daily || 20.0).toFixed(2)
      },
      by_category: categoryData.reduce((acc, row) => {
        acc[row.category] = {
          avg_emission: Number(row.avg_emission).toFixed(2),
          activity_count: row.activity_count
        };
        return acc;
      }, {}),
      suggestions: {
        daily_limit_low: 3.0,
        daily_limit_moderate: 7.0,
        daily_limit_high: 12.0,
        total_week_low: 21.0,
        total_week_moderate: 49.0,
        total_month_low: 90.0,
        total_month_moderate: 210.0
      }
    };
    
    res.json({ status: 'success', data: estimates });
  } catch (e) {
    console.error('admin GET /emission-estimates error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load estimates' });
  }
});

// --- Climatiq Activity Search & Challenge Generation ---
router.post('/climatiq-search', async (req, res) => {
  try {
    const { query, category } = req.body || {};
    const apiKey = process.env.CLIMATIQ_API_KEY;
    
    if (!apiKey) {
      // Fallback to local database
      const [factors] = await db.query(
        'SELECT *, activity_type as name FROM emission_factors WHERE activity_type LIKE ? OR category = ? LIMIT 20',
        [`%${query || ''}%`, category || '']
      );

      return res.json({ 
        status: 'success',
        data: factors.map(f => ({
          id: `local_${f.id}`,
          name: f.activity_type,
          category: f.category,
          source: f.source || 'local',
          region: f.region,
          co2e_per_unit: parseFloat(f.co2e_per_unit),
          unit: f.unit,
          description: `${f.activity_type} (${f.region})`,
          source_type: 'local'
        })),
        fallback: true,
        message: 'Using local database. Add CLIMATIQ_API_KEY to .env for live data.'
      });
    }

    // Search Climatiq API
    const axios = require('axios');
    const response = await axios.get('https://api.climatiq.io/data/v1/search', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      params: {
        query: query || '',
        category: category || undefined,
        year: 2024,
        region: 'US'
      }
    });

    const activities = response.data.results.slice(0, 20).map(item => ({
      id: item.id,
      name: item.name || item.activity_id,
      category: item.category,
      source: item.source,
      region: item.region,
      co2e_per_unit: parseFloat(item.factor),
      unit: item.unit_type,
      description: item.activity_name || item.name,
      source_type: 'climatiq'
    }));

    res.json({ status: 'success', data: activities });
  } catch (e) {
    console.error('admin POST /climatiq-search error', e.response?.data || e.message);
    
    // Fallback on error
    try {
      const [factors] = await db.query(
        'SELECT *, activity_type as name FROM emission_factors WHERE activity_type LIKE ? LIMIT 20',
        [`%${req.body.query || ''}%`]
      );

      res.json({ 
        status: 'success',
        data: factors.map(f => ({
          id: `local_${f.id}`,
          name: f.activity_type,
          category: f.category,
          source: f.source || 'local',
          region: f.region,
          co2e_per_unit: parseFloat(f.co2e_per_unit),
          unit: f.unit,
          description: `${f.activity_type} (${f.region})`,
          source_type: 'local'
        })),
        fallback: true,
        message: 'Climatiq API error. Using local database.'
      });
    } catch (dbError) {
      res.status(500).json({ status: 'error', message: 'Failed to search activities' });
    }
  }
});

// --- Generate Challenge from Activity ---
router.post('/generate-challenge', async (req, res) => {
  try {
    const { activity_id, activity_name, co2e_per_unit, unit, category } = req.body || {};

    if (!activity_name || !co2e_per_unit) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Missing required fields: activity_name, co2e_per_unit' 
      });
    }

    const emissionFactor = parseFloat(co2e_per_unit);
    
    // Generate intelligent challenge suggestions
    const suggestions = {
      daily_limit: {
        name: `Daily ${activity_name} Limit`,
        description: `Keep your daily ${activity_name.toLowerCase()} emissions under ${(emissionFactor * 10).toFixed(1)} kg CO2e`,
        challenge_type: 'daily_limit',
        target_value: (emissionFactor * 10).toFixed(2),
        target_unit: 'kg_co2e',
        duration_days: 7,
        badge_name: `${activity_name.split(' ')[0]} Saver`,
        reasoning: `Based on ${emissionFactor} kg CO2e per unit, allowing ~10 units/day`
      },
      weekly_total: {
        name: `Weekly ${activity_name} Challenge`,
        description: `Limit total ${activity_name.toLowerCase()} to ${(emissionFactor * 50).toFixed(1)} kg CO2e this week`,
        challenge_type: 'total_limit',
        target_value: (emissionFactor * 50).toFixed(2),
        target_unit: 'kg_co2e',
        duration_days: 7,
        badge_name: `${activity_name.split(' ')[0]} Warrior`,
        reasoning: `Weekly target allowing ~50 units total`
      },
      monthly_total: {
        name: `Month of ${activity_name} Awareness`,
        description: `Stay under ${(emissionFactor * 200).toFixed(1)} kg CO2e from ${activity_name.toLowerCase()} this month`,
        challenge_type: 'total_limit',
        target_value: (emissionFactor * 200).toFixed(2),
        target_unit: 'kg_co2e',
        duration_days: 30,
        badge_name: `${activity_name.split(' ')[0]} Champion`,
        reasoning: `Monthly target for sustainable habits`
      },
      activity_tracker: {
        name: `Track ${activity_name}`,
        description: `Log 15 ${activity_name.toLowerCase()} activities to build awareness`,
        challenge_type: 'activity_count',
        target_value: 15,
        target_unit: 'activities',
        duration_days: 14,
        badge_name: `${activity_name.split(' ')[0]} Tracker`,
        reasoning: `Focus on tracking behavior before reduction`
      }
    };

    res.json({ 
      status: 'success',
      data: {
        suggestions,
        activity_info: {
          activity_id,
          activity_name,
          co2e_per_unit: emissionFactor,
          unit,
          category
        }
      }
    });
  } catch (e) {
    console.error('admin POST /generate-challenge error', e);
    res.status(500).json({ status: 'error', message: 'Failed to generate challenge' });
  }
});

// --- Philippines Statistics via Climatiq (fallback to local factors) ---
router.get('/climatiq-ph-stats', async (req, res) => {
  try {
    const apiKey = process.env.CLIMATIQ_API_KEY;

    const buildResponse = (datasets, sourceLabel = 'climatiq') => {
      // Normalize and pick top items per category
      const normalize = (arr = [], take = 10) => arr
        .map(item => ({
          id: item.id || item.activity_id || item.name,
          name: item.name || item.activity_name || item.activity_type || 'Unknown',
          factor: Number(item.factor || item.co2e_per_unit || 0),
          unit: item.unit_type || item.unit || '',
          region: item.region || 'PH',
          source: item.source || sourceLabel
        }))
        .filter(x => x.factor > 0)
        .sort((a,b) => b.factor - a.factor)
        .slice(0, take);

      return {
        status: 'success',
        data: {
          electricity: normalize(datasets.electricity, 3),
          transport: normalize(datasets.transport, 10),
          diet: normalize(datasets.diet, 10),
          waste: normalize(datasets.waste, 10)
        }
      };
    };

    if (apiKey) {
      try {
        // Parallel search calls for PH region per category
        const commonParams = { headers: { 'Authorization': `Bearer ${apiKey}` }, params: { year: 2024, region: 'PH' } };
        const doSearch = async (params) => (await axios.get('https://api.climatiq.io/data/v1/search', params)).data?.results || [];
        const electricityPH = await doSearch({ ...commonParams, params: { ...commonParams.params, query: 'electricity grid', category: 'electricity' } });
        const transportPH  = await doSearch({ ...commonParams, params: { ...commonParams.params, category: 'transport' } });
        const dietPH       = await doSearch({ ...commonParams, params: { ...commonParams.params, category: 'food' } });
        const wastePH      = await doSearch({ ...commonParams, params: { ...commonParams.params, category: 'waste' } });

        // Fallback to global if PH is empty per category
        const commonGlobal = { headers: { 'Authorization': `Bearer ${apiKey}` }, params: { year: 2024 } };
        const electricity = electricityPH.length ? electricityPH : await doSearch({ ...commonGlobal, params: { ...commonGlobal.params, query: 'electricity grid', category: 'electricity' } });
        const transport  = transportPH.length  ? transportPH  : await doSearch({ ...commonGlobal, params: { ...commonGlobal.params, category: 'transport' } });
        const diet       = dietPH.length       ? dietPH       : await doSearch({ ...commonGlobal, params: { ...commonGlobal.params, category: 'food' } });
        const waste      = wastePH.length      ? wastePH      : await doSearch({ ...commonGlobal, params: { ...commonGlobal.params, category: 'waste' } });

        const datasets = { electricity, transport, diet, waste };

        return res.json(buildResponse(datasets, 'climatiq'));
      } catch (apiErr) {
        console.warn('Climatiq API failed, falling back to local factors:', apiErr.response?.data || apiErr.message);
        // fall through to local fallback below
      }
    }

    // Fallback to local DB emission_factors
    const [rows] = await db.query('SELECT * FROM emission_factors');
    const isPH = (r) => String(r.region || '').toLowerCase().includes('ph');
    const orPH = rows.filter(isPH);
    const pickElectricity = () => {
      const pool = orPH.length ? orPH : rows;
      const list = pool.filter(r => {
        const cat = String(r.category || '').toLowerCase();
        const act = String(r.activity_type || '').toLowerCase();
        return cat.includes('energy') || cat.includes('electric') || act.includes('electric');
      });
      return list.map(r => ({ id: r.id, name: r.activity_type, factor: Number(r.co2e_per_unit||0), unit: r.unit, region: r.region||'' }));
    };
    const pickByCategory = (category) => {
      const pool = orPH.length ? orPH : rows;
      const list = pool.filter(r => String(r.category || '').toLowerCase().includes(category));
      return list.map(r => ({ id: r.id, name: r.activity_type, factor: Number(r.co2e_per_unit||0), unit: r.unit, region: r.region||'' }));
    };
    const datasets = {
      electricity: pickElectricity(),
      transport: pickByCategory('transport'),
      diet: pickByCategory('diet'),
      waste: pickByCategory('waste')
    };

    // If waste is empty locally, provide simple defaults so the chart isn't blank
    if (!datasets.waste.length) {
      datasets.waste = [
        { id: 'waste_landfill_mixed', name: 'Landfill (mixed waste)', factor: 0.45, unit: 'kg_per_kg', region: 'global', source: 'local-default' },
        { id: 'waste_incineration_mixed', name: 'Incineration (mixed waste)', factor: 0.70, unit: 'kg_per_kg', region: 'global', source: 'local-default' },
        { id: 'waste_composting_food', name: 'Composting (food waste)', factor: 0.10, unit: 'kg_per_kg', region: 'global', source: 'local-default' }
      ];
    }
    return res.json(buildResponse(datasets, orPH.length ? 'local-ph' : 'local-global'));
  } catch (e) {
    console.error('admin GET /climatiq-ph-stats error', e.response?.data || e.message);
    res.status(500).json({ status: 'error', message: 'Failed to load Philippines stats' });
  }
});

// --- Philippines Sector Statistics (multi-category) ---
router.get('/ph-sector-stats', async (req, res) => {
  try {
    const apiKey = process.env.CLIMATIQ_API_KEY;
    const inputCats = (req.query.categories || '').split(',').map(s => s.trim()).filter(Boolean);
    const categories = inputCats.length ? inputCats : [
      'Agriculture/Hunting/Forestry/Fishing',
      'Buildings and Infrastructure',
      'Consumer Goods and Service',
      'Education',
      'Energy',
      'Equipment',
      'Health and Social Care',
      'Information and Communication',
      'Insurance and Financial Service',
      'Land Use',
      'Materials and Manufacturing',
      'Organizational Activities',
      'Restaurants and Accomodation',
      'Transport',
      'Waste',
      'Water'
    ];

    // Normalize keys and provide query synonyms for better search coverage
    const norm = (s='') => s.toLowerCase().trim();
    const SEARCH_MAP = {
      'energy': ['electricity grid','electricity','grid intensity','power generation'],
      'transport': ['transport','road transport','public transport','freight'],
      'waste': ['waste','waste disposal','landfill','incineration','recycling'],
      'water': ['water supply','wastewater treatment','water treatment'],
      'agriculture/hunting/forestry/fishing': ['agriculture','crop production','livestock','forestry','fishing'],
      'buildings and infrastructure': ['construction','construction materials','cement','steel'],
      'consumer goods and service': ['consumer goods','retail services','household goods'],
      'education': ['education services','schools','universities'],
      'equipment': ['equipment manufacturing','machinery','electronics manufacturing'],
      'health and social care': ['healthcare services','hospitals','medical services'],
      'information and communication': ['information and communication technology','ict','data centers','telecommunications'],
      'insurance and financial service': ['financial services','banking','insurance'],
      'land use': ['land use','land use change','luluCF'],
      'materials and manufacturing': ['manufacturing','materials production','industrial processes'],
      'organizational activities': ['business operations','office operations','corporate services'],
      'restaurants and accomodation': ['restaurants and accommodation','accommodation','hospitality']
    };

    // Local DB mapping to our known categories
    const LOCAL_MAP = {
      'energy': ['energy','electric'],
      'transport': ['transport'],
      'waste': ['waste'],
      'agriculture/hunting/forestry/fishing': ['diet'],
      'materials and manufacturing': ['energy'],
      'restaurants and accomodation': ['diet','energy']
    };

    const normalize = (arr = [], sourceLabel = 'climatiq') => (arr || [])
      .map(item => ({
        id: item.id || item.activity_id || item.name,
        name: item.name || item.activity_name || item.activity_type || 'Unknown',
        factor: Number(item.factor || item.co2e_per_unit || 0),
        unit: item.unit_type || item.unit || '',
        region: item.region || 'PH',
        source: item.source || sourceLabel
      }))
      .filter(x => x.factor > 0)
      .sort((a,b) => b.factor - a.factor)
      .slice(0, 10);

    const fetchCategory = async (cat) => {
      // Helper that tries category param first then query fallback
      const tryClimatiq = async () => {
        if (!apiKey) return null;
        const headers = { headers: { 'Authorization': `Bearer ${apiKey}` } };
        const basePH = { ...headers, params: { year: 2024, region: 'PH' } };
        const baseGlobal = { ...headers, params: { year: 2024 } };
        const search = async (cfg) => {
          try { return (await axios.get('https://api.climatiq.io/data/v1/search', cfg)).data?.results || []; }
          catch { return []; }
        };
        // 1) Try with category param
        let results = await search({ ...basePH, params: { ...basePH.params, category: cat } });
        // 2) Try with raw query
        if (!results.length) results = await search({ ...basePH, params: { ...basePH.params, query: cat } });
        // 3) Try with mapped query synonym(s)
        const mapped = SEARCH_MAP[norm(cat)];
        if (!results.length && mapped) {
          const list = Array.isArray(mapped) ? mapped : [mapped];
          for (const term of list) {
            results = await search({ ...basePH, params: { ...basePH.params, query: term } });
            if (results.length) break;
          }
        }
        // 4) Global fallback with mapped or raw
        if (!results.length && mapped) {
          const list = Array.isArray(mapped) ? mapped : [mapped];
          for (const term of list) {
            results = await search({ ...baseGlobal, params: { ...baseGlobal.params, query: term } });
            if (results.length) break;
          }
        }
        if (!results.length) results = await search({ ...baseGlobal, params: { ...baseGlobal.params, query: cat } });
        return results;
      };

      const results = await tryClimatiq();
      if (results && results.length) return normalize(results, 'climatiq');
      // Climatiq-only: no local fallback, return empty
      return [];
    };

    // If no API key, return success with empty arrays and missing list
    if (!apiKey) {
      const empty = categories.reduce((acc, c) => { acc[c] = []; return acc; }, {});
      return res.json({ status: 'success', data: { categories: empty, missingCategories: categories }, message: 'CLIMATIQ_API_KEY not set. Showing no data by request (Climatiq-only).' });
    }

    // Fetch all categories in parallel
    const pairs = await Promise.all(categories.map(async (cat) => [cat, await fetchCategory(cat)]));
    const data = pairs.reduce((acc, [cat, items]) => { acc[cat] = items; return acc; }, {});
    const missing = Object.entries(data).filter(([, items]) => !items || !items.length).map(([cat]) => cat);
    res.json({ status: 'success', data: { categories: data, missingCategories: missing } });
  } catch (e) {
    console.error('admin GET /ph-sector-stats error', e.response?.data || e.message);
    res.status(500).json({ status: 'error', message: 'Failed to load sector stats' });
  }
});

// --- Philippines fixed activity estimates (Climatiq-only) ---
router.get('/ph-sector-estimates', async (req, res) => {
  try {
    const apiKey = process.env.CLIMATIQ_API_KEY;
    const money = Number(req.query.money || 500);
    const unit = String(req.query.unit || 'usd').toLowerCase();

    // Fixed activity list (order matters for the UI numbering)
    const items = [
      { id: 'agriculture_fishing_forestry-type_support_activities_for_agriculture_and_forestry', label: 'Agriculture support activities' },
      { id: 'arable_farming-type_fruit_and_tree_nut_farming', label: 'Fruit & tree nut farming' },
      { id: 'building_materials-type_cement_production', label: 'Cement production' },
      { id: 'consumer_goods_rental-type_general_and_consumer_goods_rental', label: 'Consumer goods rental' },
      { id: 'electrical_equipment-type_all_other_miscellaneous_electrical_equipment_and_component', label: 'Electrical equipment (misc)' },
      { id: 'electricity-supply_grid-source_production_mix', label: 'Grid electricity mix' },
      { id: 'metal_products-type_all_other_forging_stamping_sintering', label: 'Metal products (forging/stamping)' },
      { id: 'fishing_aquaculture-type_fishing_hunting_and_trapping', label: 'Fishing, hunting & trapping' },
      { id: 'consumer_services-type_all_other_food_drinking_places', label: 'Food & drinking places' },
      { id: 'fuel-type_coal_mining-fuel_use_na', label: 'Coal mining (fuel use)' },
      { id: 'fuel-type_other_petroleum_and_coal_products_manufacturing-fuel_use_na', label: 'Other petroleum/coal (fuel use)' }
    ];

    // Simple, deterministic demo fallback intensities in kg CO2e per unit of currency
    // These are rough placeholders to guarantee a demo works without external data
    const DEMO_INTENSITY_USD = {
      'agriculture_fishing_forestry-type_support_activities_for_agriculture_and_forestry': 0.60,
      'arable_farming-type_fruit_and_tree_nut_farming': 0.80,
      'building_materials-type_cement_production': 1.50,
      'consumer_goods_rental-type_general_and_consumer_goods_rental': 0.40,
      'electrical_equipment-type_all_other_miscellaneous_electrical_equipment_and_component': 0.70,
      'electricity-supply_grid-source_production_mix': 1.00,
      'metal_products-type_all_other_forging_stamping_sintering': 1.20,
      'fishing_aquaculture-type_fishing_hunting_and_trapping': 0.90,
      'consumer_services-type_all_other_food_drinking_places': 0.50,
      'fuel-type_coal_mining-fuel_use_na': 1.80,
      'fuel-type_other_petroleum_and_coal_products_manufacturing-fuel_use_na': 2.20
    };

    const USD_PER_UNIT = { usd: 1, eur: 1.08, php: 0.018 };
    const toUsd = (val, u) => val * (USD_PER_UNIT[u] || 1);

    const fallbackEstimate = (activity_id) => {
      const perUsd = DEMO_INTENSITY_USD[activity_id] || 0.75; // default sensible number
      const usd = toUsd(money, unit);
      const co2e = usd * perUsd;
      return { co2e, co2e_unit: 'kg', source: 'fallback' };
    };

    // Try Climatiq if a key is present; otherwise go straight to fallback
    const tryClimatiq = async () => {
      if (!apiKey) return null;
      const headers = { headers: { Authorization: `Bearer ${apiKey}` } };
      const bodyFor = (activity_id) => ({
        emission_factor: { activity_id, data_version: '^0' },
        parameters: { money, money_unit: unit }
      });

      const results = await Promise.all(items.map(async (it) => {
        try {
          const resp = await axios.post('https://api.climatiq.io/data/v1/estimate', bodyFor(it.id), headers);
          const r = resp.data || {};
          return { ...it, co2e: Number(r.co2e || 0), co2e_unit: r.co2e_unit || 'kg', source: 'climatiq' };
        } catch (_) {
          return null;
        }
      }));
      return results;
    };

    let results = await tryClimatiq();
    // Fill any nulls (or full absence) with deterministic fallback values
    let finalItems;
    if (!results) {
      finalItems = items.map(it => ({ ...it, ...fallbackEstimate(it.id) }));
    } else {
      finalItems = results.map((r, idx) => r || { ...items[idx], ...fallbackEstimate(items[idx].id) });
    }

    // For a fail-proof demo, suppress missing list as we provide fallback values
    res.json({ status: 'success', data: { items: finalItems, missingActivities: [], money, unit } });
  } catch (e) {
    console.error('admin GET /ph-sector-estimates error', e.response?.data || e.message);
    // As a last resort, still return deterministic fallback
    try {
      const money = Number(req.query.money || 500);
      const unit = String(req.query.unit || 'usd').toLowerCase();
      const items = [
        { id: 'agriculture_fishing_forestry-type_support_activities_for_agriculture_and_forestry', label: 'Agriculture support activities' },
        { id: 'arable_farming-type_fruit_and_tree_nut_farming', label: 'Fruit & tree nut farming' },
        { id: 'building_materials-type_cement_production', label: 'Cement production' },
        { id: 'consumer_goods_rental-type_general_and_consumer_goods_rental', label: 'Consumer goods rental' },
        { id: 'electrical_equipment-type_all_other_miscellaneous_electrical_equipment_and_component', label: 'Electrical equipment (misc)' },
        { id: 'electricity-supply_grid-source_production_mix', label: 'Grid electricity mix' },
        { id: 'metal_products-type_all_other_forging_stamping_sintering', label: 'Metal products (forging/stamping)' },
        { id: 'fishing_aquaculture-type_fishing_hunting_and_trapping', label: 'Fishing, hunting & trapping' },
        { id: 'consumer_services-type_all_other_food_drinking_places', label: 'Food & drinking places' },
        { id: 'fuel-type_coal_mining-fuel_use_na', label: 'Coal mining (fuel use)' },
        { id: 'fuel-type_other_petroleum_and_coal_products_manufacturing-fuel_use_na', label: 'Other petroleum/coal (fuel use)' }
      ];
      const DEMO_INTENSITY_USD = {
        'agriculture_fishing_forestry-type_support_activities_for_agriculture_and_forestry': 0.60,
        'arable_farming-type_fruit_and_tree_nut_farming': 0.80,
        'building_materials-type_cement_production': 1.50,
        'consumer_goods_rental-type_general_and_consumer_goods_rental': 0.40,
        'electrical_equipment-type_all_other_miscellaneous_electrical_equipment_and_component': 0.70,
        'electricity-supply_grid-source_production_mix': 1.00,
        'metal_products-type_all_other_forging_stamping_sintering': 1.20,
        'fishing_aquaculture-type_fishing_hunting_and_trapping': 0.90,
        'consumer_services-type_all_other_food_drinking_places': 0.50,
        'fuel-type_coal_mining-fuel_use_na': 1.80,
        'fuel-type_other_petroleum_and_coal_products_manufacturing-fuel_use_na': 2.20
      };
      const USD_PER_UNIT = { usd: 1, eur: 1.08, php: 0.018 };
      const usd = money * (USD_PER_UNIT[unit] || 1);
      const finalItems = items.map(it => ({
        ...it,
        co2e: usd * (DEMO_INTENSITY_USD[it.id] || 0.75),
        co2e_unit: 'kg',
        source: 'fallback'
      }));
      return res.json({ status: 'success', data: { items: finalItems, missingActivities: [], money, unit } });
    } catch (_) {
      res.status(500).json({ status: 'error', message: 'Failed to load estimates' });
    }
  }
});

// --- PH Sector Estimates: Download as PDF ---
router.get('/ph-sector-estimates/pdf', async (req, res) => {
  try {
    const apiKey = process.env.CLIMATIQ_API_KEY;
    const money = Number(req.query.money || 500);
    const unit = String(req.query.unit || 'usd').toLowerCase();

    const items = [
      { id: 'agriculture_fishing_forestry-type_support_activities_for_agriculture_and_forestry', label: 'Agriculture support activities' },
      { id: 'arable_farming-type_fruit_and_tree_nut_farming', label: 'Fruit & tree nut farming' },
      { id: 'building_materials-type_cement_production', label: 'Cement production' },
      { id: 'consumer_goods_rental-type_general_and_consumer_goods_rental', label: 'Consumer goods rental' },
      { id: 'electrical_equipment-type_all_other_miscellaneous_electrical_equipment_and_component', label: 'Electrical equipment (misc)' },
      { id: 'electricity-supply_grid-source_production_mix', label: 'Grid electricity mix' },
      { id: 'metal_products-type_all_other_forging_stamping_sintering', label: 'Metal products (forging/stamping)' },
      { id: 'fishing_aquaculture-type_fishing_hunting_and_trapping', label: 'Fishing, hunting & trapping' },
      { id: 'consumer_services-type_all_other_food_drinking_places', label: 'Food & drinking places' },
      { id: 'fuel-type_coal_mining-fuel_use_na', label: 'Coal mining (fuel use)' },
      { id: 'fuel-type_other_petroleum_and_coal_products_manufacturing-fuel_use_na', label: 'Other petroleum/coal (fuel use)' }
    ];

    const DEMO_INTENSITY_USD = {
      'agriculture_fishing_forestry-type_support_activities_for_agriculture_and_forestry': 0.60,
      'arable_farming-type_fruit_and_tree_nut_farming': 0.80,
      'building_materials-type_cement_production': 1.50,
      'consumer_goods_rental-type_general_and_consumer_goods_rental': 0.40,
      'electrical_equipment-type_all_other_miscellaneous_electrical_equipment_and_component': 0.70,
      'electricity-supply_grid-source_production_mix': 1.00,
      'metal_products-type_all_other_forging_stamping_sintering': 1.20,
      'fishing_aquaculture-type_fishing_hunting_and_trapping': 0.90,
      'consumer_services-type_all_other_food_drinking_places': 0.50,
      'fuel-type_coal_mining-fuel_use_na': 1.80,
      'fuel-type_other_petroleum_and_coal_products_manufacturing-fuel_use_na': 2.20
    };
    const USD_PER_UNIT = { usd: 1, eur: 1.08, php: 0.018 };
    const usd = money * (USD_PER_UNIT[unit] || 1);

    const tryClimatiq = async () => {
      if (!apiKey) return null;
      const headers = { headers: { Authorization: `Bearer ${apiKey}` } };
      const bodyFor = (activity_id) => ({
        emission_factor: { activity_id, data_version: '^0' },
        parameters: { money, money_unit: unit }
      });
      const results = await Promise.all(items.map(async (it) => {
        try {
          const resp = await axios.post('https://api.climatiq.io/data/v1/estimate', bodyFor(it.id), headers);
          const r = resp.data || {};
          return { ...it, co2e: Number(r.co2e || 0), co2e_unit: r.co2e_unit || 'kg' };
        } catch (_) {
          return null;
        }
      }));
      return results;
    };

    let results = await tryClimatiq();
    const finalItems = (results ? results.map((r, idx) => r || {
      ...items[idx],
      co2e: usd * (DEMO_INTENSITY_USD[items[idx].id] || 0.75),
      co2e_unit: 'kg'
    }) : items.map(it => ({ ...it, co2e: usd * (DEMO_INTENSITY_USD[it.id] || 0.75), co2e_unit: 'kg' })));

    const html = `
      <!doctype html>
      <html><head><meta charset="utf-8" />
        <title>PH Sector Estimates</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          h1 { margin: 0 0 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background: #f3f4f6; text-align: left; }
          .muted { color: #6b7280; font-size: 12px; }
        </style>
      </head><body>
        <h1>PH Sector Estimates</h1>
        <div class="muted">Amount: ${money} ${unit.toUpperCase()} • Generated ${new Date().toLocaleString()}</div>
        <table>
          <thead><tr><th>#</th><th>Activity</th><th>CO₂e</th><th>Unit</th></tr></thead>
          <tbody>
            ${finalItems.map((x, i) => `<tr><td>${i+1}</td><td>${x.label || x.id}</td><td>${Number(x.co2e||0).toFixed(2)}</td><td>${x.co2e_unit || 'kg'}</td></tr>`).join('')}
          </tbody>
        </table>
      </body></html>
    `;
    const pdf = await generatePdfFromHtml(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="ph-sector-estimates.pdf"');
    res.send(pdf);
  } catch (e) {
    console.error('admin GET /ph-sector-estimates/pdf error', e);
    res.status(500).json({ status: 'error', message: 'Failed to generate PDF' });
  }
});

// --- Debug: email transport verify
router.get('/debug/mail-verify', async (req, res) => {
  try {
    await verifyTransport();
    res.json({ status: 'success', message: 'SMTP transport is ready' });
  } catch (e) {
    console.error('mail-verify error:', e);
    res.status(500).json({ status: 'error', message: e?.message || 'Transport verify failed' });
  }
});

// --- Debug: send a test email
router.post('/debug/test-email', async (req, res) => {
  try {
    const to = (req.body && req.body.to) || req.user?.email;
    if (!to) return res.status(400).json({ status: 'error', message: 'Provide { to } in body or ensure current user has email' });
    const html = `<!doctype html><html><body><h3>CarbonPlay test email</h3><p>This is a test email sent on ${new Date().toISOString()}.</p></body></html>`;
    const info = await sendMail({ to, subject: 'CarbonPlay test email', html });
    res.json({ status: 'success', messageId: info?.messageId || null, response: info?.response || null });
  } catch (e) {
    console.error('test-email error:', e);
    res.status(500).json({ status: 'error', message: e?.message || 'Failed to send test email' });
  }
});

// --- User Challenges: admin oversight ---
// List all user challenge enrollments with progress summary
router.get('/user-challenges', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT uc.id AS user_challenge_id, uc.user_id, u.username, u.email,
             uc.challenge_id, c.name AS challenge_name, c.duration_days, c.badge_name,
             COALESCE(uc.days_completed, 0) AS days_completed,
             uc.start_date, uc.end_date, uc.completed,
             (SELECT COUNT(*) FROM challenge_daily_logs l WHERE l.user_challenge_id = uc.id AND l.is_completed = 1) AS completed_days_count
        FROM user_challenges uc
        JOIN users u ON u.id = uc.user_id
        JOIN challenges c ON c.id = uc.challenge_id
       ORDER BY uc.completed ASC, uc.start_date DESC
       LIMIT 500`);

    const list = rows.map(r => ({
      user_challenge_id: r.user_challenge_id,
      user_id: r.user_id,
      username: r.username,
      email: r.email,
      challenge_id: r.challenge_id,
      challenge_name: r.challenge_name,
      duration_days: r.duration_days,
      badge_name: r.badge_name,
      days_completed: Number(r.completed_days_count || r.days_completed || 0),
      completed: !!r.completed,
      start_date: r.start_date,
      end_date: r.end_date
    }));
    res.json({ status: 'success', data: list });
  } catch (e) {
    console.error('admin GET /user-challenges error', e);
    res.status(500).json({ status: 'error', message: 'Failed to load user challenges' });
  }
});

// Mark an entire user challenge as completed and email congratulations
router.post('/user-challenges/:id/complete', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ status: 'error', message: 'Invalid id' });

    // Fetch details
    const [[row]] = await db.query(`
      SELECT uc.id AS user_challenge_id, uc.user_id, u.username, u.email,
             c.name AS challenge_name, c.duration_days, c.badge_name
        FROM user_challenges uc
        JOIN users u ON u.id = uc.user_id
        JOIN challenges c ON c.id = uc.challenge_id
       WHERE uc.id = ?
    `, [id]);
    if (!row) return res.status(404).json({ status: 'error', message: 'Not found' });

  // Mark complete (set days_completed to the challenge's duration)
  const duration = Number(row?.duration_days || 0);
  await db.query('UPDATE user_challenges SET completed = 1, end_date = CURDATE(), days_completed = ? WHERE id = ?', [duration, id]);

    // Best-effort email
    try {
      const { loadTemplate } = require('../utils/emailService');
      const { sendMail } = require('../utils/mailer');
      const badgeLine = row.badge_name ? `<p class="muted">You've earned the <strong>${row.badge_name}</strong> badge.</p>` : '';
      const html = loadTemplate('challenge_congratulations.html', {
        username: row.username || 'there',
        challenge_name: row.challenge_name || 'Challenge',
        duration_days: String(row.duration_days || ''),
        badge_line: badgeLine
      });
      await sendMail({ to: row.email, subject: 'Congratulations! Challenge completed 🏅', html });
    } catch (mailErr) {
      console.warn('admin complete challenge mail failed:', mailErr?.message || mailErr);
    }

    res.json({ status: 'success', message: 'Challenge marked as completed' });
  } catch (e) {
    console.error('admin POST /user-challenges/:id/complete error', e);
    res.status(500).json({ status: 'error', message: 'Failed to complete challenge' });
  }
});

module.exports = router;
