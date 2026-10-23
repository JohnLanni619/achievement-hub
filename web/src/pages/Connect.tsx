import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ErrorBox, Spinner } from "../components/ui";
import { useAsync } from "../useAsync";

export function Connect() {
  const { providerId = "" } = useParams();
  const navigate = useNavigate();
  const providers = useAsync(() => api.providers().then((r) => r.providers), []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  if (providers.loading && !providers.data) return <Spinner />;
  if (providers.error) return <ErrorBox error={providers.error} onRetry={providers.reload} />;

  const provider = providers.data?.find((p) => p.id === providerId);
  if (!provider) return <ErrorBox error={new Error("Unknown service.")} />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await api.connect(providerId, values);
      navigate(`/p/${providerId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const reconnecting = Boolean(provider.connection);
  return (
    <div className="narrow stack">
      <Link to="/" className="muted small">
        ← Dashboard
      </Link>
      <form className="card stack" onSubmit={onSubmit}>
        <h1>
          {reconnecting ? "Update" : "Connect"} {provider.name}
        </h1>
        <p className="muted">{provider.connectInstructions}</p>
        {provider.credentialFields.map((field) => (
          <label key={field.name} className="field">
            <span>{field.label}</span>
            <input
              type={field.type}
              placeholder={field.placeholder}
              autoComplete={field.type === "password" ? "off" : undefined}
              value={values[field.name] ?? ""}
              onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
              required
            />
            {field.helpText && <small className="muted">{field.helpText}</small>}
          </label>
        ))}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-primary" disabled={submitting}>
          {submitting ? "Verifying…" : reconnecting ? "Save" : "Connect"}
        </button>
      </form>
    </div>
  );
}
