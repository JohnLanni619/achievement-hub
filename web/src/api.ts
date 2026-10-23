// Mirrors the normalized shapes in server/src/providers/types.ts.

export interface User {
  id: number;
  email: string;
  displayName: string;
}

export interface CredentialField {
  name: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  helpText?: string;
}

export interface Connection {
  id: number;
  providerId: string;
  externalId: string;
  displayName: string;
  connectedAt: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  homepage: string;
  connectInstructions: string;
  credentialFields: CredentialField[];
}

export interface ProviderWithConnection extends ProviderInfo {
  connection: Connection | null;
}

export interface Profile {
  externalId: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl?: string;
  motto?: string;
  stats: { label: string; value: string | number }[];
}

export type Award = "mastered" | "completed" | "beaten" | "beaten-softcore" | null;

export interface GameSummary {
  id: string;
  title: string;
  platform?: string;
  iconUrl?: string;
  earned: number;
  total: number;
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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Called when any request comes back 401, so the app can drop to the sign-in screen. */
let onUnauthenticated: () => void = () => {};
export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "X-Requested-With": "achievement-hub",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.code === "unauthenticated") onUnauthenticated();
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.code);
  }
  return data as T;
}

const p = (providerId: string) => `/connections/${encodeURIComponent(providerId)}`;

export const api = {
  me: () => request<{ user: User | null }>("GET", "/auth/me"),
  login: (email: string, password: string) => request<{ user: User }>("POST", "/auth/login", { email, password }),
  register: (email: string, password: string, displayName: string) =>
    request<{ user: User }>("POST", "/auth/register", { email, password, displayName }),
  logout: () => request<void>("POST", "/auth/logout"),

  providers: () => request<{ providers: ProviderWithConnection[] }>("GET", "/providers"),
  connect: (providerId: string, credentials: Record<string, string>) =>
    request<{ connection: Connection }>("PUT", p(providerId), { credentials }),
  disconnect: (providerId: string) => request<void>("DELETE", p(providerId)),
  refresh: (providerId: string) => request<void>("POST", `${p(providerId)}/refresh`),

  profile: (providerId: string) =>
    request<{ provider: ProviderInfo; profile: Profile }>("GET", `${p(providerId)}/profile`),
  games: (providerId: string) => request<{ games: GameSummary[] }>("GET", `${p(providerId)}/games`),
  game: (providerId: string, gameId: string) =>
    request<{ game: GameDetail }>("GET", `${p(providerId)}/games/${encodeURIComponent(gameId)}`),
  recent: (providerId: string) =>
    request<{ achievements: RecentAchievement[] }>("GET", `${p(providerId)}/recent`),
};
