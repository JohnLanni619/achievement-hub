import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type GameSummary } from "../api";
import { AwardBadge, EmptyState, ErrorBox, Img, ProgressBar, Spinner, formatDate, percent } from "../components/ui";
import { useAsync } from "../useAsync";

type Filter = "all" | "in-progress" | "finished" | "not-started";
type Sort = "recent" | "progress" | "title" | "total";

const FILTERS: Record<Filter, (g: GameSummary) => boolean> = {
  all: () => true,
  "in-progress": (g) => g.earned > 0 && g.earned < g.total,
  finished: (g) => g.total > 0 && g.earned >= g.total,
  "not-started": (g) => g.earned === 0,
};

const SORTS: Record<Sort, (a: GameSummary, b: GameSummary) => number> = {
  recent: (a, b) => (b.lastEarnedAt ?? "").localeCompare(a.lastEarnedAt ?? ""),
  progress: (a, b) => percent(b.earned, b.total) - percent(a.earned, a.total) || b.earned - a.earned,
  title: (a, b) => a.title.localeCompare(b.title),
  total: (a, b) => b.total - a.total,
};

export function ProviderPage() {
  const { providerId = "" } = useParams();
  const navigate = useNavigate();
  const profile = useAsync(() => api.profile(providerId), [providerId]);
  const games = useAsync(() => api.games(providerId).then((r) => r.games), [providerId]);
  const recent = useAsync(() => api.recent(providerId).then((r) => r.achievements), [providerId]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [platform, setPlatform] = useState("");

  const platforms = useMemo(
    () => [...new Set((games.data ?? []).map((g) => g.platform).filter(Boolean) as string[])].sort(),
    [games.data],
  );

  const visibleGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (games.data ?? [])
      .filter(FILTERS[filter])
      .filter((g) => !platform || g.platform === platform)
      .filter((g) => !q || g.title.toLowerCase().includes(q))
      .sort(SORTS[sort]);
  }, [games.data, query, filter, sort, platform]);

  async function refresh() {
    await api.refresh(providerId);
    profile.reload();
    games.reload();
    recent.reload();
  }

  async function disconnect() {
    if (!confirm("Disconnect this service? Your stored credentials will be deleted.")) return;
    await api.disconnect(providerId);
    navigate("/");
  }

  if (profile.loading && !profile.data) return <Spinner />;
  if (profile.error) {
    const err = profile.error;
    if (err instanceof ApiError && err.code === "not_connected") {
      return (
        <EmptyState>
          This service isn't connected. <Link to={`/connect/${providerId}`}>Connect it</Link>
        </EmptyState>
      );
    }
    return (
      <div className="stack">
        <ErrorBox error={err} onRetry={profile.reload} />
        {err instanceof ApiError && err.code === "provider_credentials_rejected" && (
          <Link className="btn" to={`/connect/${providerId}`}>
            Update credentials
          </Link>
        )}
      </div>
    );
  }

  const { provider, profile: p } = profile.data!;

  return (
    <div className="stack-lg">
      <Link to="/" className="muted small">
        ← Dashboard
      </Link>

      <section className="card profile-header">
        <Img src={p.avatarUrl} alt="" size={96} className="avatar" />
        <div className="grow">
          <div className="eyebrow">{provider.name}</div>
          <h1>{p.displayName}</h1>
          {p.motto && <p className="muted">“{p.motto}”</p>}
          <div className="row wrap">
            {p.profileUrl && (
              <a className="btn btn-small" href={p.profileUrl} target="_blank" rel="noreferrer">
                View on {provider.name} ↗
              </a>
            )}
            <button className="btn btn-small" onClick={refresh}>
              Refresh
            </button>
            <Link className="btn btn-small" to={`/connect/${providerId}`}>
              Update credentials
            </Link>
            <button className="btn btn-small btn-danger" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        </div>
      </section>

      <dl className="stats">
        {p.stats.map((s) => (
          <div key={s.label} className="card stat">
            <dt>{s.label}</dt>
            <dd>{s.value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>

      <section className="stack">
        <h2>Recently earned</h2>
        {recent.loading && !recent.data && <Spinner />}
        {recent.error && <ErrorBox error={recent.error} onRetry={recent.reload} />}
        {recent.data && recent.data.length === 0 && <EmptyState>No achievements earned in the last 30 days.</EmptyState>}
        {recent.data && recent.data.length > 0 && (
          <div className="recent-strip">
            {recent.data.map((a) => (
              <Link
                key={`${a.gameId}-${a.id}-${a.earnedAt}`}
                to={`/p/${providerId}/games/${a.gameId}`}
                className="card recent-item"
                title={a.description}
              >
                <Img src={a.badgeUrl} alt="" size={48} className="badge" />
                <div className="recent-text">
                  <strong>{a.title}</strong>
                  <span className="muted small">{a.gameTitle}</span>
                  <span className="muted small">
                    {formatDate(a.earnedAt)}
                    {a.points !== undefined && ` · ${a.points} pts`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="stack">
        <div className="row space-between wrap">
          <h2>Games {games.data && <span className="muted">({visibleGames.length})</span>}</h2>
          <div className="row wrap toolbar">
            <input
              type="search"
              placeholder="Search games"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search games"
            />
            {platforms.length > 1 && (
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
                <option value="">All platforms</option>
                {platforms.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            )}
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter">
              <option value="all">All games</option>
              <option value="in-progress">In progress</option>
              <option value="finished">100% complete</option>
              <option value="not-started">Not started</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="recent">Recently played</option>
              <option value="progress">Completion</option>
              <option value="title">Title</option>
              <option value="total">Most achievements</option>
            </select>
          </div>
        </div>
        {games.loading && !games.data && <Spinner />}
        {games.error && <ErrorBox error={games.error} onRetry={games.reload} />}
        {games.data && visibleGames.length === 0 && <EmptyState>No games match.</EmptyState>}
        <ul className="list">
          {visibleGames.map((g) => (
            <li key={g.id}>
              <Link to={`/p/${providerId}/games/${g.id}`} className="card game-row">
                <Img src={g.iconUrl} alt="" size={56} className="game-icon" />
                <div className="grow stack-sm">
                  <div className="row space-between wrap">
                    <strong>{g.title}</strong>
                    <AwardBadge award={g.award} />
                  </div>
                  <span className="muted small">
                    {g.platform}
                    {g.lastEarnedAt && ` · last earned ${formatDate(g.lastEarnedAt)}`}
                  </span>
                  <ProgressBar value={g.earned} total={g.total} hardcore={g.earnedHardcore} />
                </div>
                <div className="game-count">
                  <strong>{percent(g.earned, g.total)}%</strong>
                  <span className="muted small">
                    {g.earned}/{g.total}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
