import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../auth/AuthContext";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <aside className="login-brand-pane">
        <div className="login-brand-logo">
          <img src="/brand/logo-white.png" alt="Preferred Square" />
        </div>
        <div className="login-brand-copy">
          <span className="eyebrow">Campus Hiring</span>
          <h1>Where tomorrow's advisors are found, assessed, and welcomed in.</h1>
          <p>
            One shared system for every campus drive — from the pre-placement talk through
            live interview scoring to the final round table.
          </p>
        </div>
        <div className="login-brand-footer">Preferred Square &middot; Internal Platform</div>
      </aside>

      <div className="login-form-pane">
        <div className="login-form-card">
          <span className="eyebrow">Sign in</span>
          <h2>Welcome back</h2>
          <p className="login-subtitle">Sign in with the credentials your campus admin issued you.</p>
          <form onSubmit={handleSubmit}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <div className="error-text">{error}</div>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <div className="login-footnote">Trouble signing in? Contact your campus placement admin.</div>
        </div>
      </div>
    </div>
  );
}
