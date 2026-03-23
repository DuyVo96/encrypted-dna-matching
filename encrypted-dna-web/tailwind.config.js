/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'dao-bg':            '#000000',
        'dao-surface':       '#080808',
        'dao-surface-2':     '#0f0f0f',
        'dao-border':        'rgba(107,53,232,0.25)',
        'dao-border-bright': 'rgba(107,53,232,0.6)',
        'dao-text':          '#ffffff',
        'dao-text-muted':    '#888888',
        'dao-primary':       '#6B35E8',
        'dao-primary-hover': '#7B45F8',
        'dao-yes':           '#10b981',
        'dao-no':            '#ef4444',
        'dao-abstain':       '#64748b',
        // DNA base colors
        'dna-A':             '#10b981', // Adenine  — green
        'dna-T':             '#3b82f6', // Thymine  — blue
        'dna-G':             '#f59e0b', // Guanine  — amber
        'dna-C':             '#ef4444', // Cytosine — red
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      letterSpacing: {
        arcium: '0.12em',
      },
      animation: {
        'fade-in':       'fadeIn 0.3s ease-out',
        'slide-up':      'slideUp 0.4s ease-out',
        'pulse-slow':    'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':     'spin 3s linear infinite',
        'helix-spin':    'helixSpin 4s linear infinite',
        'glow-pulse':    'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        helixSpin: {
          '0%':   { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(360deg)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(107,53,232,0.4)' },
          '50%':      { boxShadow: '0 0 24px rgba(107,53,232,0.8)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-purple': 'linear-gradient(135deg, #6B35E8 0%, #9B65F8 100%)',
      },
    },
  },
  plugins: [],
};
