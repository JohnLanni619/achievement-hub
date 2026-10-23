# Achievement Hub

Track your achievements from multiple gaming services in one place. Sign in with Google, connect your accounts, and browse your progress: a dashboard of every connected service, drill-down into each service's games, and per-game achievement lists.

**Supported services:** [RetroAchievements](https://retroachievements.org). There is also a built-in **Demo Provider** with sample data, so you can try the app without an account. It is on in local development and off in production.

It runs on **Cloudflare's free tier**: a Worker serves the React app and the API, and **D1** (Cloudflare's SQLite database) stores the data.

## Using it on Android handhelds (AYN Thor, Retroid, Odin…)

Achievement Hub is an installable web app (PWA), so there's no APK to sideload, and updates arrive automatically on every deploy.

1. Open the site in **Chrome** on the device.
2. Tap **⋮ → Add to Home screen → Install**.
3. Launch it from the home screen. It opens full-screen like a native app.

It works by touch or with the built-in controls:

| Control              | Action                                            |
| -------------------- | ------------------------------------------------- |
| D-pad / left stick   | Move between items                                |
| A                    | Select                                            |
| B                    | Back (or close the on-screen keyboard)            |
| LB / RB              | Scroll a page up / down                           |

A button-hint bar and a focus highlight appear while the controller is in use, and disappear when you touch the screen. The same controls work in any desktop browser with a gamepad or the arrow keys.

**Why not a native APK?** Google blocks its sign-in inside embedded web views, which is how most "web app to APK" wrappers work. If you ever do want an APK, wrap the PWA as a Trusted Web Activity with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) or [PWABuilder](https://www.pwabuilder.com/). Both run the app in Chrome, so sign-in keeps working.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Open http://localhost:5173. On the sign-in page, use **Dev sign-in** with any email; Google isn't needed locally. Dev sign-in only works when `DEV_LOGIN=true` and the request comes from `localhost`, so it can't be used on the deployed site.

`npm run dev` applies database migrations to a local D1 database, starts the Worker with `wrangler dev` on :8787, and starts Vite on :5173, which proxies `/api` to the Worker.

| Command                     | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `npm run dev`               | Local Worker + Vite dev server                           |
| `npm test`                  | API, RetroAchievements, and controller-navigation tests  |
| `npm run typecheck`         | Type-checks the server and the web app                   |
| `npm run build`             | Builds the web app into `web/dist`                       |
| `npm run deploy`            | Build, apply remote migrations, deploy to Cloudflare     |
| `npm run db:migrate:remote` | Apply new files in `migrations/` to the production database |

## Deploying to Cloudflare (free)

### 1. Create the database

```bash
npx wrangler login
npx wrangler d1 create achievement-hub
```

Copy the `database_id` it prints into `wrangler.jsonc`, replacing the zeros, then commit that change. Then create the tables:

```bash
npm run db:migrate:remote
```

### 2. First deploy

```bash
npm run deploy
```

Wrangler prints your URL, for example `https://achievement-hub.<your-subdomain>.workers.dev`.

### 3. Set up Google sign-in

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (or pick an existing one).
2. Open **Google Auth Platform**, or **APIs & Services → OAuth consent screen** in the older UI. Configure it as **External**, with your app name and support email. The app only asks for the `openid`, `email` and `profile` scopes, which don't need Google's verification review.
3. Under **Audience**, either add yourself and your friends as test users, or click **Publish app** so any Google account can sign in.
4. Open **Clients → Create client**, choose **Web application**, and add this authorized redirect URI:
   `https://achievement-hub.<your-subdomain>.workers.dev/api/auth/google/callback`
   To test real Google sign-in locally too, also add `http://localhost:5173/api/auth/google/callback`.
5. Copy the client ID and client secret.

### 4. Add secrets

```bash
npx wrangler secret put APP_SECRET            # paste a long random string, e.g. from: openssl rand -hex 32
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

`APP_SECRET` encrypts the stored service API keys. Don't change it after people have connected services, or their stored keys can no longer be decrypted and they'll need to reconnect.

### 5. Optional: deploy automatically on every push

In the Cloudflare dashboard, open **Workers & Pages → achievement-hub → Settings → Build** and connect your GitHub repo. This works with private repos. Use:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Production branch:** whichever branch you deploy from, for example `main`

When you add a new file to `migrations/`, run `npm run db:migrate:remote` from your machine before or alongside that deploy.

### Free tier limits

Workers allows 100,000 requests per day and 10 ms of CPU time per request. D1 allows 5 GB of storage and 5 million row reads per day. A personal or small-group tracker stays well within these. The CPU limit is why sign-in uses Google: hashing passwords securely takes far longer than 10 ms.

## Architecture

```
wrangler.jsonc       Worker config: static assets + D1 binding
migrations/          D1 schema (SQL)
server/              Hono API running on Cloudflare Workers
  src/routes/auth.ts              Google OAuth (with PKCE), dev sign-in, sessions
  src/routes/connections.ts       Provider catalog, connect/disconnect, data endpoints
  src/providers/types.ts          Provider interface + normalized data model
  src/providers/retroachievements RetroAchievements API client + mapping
  src/providers/demo.ts           Sample-data provider
web/                 React 19 + React Router + Vite
  src/pages/Dashboard.tsx         Connected services + "add a service"
  src/pages/Connect.tsx           Credential form, generated from provider metadata
  src/pages/ProviderPage.tsx      Profile, stats, recent unlocks, filterable game list
  src/pages/GamePage.tsx          Achievement list with earned/locked filter and sorting
```

Requests to `/api/*` run the Worker. Everything else is served from `web/dist`, and unknown paths fall back to `index.html` so client-side routes work on refresh.

### Adding a new provider

Each service implements the `Provider` interface in `server/src/providers/types.ts`:

- metadata: `id`, `name`, `description`, `connectInstructions`, and `credentialFields`. The connect form is generated from `credentialFields`.
- `verify(credentials)`: checks the credentials against the service when the user connects.
- `getProfile`, `listGames`, `getGame`, `getRecentAchievements`: return the normalized shapes.

Register it in `defaultRegistry` in `server/src/app.ts`. The API routes and the UI need no changes. Services that use OAuth (Steam OpenID, Xbox, PSN) will also need a redirect/callback route.

### API

Everything is under `/api`. All routes except `/api/auth/*` and `/api/health` require a session.

| Method | Path                                     | Description                                    |
| ------ | ---------------------------------------- | ---------------------------------------------- |
| GET    | `/auth/google`                           | Start Google sign-in (`?returnTo=/path`)       |
| GET    | `/auth/google/callback`                  | Google OAuth callback                          |
| GET    | `/auth/me`, `/auth/config`               | Current user; which sign-in methods are enabled |
| POST   | `/auth/logout`                           | End the session                                |
| GET    | `/providers`                             | Supported providers and your connection status |
| PUT    | `/connections/:providerId`               | Connect or update credentials (verified first) |
| DELETE | `/connections/:providerId`               | Disconnect and delete stored credentials       |
| GET    | `/connections/:providerId/profile`       | Profile and stats                              |
| GET    | `/connections/:providerId/games`         | Games with progress                            |
| GET    | `/connections/:providerId/games/:gameId` | Game detail with all achievements              |
| GET    | `/connections/:providerId/recent`        | Achievements earned in the last 30 days        |
| POST   | `/connections/:providerId/refresh`       | Clear cached data for this connection          |

### Security notes

- **No passwords are stored.** Google sign-in uses the authorization-code flow with PKCE and a `state` check, and only accepts accounts with a verified email.
- **Sessions:** random tokens in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie. The database stores only a SHA-256 of each token.
- **Service credentials** (for example, the RetroAchievements API key) are encrypted at rest with AES-256-GCM, using a key derived from `APP_SECRET`. They are never sent back to the browser.
- **CSRF:** every mutating request must carry an `X-Requested-With: achievement-hub` header.
- **Caching:** service responses are cached in memory for about 2 minutes to stay within rate limits. Use **Refresh** on a service page to bypass the cache.
