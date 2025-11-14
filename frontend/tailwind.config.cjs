const defaultTheme = require('tailwindcss/defaultTheme')

module.exports = {
  // Only scan project HTML and source JS files. Avoid scanning node_modules for performance.
  content: [
    // top-level HTML files (repo root)
    '../*.html',
    // any HTML under the frontend folder (partials, templates)
    './**/*.html',
    // source JS files under frontend/js and frontend/src
    './js/**/*.{js,ts}',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', ...defaultTheme.fontFamily.sans]
      }
    }
  },
  plugins: [
    require('daisyui')
  ],
  daisyui: {
    themes: [
      'forest', // builtin daisyui forest theme
      {
        carbonplay: {
          'primary': '#2ecc71',
          'secondary': '#27ae60',
          'accent': '#3498db',
          'neutral': '#2c3e50',
          'base-100': '#ffffff'
        }
      }
    ]
  }
}
