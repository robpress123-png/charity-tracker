/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Custom colors matching the demo's gradient design
      colors: {
        'charity': {
          'primary': '#1e40af',
          'secondary': '#3b82f6',
          'accent': '#60a5fa',
          'light': '#dbeafe',
          'dark': '#1e3a8a'
        }
      },
      // Custom gradients for glass morphism effects
      backgroundImage: {
        'gradient-charity': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-glass': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)'
      },
      // Enhanced shadows for card effects
      boxShadow: {
        'charity': '0 10px 25px -5px rgba(59, 130, 246, 0.1), 0 10px 10px -5px rgba(59, 130, 246, 0.04)',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.37)'
      },
      // Custom backdrop blur
      backdropBlur: {
        'charity': '16px'
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms')
  ],
}