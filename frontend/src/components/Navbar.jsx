import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Clapperboard, LogOut, LayoutDashboard, Sparkles } from "lucide-react";

export default function Navbar({ minimal = false }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const onLogout = async () => {
    await logout();
    nav("/");
  };

  return (
    <header
      className="sticky top-0 z-50 glass-strong border-b border-white/10"
      data-testid="app-navbar"
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group" data-testid="nav-logo">
          <span className="w-9 h-9 rounded-xl bg-[#d97736] flex items-center justify-center text-[#0a0a0a]">
            <Clapperboard size={18} strokeWidth={2.5} />
          </span>
          <div className="leading-tight">
            <div className="font-display font-black text-lg tracking-tight">ROLEPLAY</div>
            <div className="eyebrow text-[10px] -mt-0.5">Live Simulator</div>
          </div>
        </Link>

        {!minimal && (
          <nav className="hidden md:flex items-center gap-8 text-sm text-zinc-300">
            <Link to="/scenarios" className={`hover:text-white transition ${loc.pathname.startsWith("/scenarios") ? "text-white" : ""}`} data-testid="nav-scenarios">
              Scenarios
            </Link>
            {user && (
              <Link to="/dashboard" className={`hover:text-white transition ${loc.pathname.startsWith("/dashboard") ? "text-white" : ""}`} data-testid="nav-dashboard">
                Dashboard
              </Link>
            )}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                to="/dashboard"
                className="hidden sm:inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition"
                data-testid="nav-user-name"
              >
                <LayoutDashboard size={16} />
                <span>{user.name}</span>
              </Link>
              <button onClick={onLogout} className="btn-ghost text-sm" data-testid="nav-logout-btn">
                <LogOut size={14} className="inline mr-1.5" />
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-zinc-300 hover:text-white transition" data-testid="nav-login-link">
                Sign in
              </Link>
              <Link to="/register" className="btn-primary text-sm" data-testid="nav-signup-btn">
                <Sparkles size={14} />
                Start free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
