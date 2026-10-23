// Fixtures modeled on responses documented at https://api-docs.retroachievements.org
export const raFixtures = {
  profile: {
    User: "TestPlayer",
    ULID: "00003EMFWR7XB8SDPEHB3K56ZQ",
    UserPic: "/UserPic/TestPlayer.png",
    MemberSince: "2013-04-04 22:01:22",
    Motto: "Hardcore or nothing",
    TotalPoints: 1234,
    TotalSoftcorePoints: 56,
    TotalTruePoints: 4321,
  },
  completion: {
    Count: 2,
    Total: 2,
    Results: [
      {
        GameID: 228,
        Title: "Super Mario World",
        ImageIcon: "/Images/066584.png",
        ConsoleID: 3,
        ConsoleName: "SNES/Super Famicom",
        MaxPossible: 3,
        NumAwarded: 3,
        NumAwardedHardcore: 3,
        MostRecentAwardedDate: "2024-05-01T10:00:00+00:00",
        HighestAwardKind: "mastered",
        HighestAwardDate: "2024-05-01T10:00:00+00:00",
      },
      {
        GameID: 1,
        Title: "Sonic the Hedgehog",
        ImageIcon: "/Images/067895.png",
        ConsoleID: 1,
        ConsoleName: "Genesis/Mega Drive",
        MaxPossible: 23,
        NumAwarded: 5,
        NumAwardedHardcore: 2,
        MostRecentAwardedDate: "2024-03-01T10:00:00+00:00",
        HighestAwardKind: "beaten-softcore",
        HighestAwardDate: "2024-03-01T10:00:00+00:00",
      },
    ],
  },
  game: {
    ID: 228,
    Title: "Super Mario World",
    ConsoleName: "SNES/Super Famicom",
    ImageIcon: "/Images/066584.png",
    ImageBoxArt: "/Images/051186.png",
    Developer: "Nintendo EAD",
    Publisher: "Nintendo",
    Genre: "2D Platforming",
    Released: "1990-11-21",
    NumAchievements: 2,
    NumDistinctPlayers: 200,
    NumAwardedToUser: 1,
    NumAwardedToUserHardcore: 1,
    HighestAwardKind: null,
    Achievements: {
      "2": {
        ID: 2,
        Title: "Second",
        Description: "Locked one",
        Points: 10,
        TrueRatio: 30,
        BadgeName: "00002",
        DisplayOrder: 2,
        NumAwarded: 20,
        NumAwardedHardcore: 10,
        type: null,
      },
      "1": {
        ID: 1,
        Title: "First",
        Description: "Earned one",
        Points: 5,
        TrueRatio: 7,
        BadgeName: "00001",
        DisplayOrder: 1,
        NumAwarded: 150,
        NumAwardedHardcore: 100,
        type: "progression",
        DateEarned: "2024-05-01 09:00:00",
        DateEarnedHardcore: "2024-05-01 09:00:00",
      },
    },
  },
  recent: [
    {
      Date: "2024-05-01 09:00:00",
      HardcoreMode: 1,
      AchievementID: 1,
      Title: "First",
      Description: "Earned one",
      BadgeName: "00001",
      Points: 5,
      Type: "progression",
      GameTitle: "Super Mario World",
      GameIcon: "/Images/066584.png",
      GameID: 228,
      ConsoleName: "SNES/Super Famicom",
    },
  ],
};

/** A fake fetch that routes RA endpoints to fixtures and records requested URLs. */
export function fakeRaFetch(options: { validKey?: string } = {}) {
  const validKey = options.validKey ?? "good-key";
  const calls: URL[] = [];
  const impl = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.searchParams.get("y") !== validKey) {
      return new Response(JSON.stringify({ message: "Unauthenticated." }), { status: 401 });
    }
    const endpoint = url.pathname.split("/").pop();
    const body = {
      "API_GetUserProfile.php": url.searchParams.get("u") === "TestPlayer" ? raFixtures.profile : {},
      "API_GetUserCompletionProgress.php": raFixtures.completion,
      "API_GetGameInfoAndUserProgress.php": raFixtures.game,
      "API_GetUserRecentAchievements.php": raFixtures.recent,
    }[endpoint ?? ""];
    if (!body) return new Response("not found", { status: 404 });
    return Response.json(body);
  }) as typeof fetch;
  return { impl, calls };
}
