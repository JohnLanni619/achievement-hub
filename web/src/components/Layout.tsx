import { useSyncExternalStore } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { getNavMode, onNavModeChange } from "../nav/controller";
import { Img } from "./ui";

export function Layout() {
  const { user, logout } = useAuth();
  const navMode = useSyncExternalStore(onNavModeChange, getNavMode);
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span aria-hidden>🏆</span> Achievement Hub
        </Link>
        {user && (
          <div className="topbar-user">
            {user.avatarUrl && <Img src={user.avatarUrl} alt="" size={28} className="avatar" />}
            <span className="muted">{user.displayName}</span>
            <button className="btn btn-ghost btn-small" onClick={() => logout()}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <main className="content">
        <Outlet />
      </main>
      {navMode === "pad" && (
        <footer className="pad-hints" aria-hidden>
          <span>
            <kbd>✥</kbd> Move
          </span>
          <span>
            <kbd>A</kbd> Select
          </span>
          <span>
            <kbd>B</kbd> Back
          </span>
          <span>
            <kbd>LB</kbd>
            <kbd>RB</kbd> Scroll
          </span>
        </footer>
      )}
    </div>
  );
}
