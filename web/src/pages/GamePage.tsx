import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Achievement } from "../api";
import { AwardBadge, EmptyState, ErrorBox, Img, ProgressBar, Spinner, formatDate, percent } from "../components/ui";
import { useAsync } from "../useAsync";

type Filter = "all" | "earned" | "locked";
type Sort = "default" | "points" | "rarity" | "earned";

const SORTS: Record<Sort, ((a: Achievement, b: Achievement) => number) | null> = {
  default: null,
  points: (a, b) => (b.points ?? 0) - (a.points ?? 0),
  rarity: (a, b) => (a.rarity ?? 101) - (b.rarity ?? 101),
  earned: (a, b) => (b.earnedAt ?? "").localeCompare(a.earnedAt ?? ""),
};

export function GamePage() {
  const { providerId = "", gameId = "" } = useParams();
  const game = useAsync(() => api.game(providerId, gameId).then((r) => r.game), [providerId, gameId]);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("default");

  const achievements = useMemo(() => {
    const list = (game.data?.achievements ?? []).filter(
      (a) => filter === "all" || (filter === "earned" ? a.earned : !a.earned),
    );
    const compare = SORTS[sort];
    return compare ? [...list].sort(compare) : list;
  }, [game.data, filter, sort]);

  if (game.loading && !game.data) return <Spinner />;
  if (game.error) return <ErrorBox error={game.error} onRetry={game.reload} />;
  const g = game.data!;
  const earnedPoints = g.achievements.filter((a) => a.earned).reduce((s, a) => s + (a.points ?? 0), 0);

  return (
    <div className="stack-lg">
      <nav className="muted small breadcrumbs">
        <Link to="/">Dashboard</Link> / <Link to={`/p/${providerId}`}>Games</Link> / <span>{g.title}</span>
      </nav>

      <section className="card game-header">
        <Img src={g.imageUrl ?? g.iconUrl} alt="" size={128} className="game-art" />
        <div className="grow stack-sm">
          <div className="row wrap">
            <h1>{g.title}</h1>
            <AwardBadge award={g.award} />
          </div>
          <p className="muted">{[g.platform, g.genre, g.developer, g.released].filter(Boolean).join(" · ")}</p>
          <ProgressBar value={g.earned} total={g.total} hardcore={g.earnedHardcore} />
          <p className="small">
            <strong>
              {g.earned} of {g.total}
            </strong>{" "}
            achievements ({percent(g.earned, g.total)}%)
            {g.totalPoints ? ` · ${earnedPoints} of ${g.totalPoints} points` : ""}
            {g.earnedHardcore !== undefined && g.earnedHardcore !== g.earned ? ` · ${g.earnedHardcore} in hardcore` : ""}
          </p>
        </div>
      </section>

      <section className="stack">
        <div className="row space-between wrap">
          <h2>Achievements</h2>
          <div className="row wrap toolbar">
            <div className="segmented" role="group" aria-label="Filter achievements">
              {(["all", "earned", "locked"] as Filter[]).map((f) => (
                <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="default">Default order</option>
              <option value="points">Points</option>
              <option value="rarity">Rarest first</option>
              <option value="earned">Recently earned</option>
            </select>
          </div>
        </div>
        {g.total === 0 && <EmptyState>This game has no achievements yet.</EmptyState>}
        {g.total > 0 && achievements.length === 0 && <EmptyState>Nothing here.</EmptyState>}
        <ul className="list">
          {achievements.map((a) => (
            // Focusable so controller users can step through achievements one by one.
            <li key={a.id} className={`card achievement ${a.earned ? "" : "locked"}`} tabIndex={0}>
              <Img src={a.earned ? a.badgeUrl : (a.lockedBadgeUrl ?? a.badgeUrl)} alt="" size={64} className="badge" />
              <div className="grow stack-sm">
                <div className="row wrap">
                  <strong>{a.title}</strong>
                  {a.type && <span className="tag">{a.type.replace(/_/g, " ")}</span>}
                  {a.earnedHardcore && <span className="tag tag-hardcore">hardcore</span>}
                </div>
                <span>{a.description}</span>
                <span className="muted small">
                  {a.earned ? `Earned ${formatDate(a.earnedAt)}` : "Locked"}
                  {a.rarity !== undefined && ` · ${a.rarity}% of players`}
                </span>
              </div>
              {a.points !== undefined && (
                <div className="points">
                  <strong>{a.points}</strong>
                  <span className="muted small">pts</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
