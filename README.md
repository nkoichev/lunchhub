# 🍲 LunchHub

A professional Android lunch-ordering app for your team, built with **Expo / React Native** and a free **Supabase (PostgreSQL)** backend.

This is a redesigned successor to the original Google-Sheets lunch app. It keeps the same restaurant menu (Малката Верея) but adds a real cloud database, name-based login, order history, food ratings, and a polished, interactive UI.

---

## ✨ Features

| Feature | Description |
|---|---|
| 👤 **Login with name** | No passwords — enter your name and you're in. Session is remembered on the device. |
| 🏪 **Multiple restaurants** | A button per restaurant at the top of the menu. Each restaurant has its own weekly menu; switching restaurants starts a fresh order. |
| 🍽️ **Interactive menu** | Browse each weekday's dishes grouped by category (soups, salads, mains, desserts). Tap **+/−** to build an order with quantities and a live running total. |
| ✏️ **Edit / delete orders** | Correct a placed order (change quantities, remove items) or delete it entirely — from both "Today" and "History". |
| 🛒 **Cart & checkout** | Review and adjust your order, then place it with one tap. |
| 👥 **Today's orders** | See who on the team ordered what today, with per-person and grand totals. |
| 📜 **Order history** | Every past order is saved and viewable, with totals and spend summary. |
| ⭐ **Food ratings** | Rate dishes you've ordered 1–5 stars. Averages show next to menu items, plus a team "Top dishes" leaderboard. |
| 📝 **Manage tab (dishes & restaurants)** | The "Ястия" tab is the dish catalog (the old *Mandji* sheet). Add, edit and delete dishes, and add new restaurants — all from inside the app, no SQL needed. New restaurants appear as ordering buttons automatically. |
| 🔄 **Pull to refresh** | Live data everywhere, backed by Supabase realtime. |

---

## 🗄️ Why Supabase (the "better database")

The original app read from Google Sheets via an Apps Script — fragile, hard to query, and no real relationships. LunchHub uses **Supabase**, which gives you on the **free tier**:

- A real **PostgreSQL** database with proper tables, relations, and views
- Auto-generated REST + JS client (no server code to maintain)
- **Realtime** updates
- 500 MB database + 50k monthly active users free — far more than a lunch team needs

---

## 🚀 Setup (about 10 minutes)

### 1. Create the database
1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Open **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql).
3. Then run [`supabase/seed.sql`](supabase/seed.sql) to load the Малка Верея menu.
4. **If you already ran an older `schema.sql`** (before multi-restaurant support), also run [`supabase/migration_multi_restaurant.sql`](supabase/migration_multi_restaurant.sql) once.
5. **If you already ran an older `schema.sql`** (before ratings were scoped per restaurant), also run [`supabase/migration_ratings_per_restaurant.sql`](supabase/migration_ratings_per_restaurant.sql) once.
6. **If you already ran an older `schema.sql`** (before the database was set to Bulgaria's timezone), also run [`supabase/migration_timezone.sql`](supabase/migration_timezone.sql) once.
7. **If you already ran an older `schema.sql`** (before the views were set to `security_invoker`), also run [`supabase/migration_security_invoker_views.sql`](supabase/migration_security_invoker_views.sql) once.

**Adding more restaurants:** copy [`supabase/add_restaurant_template.sql`](supabase/add_restaurant_template.sql), fill in the restaurant name and its dishes, and run it. The new restaurant's button appears in the app automatically (pull to refresh). No rebuild needed.

### 2. Connect the app
1. In Supabase go to **Project Settings → API** and copy your **Project URL** and **anon public key**.
2. Open [`app.json`](app.json) and replace the placeholders under `expo.extra`:
   ```json
   "extra": {
     "supabaseUrl": "https://xxxxx.supabase.co",
     "supabaseAnonKey": "eyJhbGci..."
   }
   ```

### 3. Install & run
```bash
npm install
npm start            # opens Expo — scan the QR with Expo Go on your phone
```

> Without step 1–2 the app still boots in **demo mode**: you can browse the menu, but orders won't save.

---

## 🌐 Run in a web browser

The same app can run in a browser (people enter orders from a desktop, no install needed).

1. Add the web dependencies (correct versions for your Expo SDK):
   ```bash
   npx expo install react-dom react-native-web @expo/metro-runtime
   ```
2. Test locally:
   ```bash
   npx expo start
   ```
   then press **w** to open it in the browser.
3. Publish a shareable URL (free EAS Hosting):
   ```bash
   npx expo export --platform web
   npx eas deploy
   ```
   EAS gives you a public link anyone can open.

Notes: the layout is phone-shaped, so on a wide screen it appears as a centered narrow column (functional, not a bespoke desktop design). Confirmation dialogs use the browser's native confirm on web.

---

## 📱 Build the Android APK

Uses [EAS Build](https://docs.expo.dev/build/introduction/) (free tier available):

```bash
npm install -g eas-cli
eas login
eas build:configure
npm run build:android          # produces an installable .apk
```

When the build finishes, EAS gives you a download link for the APK to install on any Android phone. For the Play Store, use `npm run build:android:prod` (produces an `.aab`).

See [SETUP.md](SETUP.md) for a detailed step-by-step walkthrough.

---

## 🧱 Project structure

```
lunchhub/
├── App.js                     # Root: providers + navigation + auth gate
├── app.json                   # Expo config (Supabase keys go here)
├── supabase/
│   ├── schema.sql             # Tables, views, RLS, realtime
│   └── seed.sql               # Menu data (auto-generated)
└── src/
    ├── config/supabase.js     # Supabase client
    ├── theme/theme.js         # Design system (colors, spacing, type)
    ├── context/               # Auth + Cart state
    ├── services/              # DB access: auth, menu, orders, ratings
    ├── components/            # Reusable UI (Button, Card, StarRating…)
    ├── data/                  # Local menu fallback + day helpers
    └── screens/               # Login, Menu, Cart, Today, History, Ratings
```

---

## 🔧 Tech stack

- **Expo SDK 54** / React Native 0.81
- **React Navigation** (bottom tabs + native stack)
- **Supabase JS** for data
- **AsyncStorage** for the remembered session

---

## Notes on security

This is a small trusted-team app, so it uses Supabase's `anon` key with permissive row-level-security policies (anyone with the app can read/write). If you later need stricter access, replace the name-login with Supabase Auth (email magic links) and tighten the RLS policies in `schema.sql`.
