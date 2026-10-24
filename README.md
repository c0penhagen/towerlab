# TowerLab

TowerLab is a React + Vite community tower. Each row in Supabase `public.tower_floors` becomes a numbered floor displaying its Instagram handle.

## Run locally

1. Install Node.js (LTS) if needed.
2. Open this folder in VS Code.
3. In the VS Code terminal run:
   ```bash
   npm install
   npm run dev
   ```
4. Open the local URL Vite prints (usually `http://localhost:5173`).

The included `.env.local` points the browser to the TowerLab Supabase project using its public publishable key. This is a browser-safe key; never put a Supabase service-role/secret key or the TowerLab sync secret in frontend files.

## How follower floors appear

- The website reads `public.tower_floors` and refreshes every 20 seconds; Supabase Realtime is also subscribed to when available.
- The trusted Supabase Edge Function `apify-follower-sync` imports follower usernames from the latest successful run of the configured Apify actor. It skips duplicates and the founder handle `deadbureau`.
- Apify's schedule must run the Instagram Followers and Following Scraper with `tower.labs` and `Followers` selected. The database sync schedule runs independently and checks the latest successful Apify run.
- Instagram/Apify limitations may restrict how many follower records are returned.

## Before publishing

- `.env.local` is intentionally ignored by Git. Configure the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build environment variables in the hosting provider (for example Cloudflare Pages/Workers) before building/deploying.
- Never expose `TOWERLAB_SYNC_SECRET`, `APIFY_API_TOKEN`, or a Supabase service-role/secret key in frontend code or public repository files.
- The frontend only reads floor rows. Follower insertion is performed by the trusted backend, not by the browser.
