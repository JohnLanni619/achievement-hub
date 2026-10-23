import type { Achievement, GameDetail, Provider } from "./types.js";
import { ProviderError } from "./types.js";

/**
 * A fake provider with deterministic sample data. Useful for trying the app
 * without real service credentials. Enabled via ENABLE_DEMO_PROVIDER.
 */

const DAY = 24 * 60 * 60 * 1000;
const BASE_TIME = Date.UTC(2026, 0, 15, 18, 0, 0);

interface DemoGameSeed {
  id: string;
  title: string;
  platform: string;
  achievements: number;
  earned: number;
  color: string;
}

const SEEDS: DemoGameSeed[] = [
  { id: "1", title: "Star Courier", platform: "Demo Console", achievements: 24, earned: 24, color: "#6c5ce7" },
  { id: "2", title: "Pixel Knights", platform: "Demo Console", achievements: 40, earned: 22, color: "#00b894" },
  { id: "3", title: "Turbo Lanes", platform: "Demo Handheld", achievements: 18, earned: 3, color: "#e17055" },
  { id: "4", title: "Moonlit Manor", platform: "Demo Handheld", achievements: 30, earned: 0, color: "#0984e3" },
];

function icon(label: string, color: string, locked = false): string {
  const fill = locked ? "#8a8f98" : color;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
    `<rect width="64" height="64" rx="12" fill="${fill}"/>` +
    `<text x="32" y="41" font-family="sans-serif" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildGame(seed: DemoGameSeed): GameDetail {
  const achievements: Achievement[] = Array.from({ length: seed.achievements }, (_, i) => {
    const earned = i < seed.earned;
    const n = i + 1;
    return {
      id: `${seed.id}-${n}`,
      title: `${seed.title} #${n}`,
      description: `Complete challenge ${n} in ${seed.title}.`,
      points: [1, 2, 3, 5, 10, 25][i % 6],
      badgeUrl: icon(String(n), seed.color),
      lockedBadgeUrl: icon(String(n), seed.color, true),
      rarity: Math.max(1, Math.round(90 - (n / seed.achievements) * 85)),
      type: n === seed.achievements ? "win_condition" : undefined,
      earned,
      earnedAt: earned ? new Date(BASE_TIME - (Number(seed.id) * 40 + (seed.earned - i)) * DAY).toISOString() : undefined,
      earnedHardcore: earned && i % 3 !== 0,
    };
  });
  const earned = achievements.filter((a) => a.earned);
  return {
    id: seed.id,
    title: seed.title,
    platform: seed.platform,
    iconUrl: icon(seed.title[0], seed.color),
    imageUrl: icon(seed.title[0], seed.color),
    developer: "Demo Studios",
    genre: "Action",
    released: "1994",
    earned: earned.length,
    earnedHardcore: earned.filter((a) => a.earnedHardcore).length,
    total: achievements.length,
    totalPoints: achievements.reduce((s, a) => s + (a.points ?? 0), 0),
    award: earned.length === achievements.length ? "mastered" : earned.length > seed.achievements / 2 ? "beaten" : null,
    lastEarnedAt: earned.map((a) => a.earnedAt!).sort().at(-1),
    achievements,
  };
}

const GAMES = SEEDS.map(buildGame);

export const demoProvider: Provider = {
  id: "demo",
  name: "Demo Provider",
  description: "Sample data for trying out Achievement Hub without a real account.",
  homepage: "https://example.com",
  connectInstructions: "Enter any username. No real account is needed.",
  credentialFields: [{ name: "username", label: "Username", type: "text", placeholder: "player1" }],

  async verify(credentials) {
    const username = credentials.username?.trim();
    if (!username) throw new ProviderError("Username is required.", 400);
    return { externalId: username.toLowerCase(), displayName: username };
  },

  async getProfile(credentials) {
    const earned = GAMES.flatMap((g) => g.achievements.filter((a) => a.earned));
    return {
      externalId: credentials.username.toLowerCase(),
      displayName: credentials.username,
      avatarUrl: icon(credentials.username[0]?.toUpperCase() ?? "?", "#2d3436"),
      motto: "Just here for the badges.",
      stats: [
        { label: "Points", value: earned.reduce((s, a) => s + (a.points ?? 0), 0) },
        { label: "Achievements", value: earned.length },
        { label: "Games played", value: GAMES.length },
        { label: "Mastered", value: GAMES.filter((g) => g.award === "mastered").length },
      ],
    };
  },

  async listGames() {
    return GAMES.map(({ achievements: _achievements, ...summary }) => summary);
  },

  async getGame(_credentials, gameId) {
    const game = GAMES.find((g) => g.id === gameId);
    if (!game) throw new ProviderError("Game not found.", 404);
    return game;
  },

  async getRecentAchievements() {
    return GAMES.flatMap((g) =>
      g.achievements
        .filter((a) => a.earned)
        .map((a) => ({ ...a, gameId: g.id, gameTitle: g.title, gameIconUrl: g.iconUrl, platform: g.platform })),
    )
      .sort((a, b) => b.earnedAt!.localeCompare(a.earnedAt!))
      .slice(0, 15);
  },
};
