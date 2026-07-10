/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        poppins: ['var(--font-poppins)', 'Poppins', 'sans-serif'],
        inter: ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
      colors: {
        ember: '#FF4500',
        amber: '#FF8C00',
        gold: '#FFD700',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-18px)' },
        },
        floatReverse: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(18px)' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(255,69,0,0.4)' },
          '50%':      { boxShadow: '0 0 50px rgba(255,69,0,0.8), 0 0 80px rgba(255,140,0,0.4)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        countUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%':   { opacity: '0', transform: 'translateX(60px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        rotate360: {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'float':         'float 4s ease-in-out infinite',
        'float-reverse': 'floatReverse 4s ease-in-out infinite',
        'float-delay':   'float 4s ease-in-out 1.3s infinite',
        'fade-up':       'fadeUp 0.7s ease-out forwards',
        'gradient':      'gradientShift 6s ease infinite',
        'pulse-glow':    'pulseGlow 2.5s ease-in-out infinite',
        'shimmer':       'shimmer 2.4s linear infinite',
        'count-up':      'countUp 0.6s ease-out forwards',
        'slide-right':   'slideInRight 0.6s ease-out forwards',
        'spin-slow':     'rotate360 10s linear infinite',
      },
      backgroundImage: {
        'flame-gradient': 'linear-gradient(135deg, #FF4500 0%, #FF8C00 50%, #FFD700 100%)',
        'flame-gradient-r': 'linear-gradient(135deg, #FFD700 0%, #FF8C00 50%, #FF4500 100%)',
        'dark-hero': 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,69,0,0.12) 0%, rgba(0,0,0,0) 100%)',
        'card-glass': 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
      },
    },
  },
  plugins: [],
}
