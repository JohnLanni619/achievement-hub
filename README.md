# Achievement Hub

Track your achievements from multiple gaming services in one place. Sign up, connect your accounts, and browse your progress: a dashboard of every connected service, drill-down into each service's games, and per-game achievement lists.

**Supported services:** [RetroAchievements](https://retroachievements.org). There is also a built-in **Demo Provider** with sample data, so you can try the app without an account. It is on by default outside production.

## Quick start

Requires **Node.js 22.13+**, which ships the built-in `node:sqlite` module, so there are no native database builds.

```bash
npm install
npm run dev
```

Open http://localhost:5173, create an account, and connect a service.

To connect RetroAchievements, sign in at retroachievements.org, go to **Settings → Keys**, and copy your **Web API Key**.

## Scripts

| Command             | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `npm run dev`       | API on :3001 (auto-reload) + Vite dev server on :5173 with `/api` proxy |
| `npm run build`     | Builds the web app and compiles the server                           |
| `npm start`         | Runs the compiled server, which also serves the built web app        |
| `npm test`          | Server test suite (auth, connections, RetroAchievements mapping)     |
| `npm run typecheck` | Type-checks both packages                                            |

## Configuration

Copy `.env.example` to `.env`. Every variable is optional in development.

| Variable               | Default                       | Notes                                                                 |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `PORT`                 | `3001`                        | API server port                                                       |
| `APP_SECRET`           | auto-generated in dev         | Encrypts stored provider credentials. **Required in production.**     |
| `DATABASE_PATH`        | `./data/achievement-hub.db`   | SQLite file                                                           |
| `ENABLE_DEMO_PROVIDER` | `true` outside production     | Shows the Demo Provider                                               |

## Architecture

```
server/   Express 5 + TypeScript API, SQLite (node:sqlite)
  src/providers/types.ts          Provider interface + normalized data model
  src/providers/retroachievements RetroAchievements API client + mapping
  src/providers/demo.ts           Sample-data provider
  src/routes/auth.ts              Register / login / logout / session
  src/routes/connections.ts       Provider catalog, connect/disconnect, data endpoints
web/      React 19 + React Router + Vite
  src/pages/Dashboard.tsx         Connected services + "add a service"
  src/pages/Connect.tsx           Credential form (generated from provider metadata)
  src/pages/ProviderPage.tsx      Profile, stats, recent unlocks, filterable game list
  src/pages/GamePage.tsx          Achievement list with earned/locked filter and sorting
```

### Adding a new provider

Each service implements the `Provider` interface in `server/src/providers/types.ts`:

- metadata: `id`, `name`, `description`, `connectInstructions`, and `credentialFields`. The connect form is generated from `credentialFields`.
- `verify(credentials)`: checks the credentials against the service when the user connects.
- `getProfile`, `listGames`, `getGame`, `getRecentAchievements`: return the normalized `Profile`, `GameSummary`, `GameDetail`, and `RecentAchievement` shapes.

Register it in `createContext` in `server/src/app.ts`. The API routes and the UI need no changes. Providers that use OAuth (Steam OpenID, Xbox, PSN) will need a redirect/callback route in addition to this interface.

### API

All routes are under `/api` and require a session, except `/api/auth/*` and `/api/health`.

| Method | Path                                             | Description                                 |
| ------ | ------------------------------------------------ | ------------------------------------------- |
| POST   | `/auth/register`, `/auth/login`, `/auth/logout`  | Account and session management              |
| GET    | `/auth/me`                                       | Current user, or `null`                     |
| GET    | `/providers`                                     | Supported providers and your connection status |
| PUT    | `/connections/:providerId`                       | Connect or update credentials (verified first) |
| DELETE | `/connections/:providerId`                       | Disconnect and delete stored credentials    |
| GET    | `/connections/:providerId/profile`               | Profile and stats                           |
| GET    | `/connections/:providerId/games`                 | Games with progress                         |
| GET    | `/connections/:providerId/games/:gameId`         | Game detail with all achievements           |
| GET    | `/connections/:providerId/recent`                | Achievements earned in the last 30 days     |
| POST   | `/connections/:providerId/refresh`               | Clear cached data for this connection       |

### Security notes

- Passwords are hashed with scrypt. Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie, and only a SHA-256 of each token is stored in the database.
- Provider credentials (for example, the RA API key) are encrypted at rest with AES-256-GCM, using a key derived from `APP_SECRET`. They are never sent back to the browser.
- Every mutating request must carry an `X-Requested-With: achievement-hub` header, which blocks cross-site form posts (CSRF).
- Repeated failed logins are throttled per IP and email.
- Provider responses are cached in memory for 2 minutes to stay within rate limits. Use **Refresh** on a service page to bypass the cache.
