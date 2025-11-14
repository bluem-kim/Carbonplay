# Testing Activity-Based Challenge Generator

## Steps to Test

1. **Open Admin Panel**
   - Navigate to `http://localhost:3000/frontend/admin/index.html`
   - Login if needed

2. **Open Challenge Modal**
   - Click "Challenges" tab
   - Click "New Challenge" button

3. **Look for the Button**
   You should see a button at the top of the form:
   ```
   🪄 Generate from Activity (Search Climatiq)
   ```

4. **If Button Doesn't Appear**
   - Open browser console (F12)
   - Look for messages:
     - "Activity generator button added successfully" ✅ Good!
     - "Modal not found: modal-challenges" ❌ Issue
     - "Form not found: form-challenges" ❌ Issue

5. **Test the Feature**
   - Click "Generate from Activity" button
   - Search modal should appear
   - Enter "car" and click Search
   - Should see activity results (or fallback to local DB)
   - Click an activity
   - Should see 4 challenge templates
   - Click "Use This Challenge"
   - Form should auto-fill with challenge data

## Troubleshooting

### Button Not Showing?

**Check 1: Script Loaded?**
- Open browser console
- Type: `typeof initActivityGenerator`
- Should return: `"function"`

**Check 2: Modal Exists?**
- Open browser console
- Type: `document.getElementById('modal-challenges')`
- Should return: `<dialog id="modal-challenges"...>`

**Check 3: Manual Trigger**
- Open browser console
- Type: `initActivityGenerator()`
- Should see: "Activity generator button added successfully"

### Search Not Working?

**Check 1: API Endpoint**
- Open browser Network tab (F12 → Network)
- Click search button
- Should see POST request to `/api/admin/climatiq-search`
- Check response status (should be 200)

**Check 2: Fallback Mode**
- If no CLIMATIQ_API_KEY in .env
- Should see message: "Using local database"
- Should show activities from `emission_factors` table

### Form Not Auto-Filling?

**Check console for errors:**
- "Form not found" → Script timing issue
- "Cannot read property of null" → Field name mismatch

**Manual check:**
```javascript
document.getElementById('form-challenges').querySelector('[name="name"]')
// Should return: <input name="name"...>
```

## Quick Fixes

### Fix 1: Hard Refresh
- Press `Ctrl + Shift + R` (Windows)
- Or `Cmd + Shift + R` (Mac)
- Clears cache and reloads scripts

### Fix 2: Check Script Order
Scripts should load in this order:
1. `admin.js` (main admin logic)
2. `admin-climatiq-helper.js` (target suggestions)
3. `admin-activity-generator.js` (activity search)

### Fix 3: Manual Button Addition
If automatic init fails, run in console:
```javascript
const form = document.getElementById('form-challenges');
const btn = document.createElement('button');
btn.type = 'button';
btn.className = 'btn btn-outline btn-info btn-sm mb-4 w-full';
btn.innerHTML = '<i class="fas fa-magic mr-2"></i> Generate from Activity';
btn.onclick = () => showActivitySearchModal();
form.prepend(btn);
```

## Expected Console Messages

When working correctly:
```
Activity generator button added successfully
```

When searching:
```
Searching...
```

When generating challenges:
```
Challenge template loaded! Review and save.
```

## Files to Check

1. **frontend/admin/index.html** (line ~486)
   - Should have: `<script src="../js/admin-activity-generator.js"></script>`

2. **frontend/js/admin-activity-generator.js**
   - Should exist and be readable

3. **backend/routes/adminRoutes.js**
   - Should have `/climatiq-search` endpoint
   - Should have `/generate-challenge` endpoint

## Still Not Working?

Share the browser console output and I'll help debug!
