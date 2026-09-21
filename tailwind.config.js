/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: '#dff0ee',
          hover: '#c8e6e2',
          active: '#b0d8d3'
        },
        accent: {
          DEFAULT: '#2d9e93',
          dark: '#1a7a70',
          light: '#e8f7f5'
        },
        body: '#f4faf9',
        card: {
          bg: '#ffffff',
          border: '#e0edeb'
        },
        text: {
          primary: '#1a3330',
          secondary: '#5a8882',
          muted: '#93b8b4'
        }
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
