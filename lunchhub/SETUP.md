# LunchHub — Detailed Setup Guide

This walks you from zero to a working app on your phone.

---

## Part 1 — Supabase database (free)

1. **Create account & project**
   - Sign up at https://supabase.com (free).
   - Click **New project**. Pick a name (e.g. `lunchhub`), a database password, and a region close to you (e.g. Frankfurt for Bulgaria).
   - Wait ~2 minutes for it to provision.

2. **Create the tables**
   - In the left sidebar, open **SQL Editor** → **New query**.
   - Open `supabase/schema.sql` from this project, copy everything, paste it, and press **Run**.
   - You should see "Success. No rows returned."

3. **Load the menu**
   - New query again.
   - Open `supabase/seed.sql`, copy/paste it, and **Run**.
   - Check **Table Editor → menu_items**: you should see ~140 dishes.

4. **Grab your keys**
   - Go to **Project Settings** (gear icon) → **API**.
   - Copy the **Project URL** (looks like `https://abcd1234.supabase.co`).
   - Copy the **anon public** key (a long `eyJhbGci...` string).

---

## Part 2 — Configure the app

1. Open `app.json`.
2. Find the `"extra"` block and paste your values:
   ```json
   "extra": {
     "supabaseUrl": "https://abcd1234.supabase.co",
     "supabaseAnonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
   }
   ```
3. Save.

---

## Part 3 — Run it on your phone (development)

1. Install Node.js 18+ if you don't have it: https://nodejs.org
2. In a terminal, from the project folder:
   ```bash
   npm install
   npm start
   ```
3. Install **Expo Go** on your Android phone (Play Store).
4. Scan the QR code shown in the terminal with Expo Go.
5. The app opens. Enter your name to log in.

---

## Part 4 — Build a standalone APK

When you want a real installable app (no Expo Go needed):

1. Install the build tool:
   ```bash
   npm install -g eas-cli
   ```
2. Create a free Expo account and log in:
   ```bash
   eas login
   ```
3. Configure (first time only):
   ```bash
   eas build:configure
   ```
   This fills in your `projectId` in `app.json`.
4. Build the APK:
   ```bash
   npm run build:android
   ```
5. EAS runs the build in the cloud (~10–15 min) and gives you a download link. Open it on your Android phone and install.

For Google Play, run `npm run build:android:prod` to get an `.aab` bundle instead.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| App says "Демо режим" | Supabase keys not set in `app.json` → redo Part 2. |
| "Няма меню за този ден" on a weekday | Make sure `seed.sql` ran successfully (Part 1, step 3). |
| Orders don't appear in "Днес" | Confirm you ran `schema.sql` fully — it creates the `today_orders` view. |
| Login error about "users" | The `users` table wasn't created — rerun `schema.sql`. |
| Metro bundler cache issues | `npm start -- --clear` |

---

## Updating the menu later

The menu lives in the `menu_items` table. You can edit dishes/prices directly in Supabase's **Table Editor**, or re-run a modified `seed.sql`. No app rebuild needed — just pull to refresh.
