<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ColdMail AI

Generate hyper-personalized, conversion-optimized B2B cold emails from social profiles using Google Gemini AI.

View your app in AI Studio: https://ai.studio/apps/ab341769-2fd8-481f-a79c-d880d1fb9fea

## Run Locally

### Prerequisites: Install Node.js

`npm` ships with Node.js. If running `node -v` or `npm -v` in your terminal shows "command not found", install Node.js first:

- **macOS (recommended):** Install via [Homebrew](https://brew.sh/):
  ```bash
  brew install node
  ```
  Or download the macOS installer from [nodejs.org](https://nodejs.org/).

- **Windows:** Download the installer from [nodejs.org](https://nodejs.org/).

- **Linux:** Use your distro's package manager, e.g.:
  ```bash
  sudo apt install nodejs npm   # Debian/Ubuntu
  ```

Verify the install succeeded before continuing:
```bash
node -v   # should print v18 or higher
npm -v
```

---

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Then open `.env.local` and replace `MY_GEMINI_API_KEY` with your actual Gemini API key.

   > **Get a free API key** at [Google AI Studio](https://aistudio.google.com/app/apikey).

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.
