import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../auth/AuthContext";
import { formatScore, weightedScore } from "../../lib/score";
import { Candidate, Drive, InterviewScore } from "../../lib/types";

// A bird's-eye table of just this panelist's own candidates for one drive — an
// alternative to clicking through the Scoring page one candidate at a time.
// Deliberately scoped to their own assignments, matching the Scoring page
// (each candidate is interviewed by exactly one panelist).
export function SummaryPage() {
  const { driveId } = useParams<{ driveId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [myDrives, setMyDrives] = useState<Drive[]>([]);
  const [drive, setDrive] = useState<Drive | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [myScores, setMyScores] = useState<InterviewScore[]>([]);

  useEffect(() => {
    api.get<Drive[]>("/drives/mine").then(setMyDrives);
  }, []);

  useEffect(() => {
    if (!driveId) return;
    api.get<Drive>(`/drives/${driveId}`).then(setDrive);
    api.get<Candidate[]>(`/candidates?driveId=${driveId}`).then((cs) =>
      setCandidates(cs.filter((c) => c.assignedPanelistId === user!.id))
    );
    api.get<InterviewScore[]>(`/interview-scores?driveId=${driveId}`).then((scores) =>
      setMyScores(scores.filter((s) => s.panelistId === user!.id))
    );
  }, [driveId, user]);

  if (!drive) return <div className="page-loading">Loading…</div>;

  const criteria = drive.designation.scoringTemplate?.criteria ?? [];

  function scoresFor(candidateId: string) {
    return myScores.filter((s) => s.candidateId === candidateId);
  }

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Panel Duty</span>
        <h1>{drive.college.name} — My Candidates</h1>
        <p>Everyone assigned to you for this drive, with the scores you've given them.</p>
      </div>

      <div className="summary-toolbar">
        <label>
          Drive
          <select value={driveId ?? ""} onChange={(e) => navigate(`/my-drives/${e.target.value}/summary`)}>
            {myDrives.map((d) => (
              <option key={d.id} value={d.id}>
                {d.college.name} — {d.designation.name}
              </option>
            ))}
          </select>
        </label>
        {driveId && (
          <Link to={`/my-drives/${driveId}/score`} className="btn-nav">
            ← Back to scoring
          </Link>
        )}
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Roll No.</th>
              <th>Name</th>
              {criteria.map((c) => (
                <th key={c.id}>{c.label}</th>
              ))}
              <th>Final Score</th>
              <th>Final Remarks</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const scores = scoresFor(c.id);
              return (
                <tr key={c.id}>
                  <td>{c.rollNumber}</td>
                  <td>{c.name}</td>
                  {criteria.map((criterion) => {
                    const s = scores.find((x) => x.criterionId === criterion.id);
                    return <td key={criterion.id}>{s ? s.score : "—"}</td>;
                  })}
                  <td>
                    <strong>{scores.length ? formatScore(weightedScore(criteria, scores)) : "—"}</strong>
                  </td>
                  <td className="wrap">{c.status?.roundTableNotes || "—"}</td>
                  <td>{c.status?.status ?? "TBD"}</td>
                  <td>{c.status?.submittedAt ? "✓" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {candidates.length === 0 && <p className="muted">No candidates assigned to you yet.</p>}
    </div>
  );
}
