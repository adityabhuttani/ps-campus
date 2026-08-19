import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, API_URL, ApiError } from "../../lib/api";
import { roleAtLeast, useAuth } from "../../auth/AuthContext";
import { formatScore, weightedScore } from "../../lib/score";
import { Candidate, CandidateStatus, Drive, FinalStatus, InterviewScore } from "../../lib/types";

// Debounces a field's autosave so every keystroke doesn't hit the API — fires
// once ~600ms after the user stops typing/adjusting a score or remark.
function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number) {
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => fn(...args), delay));
  };
}

const BACKGROUND_FIELDS: { key: keyof Candidate; label: string }[] = [
  { key: "hometown", label: "Hometown" },
  { key: "parentsOccupation", label: "Parents' Occupation" },
  { key: "higherEducationPlans", label: "Higher Education Plans" },
  { key: "holdingOffer", label: "Holding Offer" },
];

export function ScoringPage() {
  const { driveId } = useParams<{ driveId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [myDrives, setMyDrives] = useState<Drive[]>([]);
  const [drive, setDrive] = useState<Drive | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [myScores, setMyScores] = useState<InterviewScore[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Drive[]>("/drives/mine").then(setMyDrives);
  }, []);

  useEffect(() => {
    if (!driveId) return;
    setSelectedCandidateId(null);
    api.get<Drive>(`/drives/${driveId}`).then(setDrive);
    api.get<Candidate[]>(`/candidates?driveId=${driveId}`).then((cs) => {
      // Each candidate is interviewed one-on-one by a single assigned panelist,
      // not the whole panel jointly — a panelist only ever sees their own queue.
      // Every candidate entered in a drive is already Round-2/PI-qualified, so
      // there's no further shortlist filter to apply here.
      const myList = cs.filter((c) => c.assignedPanelistId === user!.id);
      setCandidates(myList);
      if (myList.length) setSelectedCandidateId(myList[0].id);
    });
    api.get<InterviewScore[]>(`/interview-scores?driveId=${driveId}`).then((scores) =>
      setMyScores(scores.filter((s) => s.panelistId === user!.id))
    );
  }, [driveId, user]);

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId);

  const scoresForSelected = useMemo(
    () => myScores.filter((s) => s.candidateId === selectedCandidateId),
    [myScores, selectedCandidateId]
  );

  const criteria = drive?.designation.scoringTemplate?.criteria ?? [];
  const finalScore = weightedScore(criteria, scoresForSelected);
  const allScored = criteria.length > 0 && scoresForSelected.length === criteria.length;

  // A concluded drive is read-only for panelists — the server refuses these
  // writes too, so this is about not offering an action that would fail
  // rather than being the protection itself.
  const readOnly = drive?.status === "FINALIZED" && !roleAtLeast(user!.role, "CAPTAIN");

  const saveScore = useDebouncedCallback(
    async (candidateId: string, criterionId: string, score: number, remarks: string) => {
      const saved = await api.put<InterviewScore>("/interview-scores", { candidateId, criterionId, score, remarks });
      setMyScores((prev) => [...prev.filter((s) => s.criterionId !== criterionId || s.candidateId !== candidateId), saved]);
      setSavedAt((prev) => ({ ...prev, [criterionId]: Date.now() }));
    },
    500
  );

  async function saveBackgroundField(candidateId: string, field: string, value: string) {
    const updated = await api.patch<Candidate>(`/candidates/${candidateId}`, { [field]: value });
    setCandidates((prev) => prev.map((c) => (c.id === candidateId ? updated : c)));
  }

  async function saveFinalCall(candidateId: string, status: FinalStatus, roundTableNotes: string) {
    const updated = await api.put<CandidateStatus>(`/candidate-status/candidate/${candidateId}`, {
      status,
      roundTableNotes,
    });
    setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, status: updated } : c)));
  }

  async function submitEvaluation(candidateId: string) {
    setError("");
    try {
      const updated = await api.post<CandidateStatus>(`/candidate-status/candidate/${candidateId}/submit`);
      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, status: updated } : c)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  if (!drive) return <div className="page-loading">Loading…</div>;

  return (
    <div className="scoring-layout">
      <aside className="scoring-sidebar">
        <div className="sidebar-actions">
          <label>
            Drive
            <select value={driveId ?? ""} onChange={(e) => navigate(`/my-drives/${e.target.value}/score`)}>
              {myDrives.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.college.name} — {d.designation.name}
                </option>
              ))}
            </select>
          </label>
          {driveId && (
            <Link to={`/my-drives/${driveId}/summary`} className="btn-nav btn-nav-block">
              View drive summary
            </Link>
          )}
        </div>
        <h3 className="section-heading">Candidates</h3>
        <ul className="candidate-list">
          {candidates.map((c) => {
            const done = myScores.filter((s) => s.candidateId === c.id).length;
            const total = criteria.length;
            const submitted = !!c.status?.submittedAt;
            return (
              <li key={c.id}>
                <button
                  className={`candidate-list-item ${c.id === selectedCandidateId ? "active" : ""}`}
                  onClick={() => setSelectedCandidateId(c.id)}
                >
                  <span>{c.name}</span>
                  <span className={submitted ? "badge-done" : done >= total ? "badge-done" : "badge-pending"}>
                    {submitted ? "✓ Submitted" : `${done}/${total}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="scoring-main">
        {selectedCandidate ? (
          <div className="card">
            <div className="scoring-candidate-header">
              <h2>{selectedCandidate.name}</h2>
              <div className={`final-score-badge ${allScored ? "final-score-complete" : ""}`}>
                <span className="final-score-label">Final score</span>
                <span className="final-score-value">{formatScore(finalScore)}</span>
                <span className="final-score-sub">
                  {allScored ? "all criteria scored" : `${scoresForSelected.length} of ${criteria.length} scored`}
                </span>
              </div>
            </div>

            <dl className="detail-grid candidate-profile-grid">
              <dt>Roll Number</dt>
              <dd>{selectedCandidate.rollNumber}</dd>
              <dt>Gender</dt>
              <dd>{selectedCandidate.gender || "—"}</dd>
              <dt>Course</dt>
              <dd>{selectedCandidate.course || "—"}</dd>
              <dt>CGPA</dt>
              <dd>{selectedCandidate.cgpa ?? "—"}</dd>
              <dt>OA Score</dt>
              <dd>{selectedCandidate.oaScore ?? "—"}</dd>
              <dt>CV</dt>
              <dd>
                {selectedCandidate.cvUrl ? (
                  <a href={`${API_URL}${selectedCandidate.cvUrl}`} target="_blank" rel="noreferrer">
                    View CV
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Assessment Report</dt>
              <dd>
                {selectedCandidate.assessmentReportUrl ? (
                  <a href={`${API_URL}${selectedCandidate.assessmentReportUrl}`} target="_blank" rel="noreferrer">
                    View report
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </dl>

            {readOnly && (
              <p className="lock-banner">
                This drive has been concluded — your scores and remarks are read-only. Contact your panel captain
                if something needs correcting.
              </p>
            )}

            <h3>Background — fill in as you talk with the candidate</h3>
            <dl className="detail-grid candidate-profile-grid">
              {BACKGROUND_FIELDS.map((f) => (
                <BackgroundInput
                  key={`${selectedCandidate.id}-${f.key}`}
                  label={f.label}
                  initialValue={(selectedCandidate[f.key] as string) ?? ""}
                  disabled={readOnly}
                  onChange={(value) => saveBackgroundField(selectedCandidate.id, f.key, value)}
                />
              ))}
            </dl>

            {criteria.map((criterion) => {
              const existing = scoresForSelected.find((s) => s.criterionId === criterion.id);
              return (
                <CriterionInput
                  key={`${selectedCandidate.id}-${criterion.id}`}
                  label={criterion.label}
                  weight={criterion.weight}
                  initialScore={existing?.score ?? 0}
                  initialRemarks={existing?.remarks ?? ""}
                  disabled={readOnly}
                  onChange={(score, remarks) => saveScore(selectedCandidate.id, criterion.id, score, remarks)}
                  savedAt={savedAt[criterion.id]}
                />
              );
            })}

            <FinalCallBlock
              key={`${selectedCandidate.id}-final`}
              initialStatus={selectedCandidate.status?.status ?? "TBD"}
              initialNotes={selectedCandidate.status?.roundTableNotes ?? ""}
              disabled={readOnly}
              onChange={(status, notes) => saveFinalCall(selectedCandidate.id, status, notes)}
            />

            {error && <div className="error-text">{error}</div>}

            {!readOnly && (
              <div className="submit-row">
                <button className="btn-primary" onClick={() => submitEvaluation(selectedCandidate.id)}>
                  {selectedCandidate.status?.submittedAt ? "Re-submit evaluation" : "Submit evaluation"}
                </button>
                {selectedCandidate.status?.submittedAt ? (
                  <span className="muted">
                    Submitted {new Date(selectedCandidate.status.submittedAt).toLocaleString()}
                  </span>
                ) : (
                  <span className="muted">Scores save as you go — submit once you've finished this candidate.</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="muted">No candidates assigned to you yet — check with your panel captain.</p>
        )}
      </section>
    </div>
  );
}

function BackgroundInput({
  label,
  initialValue,
  disabled,
  onChange,
}: {
  label: string;
  initialValue: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  // Remounted per (candidate, field) pair via the parent's composite `key`,
  // so this initial state is always fresh for whichever candidate is selected.
  const [value, setValue] = useState(initialValue);
  const save = useDebouncedCallback(onChange, 600);

  return (
    <>
      <dt>{label}</dt>
      <dd>
        <input
          value={value}
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value);
            save(e.target.value);
          }}
        />
      </dd>
    </>
  );
}

function CriterionInput({
  label,
  weight,
  initialScore,
  initialRemarks,
  disabled,
  onChange,
  savedAt,
}: {
  label: string;
  weight: number;
  initialScore: number;
  initialRemarks: string;
  disabled?: boolean;
  onChange: (score: number, remarks: string) => void;
  savedAt?: number;
}) {
  // Remounted per (candidate, criterion) pair via the parent's composite `key`,
  // so this initial state is always fresh for whichever candidate is selected.
  const [score, setScore] = useState(initialScore);
  const [remarks, setRemarks] = useState(initialRemarks);

  return (
    <div className="criterion-block">
      <div className="criterion-header">
        <label>
          {label} <span className="criterion-weight">{Math.round(weight * 100)}%</span>
        </label>
        {savedAt && <span className="saved-indicator">Saved</span>}
      </div>
      <input
        type="number"
        min={1}
        max={5}
        step={0.1}
        placeholder="1-5"
        className="score-input"
        value={score || ""}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          setScore(n);
          onChange(n, remarks);
        }}
      />
      <textarea
        placeholder="Remarks"
        value={remarks}
        disabled={disabled}
        onChange={(e) => {
          setRemarks(e.target.value);
          onChange(score, e.target.value);
        }}
      />
    </div>
  );
}

function FinalCallBlock({
  initialStatus,
  initialNotes,
  disabled,
  onChange,
}: {
  initialStatus: FinalStatus;
  initialNotes: string;
  disabled?: boolean;
  onChange: (status: FinalStatus, notes: string) => void;
}) {
  // Remounted per candidate via the parent's composite `key`, so this initial
  // state is always fresh for whichever candidate is selected.
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const saveNotes = useDebouncedCallback((n: string) => onChange(status, n), 600);

  return (
    <div className="criterion-block final-call-block">
      <div className="criterion-header">
        <label>Final Remarks</label>
      </div>
      <textarea
        placeholder="Overall assessment of this candidate…"
        value={notes}
        disabled={disabled}
        onChange={(e) => {
          setNotes(e.target.value);
          saveNotes(e.target.value);
        }}
      />
      <label className="final-status-label">
        Final call
        <select
          value={status}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value as FinalStatus;
            setStatus(next);
            onChange(next, notes);
          }}
        >
          <option value="TBD">TBD</option>
          <option value="SELECTED">Selected</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </label>
    </div>
  );
}
