import type {
  Achievement,
  Award,
  Credentials,
  GameDetail,
  GameSummary,
  Profile,
  Provider,
  RecentAchievement,
} from "../types.js";
import { ProviderError } from "../types.js";
import {
  RA_MEDIA_BASE,
  RA_SITE_BASE,
  RetroAchievementsClient,
  raDate,
  raMedia,
  type RaCompletionEntry,
  type RaGameAchievement,
} from "./client.js";

const RECENT_WINDOW_MINUTES = 60 * 24 * 30;

function toAward(kind: RaCompletionEntry["HighestAwardKind"] | undefined): Award {
  switch (kind) {
    case "mastered":
    case "completed":
      return kind;
    case "beaten-hardcore":
      return "beaten";
    case "beaten-softcore":
      return "beaten-softcore";
    default:
      return null;
  }
}

function badgeUrls(badgeName: string) {
  return {
    badgeUrl: `${RA_MEDIA_BASE}/Badge/${badgeName}.png`,
    lockedBadgeUrl: `${RA_MEDIA_BASE}/Badge/${badgeName}_lock.png`,
  };
}

export function mapGameSummary(entry: RaCompletionEntry): GameSummary {
  return {
    id: String(entry.GameID),
    title: entry.Title,
    platform: entry.ConsoleName,
    iconUrl: raMedia(entry.ImageIcon),
    earned: Math.max(entry.NumAwarded, entry.NumAwardedHardcore),
    earnedHardcore: entry.NumAwardedHardcore,
    total: entry.MaxPossible,
    lastEarnedAt: raDate(entry.MostRecentAwardedDate),
    award: toAward(entry.HighestAwardKind),
  };
}

export function mapAchievement(a: RaGameAchievement, distinctPlayers: number): Achievement {
  const earnedAt = raDate(a.DateEarnedHardcore) ?? raDate(a.DateEarned);
  return {
    id: String(a.ID),
    title: a.Title,
    description: a.Description,
    points: a.Points,
    ...badgeUrls(a.BadgeName),
    rarity: distinctPlayers > 0 ? Math.round((a.NumAwarded / distinctPlayers) * 1000) / 10 : undefined,
    type: a.type ?? undefined,
    earned: Boolean(earnedAt),
    earnedAt,
    earnedHardcore: Boolean(a.DateEarnedHardcore),
  };
}

export function createRetroAchievementsProvider(fetchImpl: typeof fetch = fetch): Provider {
  const clientFor = (credentials: Credentials) =>
    new RetroAchievementsClient({ username: credentials.username, apiKey: credentials.apiKey }, fetchImpl);

  async function loadProfile(credentials: Credentials) {
    const profile = await clientFor(credentials).getUserProfile();
    if (!profile || !profile.User) {
      throw new ProviderError(`No RetroAchievements user named "${credentials.username}".`, 404);
    }
    return profile;
  }

  return {
    id: "retroachievements",
    name: "RetroAchievements",
    description: "Achievements for classic console and handheld games played through emulators.",
    homepage: RA_SITE_BASE,
    connectInstructions:
      "Sign in to retroachievements.org, open Settings, and copy the \"Web API Key\" from the Keys section. " +
      "Your key is stored encrypted and only used to read your achievement data.",
    credentialFields: [
      { name: "username", label: "Username", type: "text", placeholder: "Your RetroAchievements username" },
      {
        name: "apiKey",
        label: "Web API key",
        type: "password",
        helpText: "Found at retroachievements.org/settings under Keys.",
      },
    ],

    async verify(credentials) {
      if (!credentials.username?.trim() || !credentials.apiKey?.trim()) {
        throw new ProviderError("Username and API key are required.", 400);
      }
      const profile = await loadProfile(credentials);
      return { externalId: profile.ULID ?? profile.User, displayName: profile.User };
    },

    async getProfile(credentials): Promise<Profile> {
      const [profile, games] = await Promise.all([
        loadProfile(credentials),
        clientFor(credentials).getAllCompletionProgress(),
      ]);
      const earned = games.reduce((sum, g) => sum + Math.max(g.NumAwarded, g.NumAwardedHardcore), 0);
      const mastered = games.filter((g) => g.HighestAwardKind === "mastered").length;
      const beaten = games.filter((g) => g.HighestAwardKind?.startsWith("beaten")).length;
      return {
        externalId: profile.ULID ?? profile.User,
        displayName: profile.User,
        avatarUrl: raMedia(profile.UserPic),
        profileUrl: `${RA_SITE_BASE}/user/${encodeURIComponent(profile.User)}`,
        motto: profile.Motto || undefined,
        stats: [
          { label: "Hardcore points", value: profile.TotalPoints },
          { label: "Softcore points", value: profile.TotalSoftcorePoints },
          { label: "RetroPoints", value: profile.TotalTruePoints },
          { label: "Achievements", value: earned },
          { label: "Games played", value: games.length },
          { label: "Mastered", value: mastered },
          { label: "Beaten", value: beaten },
        ],
      };
    },

    async listGames(credentials) {
      const games = await clientFor(credentials).getAllCompletionProgress();
      return games.map(mapGameSummary);
    },

    async getGame(credentials, gameId): Promise<GameDetail> {
      if (!/^\d+$/.test(gameId)) throw new ProviderError("Invalid game id.", 400);
      const game = await clientFor(credentials).getGameInfoAndUserProgress(gameId);
      if (!game || !game.ID) throw new ProviderError("Game not found.", 404);
      const achievements = Object.values(game.Achievements ?? {})
        .sort((a, b) => a.DisplayOrder - b.DisplayOrder || a.ID - b.ID)
        .map((a) => mapAchievement(a, game.NumDistinctPlayers));
      return {
        id: String(game.ID),
        title: game.Title,
        platform: game.ConsoleName,
        iconUrl: raMedia(game.ImageIcon),
        imageUrl: raMedia(game.ImageBoxArt),
        developer: game.Developer || undefined,
        publisher: game.Publisher || undefined,
        genre: game.Genre || undefined,
        released: game.Released || undefined,
        earned: Math.max(game.NumAwardedToUser, game.NumAwardedToUserHardcore),
        earnedHardcore: game.NumAwardedToUserHardcore,
        total: game.NumAchievements,
        totalPoints: achievements.reduce((sum, a) => sum + (a.points ?? 0), 0),
        award: toAward(game.HighestAwardKind),
        lastEarnedAt: achievements
          .map((a) => a.earnedAt)
          .filter((d): d is string => Boolean(d))
          .sort()
          .at(-1),
        achievements,
      };
    },

    async getRecentAchievements(credentials): Promise<RecentAchievement[]> {
      const recent = await clientFor(credentials).getRecentAchievements(RECENT_WINDOW_MINUTES);
      return (recent ?? []).map((r) => ({
        id: String(r.AchievementID),
        title: r.Title,
        description: r.Description,
        points: r.Points,
        ...badgeUrls(r.BadgeName),
        type: r.Type ?? undefined,
        earned: true,
        earnedAt: raDate(r.Date),
        earnedHardcore: r.HardcoreMode === 1,
        gameId: String(r.GameID),
        gameTitle: r.GameTitle,
        gameIconUrl: raMedia(r.GameIcon),
        platform: r.ConsoleName,
      }));
    },
  };
}
