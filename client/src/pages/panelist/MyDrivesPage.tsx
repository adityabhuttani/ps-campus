import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { roleAtLeast, useAuth } from "../../auth/AuthContext";
import { Drive } from "../../lib/types";

export function MyDrivesPage() {
  const { user } = useAuth();
  const [drives, setDrives] = useState<Drive[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Drive[]>("/drives/mine")
      .then(setDrives)
      .finally(() => setLoading(false));
  }, []);

  // Captains/admins keep write access after a drive is concluded so results
  // can still be corrected; for a plain panelist a concluded drive is
  // read-only (enforced server-side too, not just here).
  const canEditConcluded = roleAtLeast(user!.role, "CAPTAIN");

  if (loading) return <div className="page-loading">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Panel Duty</span>
        <h1>My Drives</h1>
        <p>Colleges you're on the panel for — pick up scoring or review what you've submitted.</p>
      </div>
      {drives.length === 0 && <p className="muted">No drives assigned to you yet.</p>}
      <div className="drive-card-grid">
        {drives.map((d) => {
          const concluded = d.status === "FINALIZED";
          const readOnly = concluded && !canEditConcluded;
          return (
            <div key={d.id} className={`card drive-card ${concluded ? "drive-card-concluded" : ""}`}>
              <div className="drive-card-head">
                <div>
                  <h3>{d.college.name}</h3>
                  <p className="drive-card-sub">
                    {d.department.name} / {d.designation.name}
                  </p>
                </div>
                <span className={`status-pill status-${d.displayStatus.toLowerCase()}`}>
                  {d.displayStatus.replace(/_/g, " ")}
                </span>
              </div>

              <dl className="drive-card-meta">
                <dt>Panel</dt>
                <dd>{d.team.name}</dd>
                <dt>Captain</dt>
                <dd>{d.team.captain.name}</dd>
                <dt>Interview</dt>
                <dd>{d.piAt ? new Date(d.piAt).toLocaleString() : "To be scheduled"}</dd>
              </dl>

              {readOnly && (
                <p className="drive-card-note">This drive is concluded — your scores are read-only.</p>
              )}

              <div className="drive-card-actions">
                <Link to={`/my-drives/${d.id}/score`} className="btn-nav btn-nav-primary">
                  {readOnly ? "View scores" : "Score candidates"}
                </Link>
                <Link to={`/my-drives/${d.id}/summary`} className="btn-nav">
                  Summary
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
