# Challenge System Guide

## Overview
CarbonPlay's challenge system allows admins to create time-based carbon reduction challenges that users can join and complete to earn XP and badges.

## How It Works

### For Admins

#### Creating Challenges
1. Go to **Admin Panel** → **Challenges** tab
2. Click **"New Challenge"** button
3. Fill in:
   - **Name**: Challenge title (e.g., "Week Without Driving")
   - **Description**: What the challenge entails
   - **Target Reduction %**: How much users need to reduce emissions (e.g., 10 = 10% reduction)
   - **Duration (days)**: How long the challenge lasts (e.g., 7, 14, 30 days)
   - **Badge Name**: Award name for completion (optional)
   - **Active**: Check to make visible to users

#### Managing Challenges
- **Toggle Visibility**: Click the status button to show/hide challenges from users
  - 🟢 **Visible** (is_active = 1): Users can see and join
  - ⚫ **Hidden** (is_active = 0): Removed from user interface
- **Edit**: Click pencil icon to modify challenge details
- **Note**: Hiding a challenge does NOT affect users already enrolled - they can still complete it

### For Users

#### Joining a Challenge
1. Go to **Dashboard** → Click **"Join a Challenge"**
2. Select challenge scope:
   - **All Activities**: Track all your emissions
   - **Specific Scenario**: Track one scenario only
   - **Category**: Track specific category (transport, diet, energy, waste)
3. Click **"Join"** on desired challenge
4. System captures your baseline emissions from the period BEFORE joining

#### Challenge Progress
Progress is calculated as:
```
Progress % = ((Baseline - Current) / Baseline) × 100
```

**Example:**
- Baseline (before challenge): 50 kg CO₂e
- Current (during challenge): 40 kg CO₂e  
- Progress: ((50 - 40) / 50) × 100 = **20% reduction** ✓

#### Completion Rules
A challenge completes when:
1. **Target Met**: Progress reaches target reduction % → **Earn 100 XP** 🎉
2. **Time Expired**: Duration passes without reaching target → No bonus XP, marked complete

#### Why This System Works
Since users **freely input their activity data**, the system:
- ✅ Compares emissions during challenge vs before (fair baseline)
- ✅ Uses time windows to measure progress (not arbitrary snapshots)
- ✅ Auto-completes when time expires (no manual intervention)
- ✅ Rewards actual reduction behavior (not just logging less)

## Database Schema

### Challenges Table
```sql
- id: Challenge ID
- name: Challenge title
- description: Challenge details
- target_reduction: % reduction needed (e.g., 10.00)
- duration_days: How long challenge lasts
- badge_name: Award for completion
- is_active: 1 = visible to users, 0 = hidden
- created_at: When challenge was created
```

### User_Challenges Table
```sql
- id: Enrollment ID
- user_id: User who joined
- challenge_id: Which challenge
- start_date: When user joined
- starting_co2e: Baseline emissions (calculated at join time)
- current_co2e: Current emissions during challenge
- completed: 0 = in progress, 1 = finished
- end_date: When challenge was completed
- scope_type: 'all', 'scenario', or 'category'
- scope_ref_id: Scenario ID (if scope = scenario)
- scope_value: Category name (if scope = category)
```

## API Endpoints

### User Endpoints
- `GET /api/challenges` - List active challenges (is_active = 1)
- `POST /api/challenges/:id/join` - Join a challenge
- `GET /api/my/challenges` - Get user's enrolled challenges
- `POST /api/challenges/:id/progress` - Update progress & check completion
- `GET /api/my/xp` - Get user's XP summary

### Admin Endpoints
- `GET /admin/challenges` - List all challenges (including inactive)
- `POST /admin/challenges` - Create new challenge
- `PUT /admin/challenges/:id` - Update challenge (including is_active toggle)
- `DELETE /admin/challenges/:id` - Delete challenge (optional, not implemented)

## Best Practices

### For Admins
1. **Set realistic targets**: 5-15% reduction for beginners, 20-30% for advanced
2. **Varied durations**: Mix short (7 days), medium (14-21 days), and long (30+ days) challenges
3. **Category-specific**: Create challenges focused on transport, diet, or energy for variety
4. **Hide seasonal challenges**: Use is_active toggle for challenges only relevant at certain times
5. **Monitor completions**: Check completion counts to gauge difficulty

### For Users
1. **Establish baseline first**: Log activities for a few days before joining
2. **Choose appropriate scope**: Pick category challenges if focusing on one area
3. **Check progress regularly**: Dashboard shows current progress
4. **Complete duration**: Even partial reduction earns recognition

## Troubleshooting

### Challenge not showing for users?
- Check `is_active = 1` in admin panel
- Toggle status button to make visible

### Progress not updating?
- System auto-updates when viewing "My Challenges"
- Progress calculates from logged activities during challenge period
- Baseline captured at join time from BEFORE challenge started

### User completed but no XP?
- XP (100) only awarded if target reduction % reached
- Time-expired challenges mark complete but give no bonus XP
- Check progress % vs target_reduction %

## Technical Notes

### Baseline Calculation
When user joins, system looks at emissions from the **previous duration_days period**:
- Join on Day 0 with 30-day challenge
- Baseline = sum of activities from Day -30 to Day 0
- Current = sum of activities from Day 0 to Day 30 (or now)

### Progress Updates
Progress auto-calculates:
- On page load (getMyChallenges)
- When manually triggered (updateProgress endpoint)
- Compares current period vs baseline period

### Completion Logic
```javascript
if (progress >= target_reduction) {
  // Success! Award 100 XP
  completed = true;
} else if (now >= end_date) {
  // Time's up, mark complete but no XP
  completed = true;
}
```

---

**Pro Tip**: Start with simple challenges like "Log 3 activities this week" before jumping to ambitious reduction targets!
