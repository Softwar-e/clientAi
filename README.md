<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ColdMail AI

Generate hyper-personalized, conversion-optimized B2B cold emails from social profiles using Google Gemini AI.

View your app in AI Studio: https://ai.studio/apps/ab341769-2fd8-481f-a79c-d880d1fb9fea

## Run Locally

**Prerequisites:** [Node.js](https://nodejs.org/) (v18 or later)

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
   The app will be available at [http://localhost:3000](http://localhost:3000).
