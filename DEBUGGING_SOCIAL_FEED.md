# Social Feed Debugging Guide

## Problem
The "With Milestones", "Low CO₂e", and "Active Users" tabs appear to show the same data.

## What I've Added

### Backend Logging (backend/controllers/socialController.js)
The server now logs:
```
[getMilestones] User X requesting filter="low", limit=50
[getMilestones] Total users before filter: 3
[getMilestones] After "low" filter: 2 users with avg < 100 CO2e
```

### Frontend Logging (social_feed.html)
The browser console now shows:
```
[Frontend] Tab clicked: view="milestones", filter="low"
[Frontend] Switching to milestones view with filter="low"
[Frontend] loadMilestones called with CURRENT_FILTER="low"
[Frontend] Fetching: http://localhost:3000/api/social/milestones?limit=50&filter=low&ts=1729...
[Frontend] Received 2 users for filter="low"
```

## How to Test

1. **Start the backend server:**
   ```powershell
   cd backend
   npm start
   ```

2. **Open social_feed.html in your browser**

3. **Open browser DevTools (F12) → Console tab**

4. **Click each tab and watch the logs:**
   - Click "All" → should see `filter="all"` in both frontend and backend logs
   - Click "With Milestones" → should see `filter="milestones"`
   - Click "Low CO₂e" → should see `filter="low"`
   - Click "Active Users" → should see `filter="active"`

5. **Check the backend terminal** for corresponding logs showing:
   - What filter was received
   - How many users matched that filter

## Expected Behavior

### All Tab
- Shows ALL users in the database
- Sorted by most recent activity
- Should show 3 users (maria_mahal_ko, maria_labi58, second_acc69)

### With Milestones Tab
- Shows ONLY users who have at least one "milestone badge":
  - 10+ activities
  - 3+ scenarios
  - Avg CO₂e < 100 (and > 0)
  - Active in last 30 days
- Sorted by: badge count → likes → recency
- Based on your DB: should show ~1-2 users (maria_mahal_ko and second_acc69 have data)

### Low CO₂e Tab
- Shows ONLY users with avg_emissions > 0 AND avg_emissions < 100
- Sorted by LOWEST emissions first (ascending)
- Based on your DB: should show ~1-2 users who have activities

### Active Users Tab
- Shows ONLY users who have activity in the last 30 days
- Sorted by: most scenarios → most activities → recency
- Based on your DB: should show ~2 users (based on last_update timestamps)

## Common Issues

### Issue 1: All tabs show the same data
**Cause**: Browser caching the GET request
**Solution**: Already fixed with `ts` timestamp param and `Cache-Control: no-cache` header

### Issue 2: Filter not being sent to server
**Check**: Frontend logs should show the correct filter in the URL
**Fix**: Make sure `CURRENT_FILTER` is being set before `loadMilestones()` is called

### Issue 3: Server receiving correct filter but not applying it
**Check**: Backend logs should show "After X filter: N users"
**Fix**: Verify the filter logic matches your data (e.g., if no users have avg < 100, "low" will be empty)

### Issue 4: No data in any category
**Possible reasons**:
- No users have created scenarios/activities yet
- Database timestamps are old (> 30 days for "Active")
- Average emissions are too high (> 100 for "Low CO₂e")

**Solution**: Create test data:
```sql
-- Run in your MySQL database
INSERT INTO scenarios (user_id, name, description, is_active) 
VALUES (1, 'Test Scenario', 'Test', 1);

INSERT INTO scenario_activities (scenario_id, category, activity_type, value, unit, co2e_amount)
VALUES (1, 'transport', 'car_gasoline', 10, 'miles', 4.04);
```

## What Each Filter Actually Checks

### Milestones Filter
```javascript
// A user gets into "With Milestones" if they have ANY of:
stats.activities >= 10        // → Badge: "10+ activities"
stats.scenarios >= 3          // → Badge: "3+ scenarios"
(avg_emissions > 0 && < 100)  // → Badge: "Low CO₂e"
(last_update within 30 days)  // → Badge: "Active"
```

### Low CO₂e Filter
```javascript
// A user gets into "Low CO₂e" if:
stats.avg_emissions > 0 && stats.avg_emissions < 100
// Then sorted by LOWEST first (ascending)
```

### Active Users Filter
```javascript
// A user gets into "Active Users" if:
last_update within last 30 days
// Then sorted by: most scenarios → most activities → most recent
```

## Debugging Steps

1. **Check Frontend Console**:
   - Are tabs being clicked?
   - Is `CURRENT_FILTER` changing?
   - Is the fetch URL correct?

2. **Check Backend Terminal**:
   - Is the filter parameter received?
   - How many users before/after filter?

3. **Check Network Tab** (DevTools → Network):
   - Is a new request made on each tab click?
   - Does the response differ between tabs?
   - Check the `filter` query parameter in the request URL

4. **Check Database**:
   ```sql
   -- See what data exists
   SELECT u.id, u.username, 
          COUNT(DISTINCT s.id) as scenarios,
          COUNT(a.id) as activities,
          AVG(a.co2e_amount) as avg_co2e,
          MAX(s.updated_at) as last_update
   FROM users u
   LEFT JOIN scenarios s ON s.user_id = u.id AND s.is_active = 1
   LEFT JOIN scenario_activities a ON a.scenario_id = s.id
   GROUP BY u.id;
   ```

## Quick Fix Commands

If logs show the filter IS working but you're not seeing different data:

**Add more test data:**
```sql
-- Create a high-emission user (won't show in "Low CO₂e")
INSERT INTO scenarios (user_id, name, is_active) VALUES (2, 'High CO2 Scenario', 1);
INSERT INTO scenario_activities (scenario_id, category, activity_type, value, unit, co2e_amount)
VALUES (LAST_INSERT_ID(), 'diet', 'beef', 20, 'kg', 540);

-- Create a low-emission user (WILL show in "Low CO₂e")
INSERT INTO scenarios (user_id, name, is_active) VALUES (3, 'Low CO2 Scenario', 1);
INSERT INTO scenario_activities (scenario_id, category, activity_type, value, unit, co2e_amount)
VALUES (LAST_INSERT_ID(), 'transport', 'bicycle', 100, 'miles', 0);
```

**Force timestamps to be recent (for "Active" filter):**
```sql
UPDATE scenarios SET updated_at = NOW() WHERE user_id IN (1,2,3);
UPDATE scenario_activities SET created_at = NOW();
```

## Next Steps

After checking the logs:

1. **If filter param is not being sent**: Issue is in frontend tab click handler
2. **If filter param is sent but ignored**: Issue is in backend filter logic
3. **If filter works but all results are the same**: Issue is your test data (all users meet all criteria)
4. **If some filters return 0 results**: Expected behavior - not all users meet strict criteria

Share the console logs and terminal output and I can pinpoint the exact issue!
