import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { Connect } from "./pages/Connect";
import { Dashboard } from "./pages/Dashboard";
import { GamePage } from "./pages/GamePage";
import { LoginPage } from "./pages/LoginPage";
import { ProviderPage } from "./pages/ProviderPage";
import "./styles.css";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/connect/:providerId" element={<RequireAuth><Connect /></RequireAuth>} />
            <Route path="/p/:providerId" element={<RequireAuth><ProviderPage /></RequireAuth>} />
            <Route path="/p/:providerId/games/:gameId" element={<RequireAuth><GamePage /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
