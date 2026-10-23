import { ProviderError } from "../types.js";

export const RA_API_BASE = "https://retroachievements.org/API";
export const RA_MEDIA_BASE = "https://media.retroachievements.org";
export const RA_SITE_BASE = "https://retroachievements.org";

// Identifies this app to RetroAchievements, following the {name}/{version}
// convention in its integration docs. Workers send no User-Agent by default.
const USER_AGENT = "AchievementHub/0.1.0";

/** First part of a response body, on one line, for logs. */
function snippet(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 300) || "(empty body)";
}

export interface RaAuth {
  username: string;
  apiKey: string;
}

// Response shapes from https://api-docs.retroachievements.org (only fields we use).

export interface RaUserProfile {
  User: string;
  ULID?: string;
  UserPic: string;
  MemberSince: string;
  Motto?: string;
  TotalPoints: number;
  TotalSoftcorePoints: number;
  TotalTruePoints: number;
}

export interface RaCompletionEntry {
  GameID: number;
  Title: string;
  ImageIcon: string;
  ConsoleID: number;
  ConsoleName: string;
  MaxPossible: number;
  NumAwarded: number;
  NumAwardedHardcore: number;
  MostRecentAwardedDate: string | null;
  HighestAwardKind: "mastered" | "completed" | "beaten-hardcore" | "beaten-softcore" | null;
  HighestAwardDate: string | null;
}

export interface RaCompletionProgress {
  Count: number;
  Total: number;
  Results: RaCompletionEntry[];
}

export interface RaGameAchievement {
  ID: number;
  Title: string;
  Description: string;
  Points: number;
  TrueRatio: number;
  BadgeName: string;
  DisplayOrder: number;
  NumAwarded: number;
  NumAwardedHardcore: number;
  type?: string | null;
  DateEarned?: string;
  DateEarnedHardcore?: string;
}

export interface RaGameInfoAndUserProgress {
  ID: number;
  Title: string;
  ConsoleName: string;
  ImageIcon: string;
  ImageBoxArt?: string;
  Developer?: string;
  Publisher?: string;
  Genre?: string;
  Released?: string;
  NumAchievements: number;
  NumDistinctPlayers: number;
  NumAwardedToUser: number;
  NumAwardedToUserHardcore: number;
  HighestAwardKind?: RaCompletionEntry["HighestAwardKind"];
  Achievements: Record<string, RaGameAchievement>;
}

export interface RaRecentAchievement {
  Date: string;
  HardcoreMode: number;
  AchievementID: number;
  Title: string;
  Description: string;
  BadgeName: string;
  Points: number;
  Type?: string | null;
  GameTitle: string;
  GameIcon: string;
  GameID: number;
  ConsoleName: string;
}

export class RetroAchievementsClient {
  constructor(
    private auth: RaAuth,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async get<T>(endpoint: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`${RA_API_BASE}/${endpoint}`);
    // `y` is the caller's web API key; it identifies who is making the request.
    url.searchParams.set("y", this.auth.apiKey);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
    } catch (err) {
      console.error(`RetroAchievements ${endpoint}: request failed:`, err);
      throw new ProviderError("Could not reach RetroAchievements. Try again shortly.");
    }

    // Read the body once so failures can be logged with what the server said.
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      console.error(`RetroAchievements ${endpoint}: HTTP ${res.status}: ${snippet(body)}`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("RetroAchievements rejected the API key.", 401);
    }
    if (res.status === 404) {
      throw new ProviderError("Not found on RetroAchievements.", 404);
    }
    if (res.status === 429) {
      throw new ProviderError("RetroAchievements rate limit reached. Try again in a minute.", 429);
    }
    if (!res.ok) {
      throw new ProviderError(`RetroAchievements returned HTTP ${res.status}.`);
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      // e.g. an HTML error or bot-protection page instead of JSON.
      console.error(`RetroAchievements ${endpoint}: expected JSON, got: ${snippet(body)}`);
      throw new ProviderError("RetroAchievements sent an unexpected response. Try again shortly.");
    }
  }

  getUserProfile(username = this.auth.username) {
    return this.get<RaUserProfile>("API_GetUserProfile.php", { u: username });
  }

  /** Fetches every game the user has progress in, following pagination. */
  async getAllCompletionProgress(username = this.auth.username): Promise<RaCompletionEntry[]> {
    const pageSize = 500;
    const results: RaCompletionEntry[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await this.get<RaCompletionProgress>("API_GetUserCompletionProgress.php", {
        u: username,
        c: pageSize,
        o: offset,
      });
      results.push(...(page.Results ?? []));
      if (!page.Results?.length || results.length >= page.Total) return results;
    }
  }

  getGameInfoAndUserProgress(gameId: string, username = this.auth.username) {
    return this.get<RaGameInfoAndUserProgress>("API_GetGameInfoAndUserProgress.php", {
      g: gameId,
      u: username,
      a: 1,
    });
  }

  getRecentAchievements(minutes: number, username = this.auth.username) {
    return this.get<RaRecentAchievement[]>("API_GetUserRecentAchievements.php", { u: username, m: minutes });
  }
}

/** RA timestamps are "YYYY-MM-DD HH:MM:SS" in UTC; convert to ISO 8601. */
export function raDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value.includes("T")) return new Date(value).toISOString();
  return new Date(`${value.replace(" ", "T")}Z`).toISOString();
}

export function raMedia(pathOrUrl: string | undefined): string | undefined {
  if (!pathOrUrl) return undefined;
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${RA_MEDIA_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}
