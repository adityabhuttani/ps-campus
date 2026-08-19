import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { formatScore } from "../../lib/score";
import { MyCandidate } from "../../lib/types";

// Every candidate this panelist has interviewed, across every college and
// drive in the cycle — their own record of the season, rather than a
// per-drive view. Backed by GET /candidates/mine, which already scopes to
// the caller's own assignments and computes each final score server-side.
export function MySummaryPage() {
  const [candidates, setCandidates] = useState<MyCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<MyCandidate[]>("/candidates/mine")
      .then(setCandidates)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading…</div>;

  const selected = candidates.filter((c) => c.status?.status === "SELECTED").length;
  const rejected = candidates.filter((c) => c.status?.status === "REJECTED").length;
  const tbd = candidates.filter((c) => !c.status || c.status.status === "TBD").length;
  const submitted = candidates.filter((c) => c.status?.submittedAt).length;

  const scored = candidates.filter((c) => c.interviewScores.length > 0);
  const avgScore = scored.length ? scored.reduce((sum, c) => sum + c.finalScore, 0) / scored.length : 0;

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Panel Duty</span>
        <h1>My Summary</h1>
        <p>Every candidate you've interviewed this cycle, across all colleges.</p>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-value">{candidates.length}</span>
          <span className="stat-label">Assigned</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{submitted}</span>
          <span className="stat-label">Submitted</span>
        </div>
        <div className="stat-card">
          <span className="stat-value stat-value-good">{selected}</span>
          <span className="stat-label">Selected</span>
        </div>
        <div className="stat-card">
          <span className="stat-value stat-value-bad">{rejected}</span>
          <span className="stat-label">Rejected</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{tbd}</span>
          <span className="stat-label">Still TBD</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{scored.length ? formatScore(avgScore) : "—"}</span>
          <span className="stat-label">Avg. score given</span>
        </div>
      </div>

      {candidates.length === 0 ? (
        <p className="muted">You haven't been assigned any candidates yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>College</th>
                <th>Designation</th>
                <th>Roll No.</th>
                <th>Name</th>
                <th>Final Score</th>
                <th>Final Remarks</th>
                <th>Status</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id}>
                  <td>{c.drive.college.name}</td>
                  <td>{c.drive.designation.name}</td>
                  <td>{c.rollNumber}</td>
                  <td>{c.name}</td>
                  <td>
                    <strong>{c.interviewScores.length ? formatScore(c.finalScore) : "—"}</strong>
                  </td>
                  <td className="wrap">{c.status?.roundTableNotes || "—"}</td>
                  <td>{c.status?.status ?? "TBD"}</td>
                  <td>{c.status?.submittedAt ? "✓" : "—"}</td>
                  <td>
                    <Link to={`/my-drives/${c.driveId}/score`} className="btn-link">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
