# CarbonPlay Admin UI

This is a minimal, Tailwind + DaisyUI admin console for managing core entities:
- Users
- User Profiles
- Challenges
- Emission Factors
- Scenarios

Open `frontend/admin/index.html` in a browser (ensure `frontend/dist/styles.css` exists from Tailwind build).

Hook APIs in `frontend/js/admin.js` by replacing sample data inside each loader (users, profiles, challenges, factors, scenarios) with real fetch calls to your backend. Use stored auth token if your API requires it.

Example pattern:
- Read token: `const token = localStorage.getItem('token');`
- Fetch: `fetch('http://localhost:3000/api/admin/users', { headers: { Authorization: 'Bearer ' + token }})`
- Render with `renderRows(...)` using templated `<tr>` strings.

Keep it simple and extend as needed.