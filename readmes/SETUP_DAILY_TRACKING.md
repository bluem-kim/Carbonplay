# Setup Daily Challenge Tracking - Quick Guide

## Step 1: Run Database Migration

Open your MySQL/MariaDB command line and run:

```bash
mysql -u root -p carbonplay < backend/database/add_daily_challenge_tracking.sql
```

Or import via phpMyAdmin:
1. Open phpMyAdmin
2. Select `carbonplay` database
3. Click "Import" tab
4. Choose file: `backend/database/add_daily_challenge_tracking.sql`
5. Click "Go"

## Step 2: Verify Tables Created

Run this query to verify:

```sql
SHOW TABLES LIKE 'challenge_daily_logs';
```

Should return: `challenge_daily_logs`

## Step 3: Check New Columns

```sql
DESCRIBE user_challenges;
```

Should show these new columns:
- `current_day`
- `last_log_date`
- `total_progress`
- `days_completed`

## Step 4: Restart Backend

```bash
cd backend
npm start
```

## Step 5: Test It!

1. Login to CarbonPlay
2. Go to Dashboard
3. Join a challenge (or use existing one)
4. Click "Track" button on any challenge
5. Modal opens with daily tracker
6. Click "Log Progress" on Day 1
7. Enter value and submit
8. Day 1 should complete ✓, Day 2 unlocks!

## Troubleshooting

### Error: Table 'challenge_daily_logs' doesn't exist

**Solution:** Run the migration SQL file

### Error: Unknown column 'current_day' in 'user_challenges'

**Solution:** The ALTER TABLE commands in the SQL file weren't executed. Re-run the migration.

### No challenges showing

**Solution:** Make sure you've joined at least one challenge first

### "Failed to load challenge data"

**Check:**
1. Backend server is running
2. Database migration completed successfully
3. Browser console for specific errors

## What This System Does

- ✅ **Day-by-day tracking** - Each challenge broken into daily goals
- ✅ **Sequential unlocking** - Must complete Day 1 before Day 2 unlocks
- ✅ **Anti-cheat** - Cannot skip days or log future dates
- ✅ **Visual progress** - See all days at once with status indicators
- ✅ **XP rewards** - 10 XP per day + 100 XP bonus for completion

## Ready to Go!

Once the database migration is complete, the system is fully functional. No code changes needed - just refresh the dashboard and click "Track" on any challenge! 🎉
