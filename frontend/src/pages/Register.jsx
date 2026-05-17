import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Lock, ArrowRight } from "lucide-react";

export default function Register() {
  const { register, error } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await register(name, email, password);
    setLoading(false);
    if (ok) nav("/scenarios");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar minimal />
      <div className="max-w-md mx-auto px-6 py-20">
        <div className="eyebrow mb-3">Create account</div>
        <h1 className="font-display font-black text-4xl tracking-tighter mb-2">Step into your first scene.</h1>
        <p className="text-zinc-400 mb-10">Takes less than 30 seconds.</p>

        <form onSubmit={onSubmit} className="space-y-6" data-testid="register-form">
          <div>
            <Label className="text-zinc-300 mb-2 block">Name</Label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                required value={name} onChange={(e) => setName(e.target.value)}
                className="pl-10 bg-[#141414] border-white/10 text-white focus:border-[#d97736] h-12"
                placeholder="Alex"
                data-testid="register-name-input"
              />
            </div>
          </div>
          <div>
            <Label className="text-zinc-300 mb-2 block">Email</Label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-[#141414] border-white/10 text-white focus:border-[#d97736] h-12"
                placeholder="you@example.com"
                data-testid="register-email-input"
              />
            </div>
          </div>
          <div>
            <Label className="text-zinc-300 mb-2 block">Password</Label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-[#141414] border-white/10 text-white focus:border-[#d97736] h-12"
                placeholder="At least 6 characters"
                data-testid="register-password-input"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3" data-testid="register-error">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center" data-testid="register-submit-btn">
            {loading ? "Creating account..." : "Create account"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <p className="mt-8 text-sm text-zinc-500">
          Already have an account?{" "}
          <Link to="/login" className="text-[#d97736] hover:text-[#f2a900]" data-testid="register-login-link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
