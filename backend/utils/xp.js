const db = require('../config/database');

// Ensure the user_xp table exists; create it if missing
async function ensureXpTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_xp (
      user_id INT NOT NULL PRIMARY KEY,
      xp_total INT NOT NULL DEFAULT 0,
      last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_user_xp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

// Add XP to a user (creates row if not present)
async function addXp(userId, amount) {
  if (!userId || !Number.isFinite(Number(amount))) return;
  await ensureXpTable();
  await db.query(
    `INSERT INTO user_xp (user_id, xp_total) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE xp_total = xp_total + VALUES(xp_total), last_updated = NOW()`,
    [userId, Math.floor(Number(amount))]
  );
}

// Fetch XP summary for a user
async function getXp(userId) {
  await ensureXpTable();
  const [rows] = await db.query('SELECT xp_total, last_updated FROM user_xp WHERE user_id = ?', [userId]);
  if (!rows.length) return { xp_total: 0, last_updated: null };
  return rows[0];
}

module.exports = { ensureXpTable, addXp, getXp };
// Convert total XP to a level and progress details
// Default: flat levels of levelSize XP each (e.g., 500 XP per level)
function xpToLevel(xpTotal, levelSize = 500) {
  const total = Math.max(0, Math.floor(Number(xpTotal || 0)));
  const size = Math.max(1, Math.floor(Number(levelSize || 500)));
  const level = Math.floor(total / size) + 1; // Level starts at 1 for 0..(size-1)
  const xpInLevel = total % size;
  const xpToNext = size - xpInLevel;
  const progressPct = size ? Math.floor((xpInLevel / size) * 100) : 0;
  return {
    level,
    level_size: size,
    xp_total: total,
    xp_in_level: xpInLevel,
    xp_to_next: xpToNext,
    xp_progress_pct: progressPct
  };
}

// Fetch XP with computed level info
async function getXpWithLevel(userId, levelSize = 500) {
  const { xp_total = 0, last_updated = null } = await getXp(userId);
  const computed = xpToLevel(xp_total, levelSize);
  return { ...computed, last_updated };
}

module.exports = { ensureXpTable, addXp, getXp, xpToLevel, getXpWithLevel };
