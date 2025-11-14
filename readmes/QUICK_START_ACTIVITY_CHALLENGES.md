# Quick Start: Activity-Based Challenge Creation

## 🚀 3-Minute Guide for Admins

### Step 1: Open Challenge Creation
```
Admin Panel → Challenges Tab → "Create Challenge" button
```

You'll see a new button at the top of the form:
```
🪄 Generate from Activity
```

---

### Step 2: Search for Activities

**Example Searches:**

| Search Term | Best For | Sample Results |
|-------------|----------|----------------|
| `car` | Transport challenges | Gasoline cars, electric vehicles, carpools |
| `beef` | Diet challenges | Beef production, red meat consumption |
| `electricity` | Energy challenges | Grid electricity, renewable energy |
| `flight` | Travel challenges | Short-haul, long-haul flights |
| `bus` | Public transport | City bus, coach bus |

**Pro Tips:**
- ✅ Use simple terms: "car" not "automobile"
- ✅ Search category-specific items: "beef" not "food"
- ✅ Filter by category for focused results
- ❌ Avoid overly specific terms

---

### Step 3: Pick an Activity

Each result shows:

```
┌─────────────────────────────────────────────────┐
│ 🚗 Passenger Car, Gasoline (Medium Size)       │
│                                                 │
│ Gasoline-powered medium-size passenger vehicle │
│                                                 │
│ 🏷️ Transport  🌎 US  📊 climatiq             │
│                                                 │
│                                    0.404        │
│                                    kg CO2e/mile │
└─────────────────────────────────────────────────┘
```

**Click any card** to generate challenges!

---

### Step 4: Review Auto-Generated Challenges

You'll see **4 challenge templates**:

#### 1️⃣ Daily Limit Challenge
```
Name: Daily Car Usage Limit
Target: 4.04 kg CO2e per day
Duration: 7 days
Type: daily_limit

✅ Best for: Building daily habits
```

#### 2️⃣ Weekly Total Challenge
```
Name: Weekly Car Challenge
Target: 20.2 kg CO2e total
Duration: 7 days
Type: total_limit

✅ Best for: Short-term sprints
```

#### 3️⃣ Monthly Total Challenge
```
Name: Month of Car Awareness
Target: 80.8 kg CO2e total
Duration: 30 days
Type: total_limit

✅ Best for: Lifestyle changes
```

#### 4️⃣ Activity Tracker
```
Name: Track Car Usage
Target: 15 logged activities
Duration: 14 days
Type: activity_count

✅ Best for: New users, awareness
```

---

### Step 5: Use & Customize

Click **"Use This Challenge"** on your favorite template.

The form auto-fills with:
- ✅ Name
- ✅ Description
- ✅ Challenge type
- ✅ Target value
- ✅ Target unit
- ✅ Duration
- ✅ Badge name

**Customize anything you want**, then click **Save**!

---

## 🎯 Real-World Examples

### Example 1: "No Drive December"

**Admin Action:**
1. Search: `car`
2. Select: "Passenger car, gasoline" (0.404 kg/mile)
3. Choose: Monthly Total template
4. Customize:
   - Name: "No Drive December"
   - Description: "Use alternative transport to stay under 50 kg CO2e"
   - Target: **50 kg CO2e** (originally 80.8, adjusted down)
   - Duration: **30 days**

**Result:** Challenge allows ~124 miles of driving for the month (vs typical 400+ miles)

---

### Example 2: "Meatless Mondays"

**Admin Action:**
1. Search: `beef`
2. Select: "Beef (red meat)" (27.0 kg/kg)
3. Choose: Activity Tracker template
4. Customize:
   - Name: "Meatless Mondays"
   - Description: "Log 4 weeks of Monday meals without beef"
   - Target: **4 activities**
   - Duration: **30 days**

**Result:** Simple tracking challenge to build awareness

---

### Example 3: "Commuter Hero"

**Admin Action:**
1. Search: `bus`
2. Select: "City bus" (0.089 kg/mile)
3. Choose: Daily Limit template
4. Customize:
   - Name: "Commuter Hero"
   - Description: "Take the bus instead of driving - stay under 1 kg/day"
   - Target: **1.0 kg CO2e**
   - Duration: **7 days**
   - Badge: "Bus Champion"

**Result:** Encourages ~11 miles of bus commuting per day

---

## 🔧 Setup (One-Time)

### Option A: With Climatiq API (Recommended)

1. Sign up at [climatiq.io](https://www.climatiq.io/)
2. Get your API key
3. Add to `backend/.env`:
   ```env
   CLIMATIQ_API_KEY=your_key_here
   ```
4. Restart backend server

**You now have access to 1000+ activities!**

### Option B: Local Database (Basic)

Already works! Uses activities in your `emission_factors` table.

**To add more activities:**
```sql
INSERT INTO emission_factors 
(category, activity_type, region, co2e_per_unit, unit, source) 
VALUES 
('transport', 'electric_car', 'US', 0.122, 'kg_per_mile', 'local');
```

---

## 📊 Target Calculation Logic

### How Targets Are Calculated

| Challenge Type | Formula | Example (Car @ 0.404 kg/mile) |
|----------------|---------|-------------------------------|
| **Daily Limit** | `factor × 10` | 0.404 × 10 = **4.04 kg/day** |
| **Weekly Total** | `factor × 50` | 0.404 × 50 = **20.2 kg/week** |
| **Monthly Total** | `factor × 200` | 0.404 × 200 = **80.8 kg/month** |
| **Activity Count** | Fixed at `15` | **15 activities** |

### Understanding the Multipliers

**Daily (×10 units):**
- Car: 10 miles/day = typical commute
- Beef: 10 kg/day = unrealistic (adjust down!)
- Electricity: 10 kWh/day = typical home

**Weekly (×50 units):**
- Car: 50 miles/week = weekend + errands
- Beef: 50 kg/week = very high (adjust!)
- Electricity: 50 kWh/week = 1-person household

**Monthly (×200 units):**
- Car: 200 miles/month = reduced driving
- Electricity: 200 kWh/month = efficient household

**💡 Pro Tip:** These are starting points! Always review and adjust based on:
- Your user base (students vs professionals)
- Regional norms (US vs EU emissions)
- Challenge difficulty goal (beginner vs expert)

---

## ❓ FAQ

### Can I edit the auto-generated challenges?
**Yes!** They're templates. Adjust any field before saving.

### What if search returns no results?
Try simpler terms or use the local database fallback.

### Can I use this without Climatiq API?
**Yes!** Works with local `emission_factors` table, just fewer activities.

### How accurate are the targets?
Based on scientific emission factors, but **always review** before publishing. Adjust for your audience.

### Can I generate multiple challenges from one activity?
**Yes!** Select the same activity multiple times and choose different templates.

---

## 🎓 Challenge Design Philosophy

### 🌱 Awareness Phase (Weeks 1-2)
**Use:** Activity Count challenges
**Goal:** Get users tracking without pressure
**Example:** "Track 10 car trips"

### 📉 Habit Building (Weeks 3-4)
**Use:** Daily Limit challenges
**Goal:** Develop consistent low-carbon habits
**Example:** "Keep car emissions under 3 kg/day"

### 🏆 Mastery Phase (Month 2+)
**Use:** Total Limit challenges
**Goal:** Long-term lifestyle change
**Example:** "Stay under 50 kg CO2e from driving this month"

---

## 🚦 Need Help?

**Feature not working?**
- Check browser console for errors
- Verify backend server is running
- Test API endpoints in Insomnia/Postman

**Targets seem wrong?**
- Review the emission factor (some are per kg, some per mile)
- Adjust multipliers in backend if needed
- Remember: these are defaults, customize them!

**Want more activities?**
- Get Climatiq API key (free tier available)
- Or manually add to `emission_factors` table

---

Happy Challenge Creating! 🎉
