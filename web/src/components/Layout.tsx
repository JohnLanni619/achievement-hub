import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { Img } from "./ui";

export function Layout() {
  const { user, logout } = useAuth();
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
    </div>
  );
}
