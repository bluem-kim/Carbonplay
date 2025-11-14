Tailwind & DaisyUI setup

Install dev dependencies and build the CSS for the frontend.

PowerShell (Windows) commands:

```
cd frontend;
npm install
npm run build:css
```

This will produce `frontend/dist/styles.css`. During development you can run:

```
npm run watch:css
```

Notes:
- The project's original CSS has been merged into `src/styles.css` so you won't lose existing styles.
- If you prefer to avoid installing packages, you can alternatively use the DaisyUI CDN and Tailwind CDN builds, but they won't include the project's custom CSS concatenation.
