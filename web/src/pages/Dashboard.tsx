import { Link } from "react-router-dom";
import { api, type ProviderWithConnection } from "../api";
import { useAuth } from "../auth";
import { EmptyState, ErrorBox, Img, Spinner } from "../components/ui";
import { useAsync } from "../useAsync";

export function Dashboard() {
  const { user } = useAuth();
  const providers = useAsync(() => api.providers().then((r) => r.providers), []);

  if (providers.loading && !providers.data) return <Spinner />;
  if (providers.error) return <ErrorBox error={providers.error} onRetry={providers.reload} />;

  const all = providers.data ?? [];
  const connected = all.filter((p) => p.connection);
  const available = all.filter((p) => !p.connection);

  return (
    <div className="stack-lg">
      <section>
        <h1>Welcome back, {user?.displayName}</h1>
        <p className="muted">Your connected services and achievement progress.</p>
      </section>

      <section className="stack">
        <h2>Connected services</h2>
        {connected.length === 0 ? (
          <EmptyState>You haven't connected any services yet. Pick one below to get started.</EmptyState>
        ) : (
          <div className="grid">
            {connected.map((p) => (
              <ConnectedProviderCard key={p.id} provider={p} />
            ))}
          </div>
        )}
      </section>

      {available.length > 0 && (
        <section className="stack">
          <h2>Add a service</h2>
          <div className="grid">
            {available.map((p) => (
              <div key={p.id} className="card provider-card">
                <h3>{p.name}</h3>
                <p className="muted">{p.description}</p>
                <Link className="btn btn-primary" to={`/connect/${p.id}`}>
                  Connect {p.name}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ConnectedProviderCard({ provider }: { provider: ProviderWithConnection }) {
  const profile = useAsync(() => api.profile(provider.id).then((r) => r.profile), [provider.id]);

  return (
    <Link to={`/p/${provider.id}`} className="card provider-card provider-card-link">
      <div className="row">
        <Img src={profile.data?.avatarUrl} alt="" size={56} className="avatar" />
        <div>
          <div className="eyebrow">{provider.name}</div>
          <h3>{provider.connection!.displayName}</h3>
        </div>
      </div>
      {profile.loading && !profile.data && <Spinner label="Loading profile…" />}
      {profile.error && <div className="error-box">{profile.error.message}</div>}
      {profile.data && (
        <dl className="mini-stats">
          {profile.data.stats.slice(0, 4).map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      )}
      <span className="link-text">View achievements →</span>
    </Link>
  );
}
