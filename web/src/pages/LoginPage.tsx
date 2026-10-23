import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Spinner } from "../components/ui";
import { useAsync } from "../useAsync";

const ERRORS: Record<string, string> = {
  google_denied: "Google sign-in was cancelled.",
  google_failed: "Google sign-in failed. Please try again.",
  invalid_state: "Your sign-in session expired. Please try again.",
  email_unverified: "Your Google account's email address isn't verified.",
  google_not_configured: "Google sign-in isn't configured on this server yet.",
};

export function LoginPage() {
  const { user, devLogin } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const config = useAsync(() => api.authConfig(), []);
  const [email, setEmail] = useState("");
  const [devError, setDevError] = useState<string>();

  const returnTo = (location.state as { from?: string } | null)?.from ?? "/";
  if (user) return <Navigate to={returnTo} replace />;

  const errorCode = params.get("error");
  const error = errorCode ? (ERRORS[errorCode] ?? "Sign-in failed. Please try again.") : undefined;

  async function onDevLogin(e: FormEvent) {
    e.preventDefault();
    setDevError(undefined);
    try {
      await devLogin(email);
    } catch (err) {
      setDevError((err as Error).message);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Sign in</h1>
        <p className="muted">All your achievements, from every service, in one place.</p>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {config.loading && <Spinner />}
        {config.data && (
          <>
            <a
              className={`btn btn-google ${config.data.google ? "" : "disabled"}`}
              href={config.data.google ? `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}` : undefined}
              aria-disabled={!config.data.google}
            >
              <GoogleLogo /> Continue with Google
            </a>
            {!config.data.google && (
              <p className="muted small">Google sign-in isn't configured. See the README to set it up.</p>
            )}
            {config.data.devLogin && (
              <form className="stack dev-login" onSubmit={onDevLogin}>
                <p className="eyebrow">Local development</p>
                <label className="field">
                  <span>Sign in as (no password)</span>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                {devError && <div className="error-box">{devError}</div>}
                <button className="btn">Dev sign-in</button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
