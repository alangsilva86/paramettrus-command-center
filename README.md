<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/12JUtYHecn6VoxDfcTLEKOkIYIaPbZx8S

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Backend (Middleware)

The middleware lives in `server/` and is deployed separately (Railway).

1. Install backend dependencies:
   `cd server && npm install`
2. Create a Postgres database and set `DATABASE_URL` (see `server/.env.example`).
3. Run migrations and seed the default curve:
   `npm run migrate && npm run seed:curve`
4. Start the API:
   `npm run dev`

The frontend will proxy `/api` to `http://localhost:4000` by default.

To enable contract links in the UI, set `VITE_ZOHO_CONTRACT_URL` (e.g. a base URL ending with `/` that accepts the `contract_id`).
