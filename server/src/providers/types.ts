/**
 * Every achievement service (RetroAchievements, Steam, Xbox, ...) implements
 * `Provider` and maps its own API onto these normalized shapes, so the API
 * routes and the web UI never need provider-specific code.
 */

export interface CredentialField {
  name: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  helpText?: string;
}

/** Raw credentials as entered by the user, keyed by `CredentialField.name`. */
export type Credentials = Record<string, string>;

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  homepage: string;
  /** Short markdown-free instructions shown on the connect form. */
  connectInstructions: string;
  credentialFields: CredentialField[];
}

export interface Stat {
  label: string;
  value: string | number;
}

export interface Profile {
  externalId: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl?: string;
  motto?: string;
  stats: Stat[];
}

export type Award = "mastered" | "completed" | "beaten" | "beaten-softcore" | null;

export interface GameSummary {
  id: string;
  title: string;
  platform?: string;
  iconUrl?: string;
  earned: number;
  total: number;
  /** Achievements earned in the provider's "hard" mode, if it has one. */
  earnedHardcore?: number;
  lastEarnedAt?: string;
  award?: Award;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  points?: number;
  badgeUrl?: string;
  lockedBadgeUrl?: string;
  /** Percentage (0-100) of the game's players who have earned it. */
  rarity?: number;
  type?: string;
  earned: boolean;
  earnedAt?: string;
  earnedHardcore?: boolean;
}

export interface GameDetail extends GameSummary {
  imageUrl?: string;
  developer?: string;
  publisher?: string;
  genre?: string;
  released?: string;
  totalPoints?: number;
  achievements: Achievement[];
}

export interface RecentAchievement extends Achievement {
  gameId: string;
  gameTitle: string;
  gameIconUrl?: string;
  platform?: string;
}

export interface ProviderAccount {
  externalId: string;
  displayName: string;
}

export interface Provider extends ProviderInfo {
  /** Checks the credentials against the service; throws ProviderError if invalid. */
  verify(credentials: Credentials): Promise<ProviderAccount>;
  getProfile(credentials: Credentials): Promise<Profile>;
  listGames(credentials: Credentials): Promise<GameSummary[]>;
  getGame(credentials: Credentials, gameId: string): Promise<GameDetail>;
  getRecentAchievements(credentials: Credentials): Promise<RecentAchievement[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    /** HTTP status to surface to the client. */
    public status: number = 502,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
