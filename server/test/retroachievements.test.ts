import { describe, expect, it } from "vitest";
import { createRetroAchievementsProvider } from "../src/providers/retroachievements/index.js";
import { ProviderError } from "../src/providers/types.js";
import { fakeRaFetch, raFixtures } from "./fixtures.js";

const creds = { username: "TestPlayer", apiKey: "good-key" };

describe("RetroAchievements provider", () => {
  it("verifies credentials and returns the account", async () => {
    const provider = createRetroAchievementsProvider(fakeRaFetch().impl);
    await expect(provider.verify(creds)).resolves.toEqual({
      externalId: raFixtures.profile.ULID,
      displayName: "TestPlayer",
    });
  });

  it("rejects a bad API key", async () => {
    const provider = createRetroAchievementsProvider(fakeRaFetch().impl);
    const err = await provider.verify({ ...creds, apiKey: "nope" }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(401);
  });

  it("rejects an unknown user", async () => {
    const provider = createRetroAchievementsProvider(fakeRaFetch().impl);
    const err = await provider.verify({ ...creds, username: "Ghost" }).catch((e) => e);
    expect(err.status).toBe(404);
  });

  it("builds a profile with aggregate stats", async () => {
    const provider = createRetroAchievementsProvider(fakeRaFetch().impl);
    const profile = await provider.getProfile(creds);
    expect(profile.avatarUrl).toBe("https://media.retroachievements.org/UserPic/TestPlayer.png");
    expect(profile.profileUrl).toBe("https://retroachievements.org/user/TestPlayer");
    const stats = Object.fromEntries(profile.stats.map((s) => [s.label, s.value]));
    expect(stats).toMatchObject({ "Hardcore points": 1234, Achievements: 8, "Games played": 2, Mastered: 1, Beaten: 1 });
  });

  it("maps the game list", async () => {
    const provider = createRetroAchievementsProvider(fakeRaFetch().impl);
    const games = await provider.listGames(creds);
    expect(games[1]).toEqual({
      id: "1",
      title: "Sonic the Hedgehog",
      platform: "Genesis/Mega Drive",
      iconUrl: "https://media.retroachievements.org/Images/067895.png",
      earned: 5,
      earnedHardcore: 2,
      total: 23,
      lastEarnedAt: "2024-03-01T10:00:00.000Z",
      award: "beaten-softcore",
    });
  });

  it("paginates completion progress", async () => {
    const pages = [
      { Count: 1, Total: 2, Results: [raFixtures.completion.Results[0]] },
      { Count: 1, Total: 2, Results: [raFixtures.completion.Results[1]] },
    ];
    const offsets: string[] = [];
    const impl = (async (input: string | URL) => {
      const url = new URL(String(input));
      offsets.push(url.searchParams.get("o")!);
      return Response.json(pages[offsets.length - 1]);
    }) as typeof fetch;
    const games = await createRetroAchievementsProvider(impl).listGames(creds);
    expect(games.map((g) => g.id)).toEqual(["228", "1"]);
    expect(offsets).toEqual(["0", "500"]);
  });

  it("maps game detail with ordered achievements and rarity", async () => {
    const { impl, calls } = fakeRaFetch();
    const game = await createRetroAchievementsProvider(impl).getGame(creds, "228");
    expect(calls[0].searchParams.get("g")).toBe("228");
    expect(calls[0].searchParams.get("u")).toBe("TestPlayer");
    expect(game).toMatchObject({ id: "228", earned: 1, total: 2, totalPoints: 15, award: null });
    expect(game.achievements.map((a) => a.id)).toEqual(["1", "2"]);
    expect(game.achievements[0]).toMatchObject({
      earned: true,
      earnedHardcore: true,
      earnedAt: "2024-05-01T09:00:00.000Z",
      rarity: 75,
      badgeUrl: "https://media.retroachievements.org/Badge/00001.png",
      lockedBadgeUrl: "https://media.retroachievements.org/Badge/00001_lock.png",
    });
    expect(game.achievements[1]).toMatchObject({ earned: false, rarity: 10 });
  });

  it("rejects non-numeric game ids before calling the API", async () => {
    const { impl, calls } = fakeRaFetch();
    const err = await createRetroAchievementsProvider(impl).getGame(creds, "../x").catch((e) => e);
    expect(err.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("maps recent achievements", async () => {
    const recent = await createRetroAchievementsProvider(fakeRaFetch().impl).getRecentAchievements(creds);
    expect(recent[0]).toMatchObject({ id: "1", gameId: "228", earnedHardcore: true, earned: true });
  });
});
