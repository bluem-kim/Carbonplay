# Daily Challenge Tracking System

## Overview

The new daily challenge tracking system provides a **day-by-day progress logging interface** that prevents cheating and creates an engaging user experience.

## Key Features

### ✅ Day-by-Day Tracking
- Each challenge is divided into individual days
- Users can only log progress for the current day
- Future days are locked until previous days are completed

### ✅ Anti-Cheating Mechanism
- Days are unlocked sequentially
- Cannot skip ahead or log future days
- Progress is tied to actual calendar dates

### ✅ Daily Goals
- Total challenge goal is divided by duration
- Each day shows a specific goal to meet
- Visual feedback on completion

### ✅ Progress Visualization
- Calendar-style interface
- Color-coded day status (locked, unlocked, completed)
- Overall progress bar

---

## How It Works

### 1. Challenge Structure

When a user joins a challenge:
```
Challenge: "Week Without Wheels"
Duration: 7 days
Total Goal: 28 kg CO₂e
Daily Goal: 28 / 7 = 4 kg CO₂e per day
```

### 2. Daily Unlocking

```
Day 1: Unlocked (start date)
Day 2: Locked (until Day 1 completed)
Day 3: Locked (until Day 2 completed)
...
```

### 3. Completion Logic

**Daily Limit Challenge:**
- User logs: 3.5 kg CO₂e
- Daily goal: 4.0 kg CO₂e
- Result: ✅ Day completed (under limit)

**Activity Count Challenge:**
- User logs: 3 activities
- Daily goal: 2 activities
- Result: ✅ Day completed (met minimum)

---

## Database Schema

### `challenge_daily_logs` Table

```sql
CREATE TABLE challenge_daily_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_challenge_id INT NOT NULL,
  day_number INT NOT NULL (1 to duration_days),
  log_date DATE NOT NULL (actual calendar date),
  value_logged DECIMAL(10,2) (CO₂e or activity count),
  notes TEXT (optional user notes),
  is_completed TINYINT(1) (1 if day goal met),
  logged_at TIMESTAMP (when user logged),
  
  UNIQUE KEY (user_challenge_id, day_number)
);
```

### Updated `user_challenges` Table

```sql
ALTER TABLE user_challenges ADD:
  current_day INT DEFAULT 1,
  last_log_date DATE,
  total_progress DECIMAL(10,2) DEFAULT 0.00,
  days_completed INT DEFAULT 0
```

---

## API Endpoints

### Get Challenge with Daily Breakdown

```
GET /api/my/challenges/:id/days

Response:
{
  "status": "success",
  "data": {
    "user_challenge": { /* challenge info */ },
    "days": [
      {
        "day_number": 1,
        "log_date": "2025-10-24",
        "daily_goal": 4.0,
        "value_logged": 3.5,
        "notes": "Used bike today!",
        "is_completed": true,
        "is_unlocked": true,
        "is_current": false,
        "is_future": false,
        "status": "completed"
      },
      {
        "day_number": 2,
        "log_date": "2025-10-25",
        "daily_goal": 4.0,
        "value_logged": null,
        "is_completed": false,
        "is_unlocked": true,
        "is_current": true,
        "status": "unlocked"
      },
      {
        "day_number": 3,
        "log_date": "2025-10-26",
        "daily_goal": 4.0,
        "value_logged": null,
        "is_completed": false,
        "is_unlocked": false,
        "is_future": true,
        "status": "locked"
      }
    ],
    "summary": {
      "total_days": 7,
      "completed_days": 1,
      "current_day": 2,
      "days_remaining": 6,
      "total_logged": 3.5,
      "target_value": 28.0,
      "progress_percent": 14.29,
      "daily_goal": 4.0
    }
  }
}
```

### Log Daily Progress

```
POST /api/my/challenges/:id/log-day

Body:
{
  "day_number": 2,
  "value_logged": 2.8,
  "notes": "Took bus instead of car"
}

Response:
{
  "status": "success",
  "message": "Day completed!",
  "data": {
    "day_number": 2,
    "value_logged": 2.8,
    "daily_goal": 4.0,
    "is_completed": true,
    "completed_days": 2,
    "total_days": 7,
    "challenge_completed": false
  }
}
```

### Get All Challenges with Day Counts

```
GET /api/my/challenges-with-days

Response:
{
  "status": "success",
  "data": [
    {
      "user_challenge_id": 1,
      "challenge_id": 5,
      "name": "Week Without Wheels",
      "challenge_type": "daily_limit",
      "target_value": 28.0,
      "duration_days": 7,
      "current_day": 2,
      "completed_days_count": 1,
      "progress_percent": 14.29,
      "days_remaining": 6,
      "status": "active"
    }
  ]
}
```

---

## UI Components

### Challenge Tracker Page (`challenge-tracker.html`)

**URL:** `challenge-tracker.html?id={user_challenge_id}`

**Features:**
- Challenge header with name, description, type
- Summary stats (total days, completed, current day, daily goal)
- Overall progress bar
- Daily cards showing each day's status
- Lock/unlock visual indicators
- Log progress modal for current day

**Visual Layout:**
```
┌────────────────────────────────────┐
│ Challenge Header                   │
│ - Name, Description, Type          │
│ - Progress Stats                   │
│ - Overall Progress Bar             │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ Daily Progress Tracker             │
│                                    │
│  [✓] Day 1 - Oct 24 (Completed)   │
│       3.5 / 4.0 kg CO₂e            │
│       "Used bike today!"           │
│                                    │
│  [ ] Day 2 - Oct 25 (Today)        │
│       Goal: 4.0 kg CO₂e            │
│       [Log Progress] button        │
│                                    │
│  [🔒] Day 3 - Oct 26 (Locked)      │
│       Complete previous days       │
└────────────────────────────────────┘
```

### Dashboard Integration

**Changes:**
- Replaced old progress tracking with daily tracking API
- Added "Track" button to each challenge card
- Shows "Day X/Y completed" instead of generic progress
- Links to `challenge-tracker.html?id={user_challenge_id}`

---

## Daily Goal Calculation

### Daily Limit Challenge
```javascript
daily_goal = target_value
// Example: 4 kg CO₂e per day for all 7 days
```

### Total Limit Challenge
```javascript
daily_goal = target_value / duration_days
// Example: 28 kg total / 7 days = 4 kg per day
```

### Activity Count Challenge
```javascript
daily_goal = Math.ceil(target_value / duration_days)
// Example: 21 activities / 7 days = 3 activities per day
```

### Consecutive Days Challenge
```javascript
daily_goal = target_value
// Example: Stay under 5 kg CO₂e each day for streak
```

---

## XP Rewards

### Daily Completion
- **+10 XP** for completing each day

### Challenge Completion
- **+100 XP** bonus for completing entire challenge

### Example for 7-Day Challenge
```
Day 1: +10 XP
Day 2: +10 XP
Day 3: +10 XP
Day 4: +10 XP
Day 5: +10 XP
Day 6: +10 XP
Day 7: +10 XP + 100 XP bonus
Total: 170 XP
```

---

## User Experience Flow

### 1. Join Challenge
```
Dashboard → Browse Challenges → Join
→ Challenge created with start_date = today
```

### 2. Track Daily Progress
```
Dashboard → My Challenges → Click "Track"
→ Opens challenge-tracker.html
→ Shows Day 1 unlocked, Days 2-7 locked
```

### 3. Log Day 1
```
Click "Log Progress" on Day 1
→ Modal opens
→ Enter emissions: 3.2 kg CO₂e
→ Add notes: "Walked to work"
→ Submit
→ Day 1 marked complete ✓
→ Day 2 unlocks automatically
→ +10 XP awarded
```

### 4. Continue Daily
```
Return tomorrow
→ Day 2 is now current day
→ Day 1 shows completed with checkmark
→ Log Day 2 progress
→ Day 3 unlocks
```

### 5. Complete Challenge
```
Complete Day 7
→ All days show checkmark
→ Challenge marked completed
→ +100 XP bonus
→ Badge earned (if set)
→ Celebration modal
```

---

## Anti-Cheating Features

### 1. Sequential Unlocking
- Cannot skip days
- Must complete Day N before accessing Day N+1

### 2. Date Validation
- Each day tied to actual calendar date
- Cannot log future dates

### 3. Current Day Check
```javascript
days_elapsed = DATEDIFF(CURDATE(), start_date) + 1
is_current = day_number === Math.min(days_elapsed, duration_days)
is_future = day_number > days_elapsed
```

### 4. Backend Validation
```javascript
if (day_number > daysElapsed) {
  return error("This day is locked")
}
```

---

## Setup Instructions

### 1. Run Database Migration

```bash
mysql -u root -p carbonplay < backend/database/add_daily_challenge_tracking.sql
```

This creates:
- `challenge_daily_logs` table
- Adds columns to `user_challenges`

### 2. Restart Backend

```bash
cd backend
npm start
```

### 3. Access Challenge Tracker

1. Login to app
2. Go to Dashboard
3. Join a challenge
4. Click "Track" button
5. Start logging daily progress!

---

## Testing Guide

### Test Case 1: Join and Log Day 1

1. Join a 7-day challenge
2. Click "Track" button
3. Verify Day 1 is unlocked, Days 2-7 locked
4. Click "Log Progress" on Day 1
5. Enter value under daily goal
6. Submit
7. Verify Day 1 shows completed ✓
8. Verify Day 2 is now unlocked
9. Verify +10 XP awarded

### Test Case 2: Try to Skip Days

1. On Day 1, try to access Day 3 modal
2. Should not be possible (Day 3 shows lock icon)
3. No "Log Progress" button on locked days

### Test Case 3: Complete Entire Challenge

1. Log progress for all 7 days
2. On Day 7 completion, verify:
   - Challenge marked completed
   - +100 XP bonus awarded
   - Celebration modal shown
   - Badge earned (if configured)

---

## Benefits Over Old System

| Old System | New System |
|------------|------------|
| Track whenever | Track daily only |
| Manual refresh needed | Auto-updates |
| No anti-cheat | Sequential locking |
| Scenario-dependent | Independent tracking |
| Complex progress calc | Simple daily goals |
| No visual calendar | Full day breakdown |
| Generic progress % | Day-by-day completion |

---

## Future Enhancements

- [ ] Streak tracking (consecutive days logged)
- [ ] Daily reminders/notifications
- [ ] Social sharing of completed days
- [ ] Leaderboard for fastest completions
- [ ] Missed day penalties
- [ ] Bonus XP for perfect weeks
- [ ] Daily challenge variety (different activities each day)
- [ ] Photo uploads for proof

---

## Troubleshooting

### Days Not Unlocking

**Check:**
- Previous day is marked `is_completed = 1`
- `current_day` is updated in `user_challenges`
- Backend logic in `getChallengeWithDays`

### Wrong Daily Goal

**Check:**
- Challenge type
- Target value
- Duration days
- Calculation in `dailyChallengeController.js`

### Cannot Log Progress

**Check:**
- Day is unlocked (`is_unlocked = true`)
- Not a future day (`is_future = false`)
- User owns the challenge
- `user_challenge_id` is correct

---

**System is ready to use!** 🎉
