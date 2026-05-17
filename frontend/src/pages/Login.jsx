import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight } from "lucide-react";

export default function Login() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) nav(loc.state?.from || "/scenarios");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar minimal />
      <div className="max-w-md mx-auto px-6 py-20">
        <div className="eyebrow mb-3">Sign in</div>
        <h1 className="font-display font-black text-4xl tracking-tighter mb-2">Back to the set.</h1>
        <p className="text-zinc-400 mb-10">Pick up where you left off.</p>

        <form onSubmit={onSubmit} className="space-y-6" data-testid="login-form">
          <div>
            <Label className="text-zinc-300 mb-2 block">Email</Label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-[#141414] border-white/10 text-white focus:border-[#d97736] h-12"
                placeholder="you@example.com"
                data-testid="login-email-input"
              />
            </div>
          </div>
          <div>
            <Label className="text-zinc-300 mb-2 block">Password</Label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                type="password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-[#141414] border-white/10 text-white focus:border-[#d97736] h-12"
                placeholder="••••••••"
                data-testid="login-password-input"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3" data-testid="login-error">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center" data-testid="login-submit-btn">
            {loading ? "Signing in..." : "Sign in"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <p className="mt-8 text-sm text-zinc-500">
          New here?{" "}
          <Link to="/register" className="text-[#d97736] hover:text-[#f2a900]" data-testid="login-register-link">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
