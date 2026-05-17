import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="flex items-center justify-center min-h-screen text-zinc-400">
        <div className="typing-dots"><span /><span /><span /></div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
