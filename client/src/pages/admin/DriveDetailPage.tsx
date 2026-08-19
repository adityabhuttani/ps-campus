import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, API_URL, ApiError } from "../../lib/api";
import { useAuth } from "../../auth/AuthContext";
import { useDriveRoom } from "../../lib/useDriveRoom";
import { Candidate, Drive, DriveBoard, FinalStatus } from "../../lib/types";

type Tab = "overview" | "candidates" | "live" | "roundtable";

export function DriveDetailPage() {
  const { driveId } = useParams<{ driveId: string }>();
  const [drive, setDrive] = useState<Drive | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const loadDrive = useCallback(() => {
    if (driveId) api.get<Drive>(`/drives/${driveId}`).then(setDrive);
  }, [driveId]);

  useEffect(loadDrive, [loadDrive]);

  if (!drive || !driveId) return <div className="page-loading">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Drive</span>
        <h1>
          {drive.college.name} — {drive.department.name} / {drive.designation.name}
        </h1>
      </div>
      <div className="tab-bar">
        {(["overview", "candidates", "live", "roundtable"] as Tab[]).map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "roundtable" ? "Round Table" : t === "live" ? "Summary" : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab drive={drive} onChange={loadDrive} />}
      {tab === "candidates" && <CandidatesTab drive={drive} />}
      {tab === "live" && <LiveDashboardTab driveId={driveId} />}
      {tab === "roundtable" && <RoundTableTab driveId={driveId} />}
    </div>
  );
}

function OverviewTab({ drive, onChange }: { drive: Drive; onChange: () => void }) {
  const [applicantCount, setApplicantCount] = useState(drive.applicantCount?.toString() ?? "");
  const [round1Count, setRound1Count] = useState(drive.round1Count?.toString() ?? "");
  const [concluding, setConcluding] = useState(false);
  const [error, setError] = useState("");

  async function saveFunnel() {
    setError("");
    try {
      await api.patch(`/drives/${drive.id}`, {
        applicantCount: applicantCount ? Number(applicantCount) : undefined,
        round1Count: round1Count ? Number(round1Count) : undefined,
      });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function conclude() {
    if (!window.confirm(`Conclude the ${drive.college.name} drive? This marks it as completed.`)) return;
    setConcluding(true);
    setError("");
    try {
      await api.post(`/candidate-status/drive/${drive.id}/finalize`);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setConcluding(false);
    }
  }

  return (
    <div>
      <div className="card">
        <dl className="detail-grid">
          <dt>Team</dt>
          <dd>
            {drive.team.name} (Captain: {drive.team.captain.name})
          </dd>
          <dt>PPT</dt>
          <dd>{drive.pptAt ? new Date(drive.pptAt).toLocaleString() : "—"}</dd>
          <dt>Online Assessment</dt>
          <dd>{drive.oaAt ? new Date(drive.oaAt).toLocaleString() : "—"}</dd>
          <dt>Interview</dt>
          <dd>{drive.piAt ? new Date(drive.piAt).toLocaleString() : "—"}</dd>
          <dt>Target count</dt>
          <dd>{drive.targetCount ?? "—"}</dd>
          <dt>Status</dt>
          <dd>
            <span className={`status-pill status-${drive.displayStatus.toLowerCase()}`}>{drive.displayStatus.replace(/_/g, " ")}</span>
          </dd>
        </dl>
      </div>

      <div className="card">
        <h3>Funnel</h3>
        <p className="muted">
          Applicants and Round 1 are entered manually — this tool only ever sees candidates once they're Round-2
          qualified. Round 2 and Selections are counted automatically from the candidates entered below.
        </p>
        <dl className="detail-grid">
          <dt>Round 2</dt>
          <dd>{drive.round2Count}</dd>
          <dt>Selections</dt>
          <dd>{drive.selectionsCount}</dd>
        </dl>
        <div className="inline-form">
          <label>
            # Applicants
            <input type="number" min={0} value={applicantCount} onChange={(e) => setApplicantCount(e.target.value)} />
          </label>
          <label>
            # Round 1
            <input type="number" min={0} value={round1Count} onChange={(e) => setRound1Count(e.target.value)} />
          </label>
          <button className="btn-primary" onClick={saveFunnel}>
            Save
          </button>
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <h3>{drive.status === "FINALIZED" ? "Drive concluded" : "Conclude this drive"}</h3>
        {drive.status === "FINALIZED" ? (
          <p className="muted">This drive is marked completed. Results are visible in Reports.</p>
        ) : (
          <>
            <p className="muted">
              Moves this drive from active to completed once the round table is done. You can still correct
              individual candidate statuses afterward from the Round Table tab.
            </p>
            <button className="btn-primary" disabled={concluding} onClick={conclude}>
              {concluding ? "Concluding…" : "Conclude drive"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface CandidateDraft {
  rollNumber: string;
  name: string;
  gender: string;
  course: string;
  cgpa: string;
  oaScore: string;
}

function emptyCandidateDraft(): CandidateDraft {
  return { rollNumber: "", name: "", gender: "", course: "", cgpa: "", oaScore: "" };
}

function candidateDraftFrom(c: Candidate): CandidateDraft {
  return {
    rollNumber: c.rollNumber,
    name: c.name,
    gender: c.gender ?? "",
    course: c.course ?? "",
    cgpa: c.cgpa != null ? String(c.cgpa) : "",
    oaScore: c.oaScore != null ? String(c.oaScore) : "",
  };
}

function candidateDraftToPayload(draft: CandidateDraft) {
  return {
    rollNumber: draft.rollNumber,
    name: draft.name,
    gender: draft.gender || undefined,
    course: draft.course || undefined,
    cgpa: draft.cgpa ? Number(draft.cgpa) : undefined,
    oaScore: draft.oaScore ? Number(draft.oaScore) : undefined,
  };
}

function CandidatesTab({ drive }: { drive: Drive }) {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CandidateDraft>(emptyCandidateDraft());
  const [newDraft, setNewDraft] = useState<CandidateDraft>(emptyCandidateDraft());

  // This page fetches a single drive by id, which does include the roster —
  // the fallback is only here because list responses omit it.
  const panelists = [drive.team.captain, ...(drive.team.members ?? []).map((m) => m.user)];

  const load = () => api.get<Candidate[]>(`/candidates?driveId=${drive.id}`).then(setCandidates);
  useEffect(() => {
    load();
  }, [drive.id]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    const form = new FormData();
    form.append("driveId", drive.id);
    form.append("file", file);
    try {
      const result = await api.post<{ created: number; skipped: number; errors: string[] }>("/candidates/import", form);
      setImportResult(
        `Imported ${result.created}, skipped ${result.skipped}.${result.errors.length ? " " + result.errors.slice(0, 3).join("; ") : ""}`
      );
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      e.target.value = "";
    }
  }

  async function assignPanelist(c: Candidate, panelistId: string) {
    setError("");
    try {
      await api.patch(`/candidates/${c.id}`, { assignedPanelistId: panelistId || null });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  function startEdit(c: Candidate) {
    setEditingId(c.id);
    setEditDraft(candidateDraftFrom(c));
    setError("");
  }

  async function saveEdit(id: string) {
    if (!editDraft.rollNumber || !editDraft.name) {
      setError("Roll Number and Name are required");
      return;
    }
    setError("");
    try {
      await api.patch(`/candidates/${id}`, candidateDraftToPayload(editDraft));
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function createCandidate() {
    if (!newDraft.rollNumber || !newDraft.name) {
      setError("Roll Number and Name are required");
      return;
    }
    setError("");
    try {
      await api.post("/candidates", { driveId: drive.id, ...candidateDraftToPayload(newDraft) });
      setNewDraft(emptyCandidateDraft());
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function remove(c: Candidate) {
    if (!window.confirm(`Delete ${c.name} (${c.rollNumber})? This also deletes their interview scores. This cannot be undone.`)) return;
    setError("");
    try {
      await api.delete(`/candidates/${c.id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function uploadFile(c: Candidate, kind: "cv" | "assessment-report", file: File) {
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post(`/candidates/${c.id}/${kind}`, form);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="card">
      <div className="inline-form">
        <label className="file-input-label">
          Import Round-2-qualified candidates (CSV)
          <input type="file" accept=".csv" onChange={handleImport} />
        </label>
      </div>
      {importResult && <div className="notice-text">{importResult}</div>}
      <p className="muted">Expected columns: rollNumber, name, gender, course, cgpa, oaScore</p>
      <p className="muted">
        Only candidates who've already cleared Round 1 and are qualified for the PI round belong here. Each is
        interviewed one-on-one by a single panelist — assign who that is before the PI round starts.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Roll No.</th>
              <th>Name</th>
              <th>Gender</th>
              <th>Course</th>
              <th>CGPA</th>
              <th>OA Score</th>
              <th>CV</th>
              <th>Assessment Report</th>
              <th>Interviewer</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) =>
              editingId === c.id ? (
                <tr key={c.id}>
                  <CandidateFieldCells draft={editDraft} onChange={(patch) => setEditDraft((prev) => ({ ...prev, ...patch }))} />
                  <td colSpan={2}></td>
                  <td>
                    <select value={c.assignedPanelistId ?? ""} onChange={(e) => assignPanelist(c, e.target.value)}>
                      <option value="">Unassigned</option>
                      {panelists.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="row-actions">
                    <button className="btn-outline" onClick={() => saveEdit(c.id)}>
                      Save
                    </button>
                    <button className="btn-outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>{c.rollNumber}</td>
                  <td>{c.name}</td>
                  <td>{c.gender ?? "—"}</td>
                  <td>{c.course ?? "—"}</td>
                  <td>{c.cgpa ?? "—"}</td>
                  <td>{c.oaScore ?? "—"}</td>
                  <td>
                    <FileCell url={c.cvUrl} onUpload={(f) => uploadFile(c, "cv", f)} />
                  </td>
                  <td>
                    <FileCell url={c.assessmentReportUrl} onUpload={(f) => uploadFile(c, "assessment-report", f)} />
                  </td>
                  <td>
                    <select value={c.assignedPanelistId ?? ""} onChange={(e) => assignPanelist(c, e.target.value)}>
                      <option value="">Unassigned</option>
                      {panelists.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="row-actions">
                    <button className="btn-outline" onClick={() => startEdit(c)}>
                      Edit
                    </button>
                    <button className="btn-outline" onClick={() => remove(c)}>
                      Delete
                    </button>
                  </td>
                </tr>
              )
            )}

            <tr className="new-row">
              <CandidateFieldCells draft={newDraft} onChange={(patch) => setNewDraft((prev) => ({ ...prev, ...patch }))} />
              <td colSpan={4}></td>
              <td className="row-actions">
                <button className="btn-primary" onClick={createCandidate}>
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

function CandidateFieldCells({
  draft,
  onChange,
}: {
  draft: CandidateDraft;
  onChange: (patch: Partial<CandidateDraft>) => void;
}) {
  return (
    <>
      <td>
        <input placeholder="Roll No." value={draft.rollNumber} onChange={(e) => onChange({ rollNumber: e.target.value })} />
      </td>
      <td>
        <input placeholder="Name" value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
      </td>
      <td>
        <input placeholder="Gender" value={draft.gender} onChange={(e) => onChange({ gender: e.target.value })} />
      </td>
      <td>
        <input placeholder="Course" value={draft.course} onChange={(e) => onChange({ course: e.target.value })} />
      </td>
      <td>
        <input type="number" step="0.01" placeholder="CGPA" value={draft.cgpa} onChange={(e) => onChange({ cgpa: e.target.value })} />
      </td>
      <td>
        <input type="number" step="0.01" placeholder="OA Score" value={draft.oaScore} onChange={(e) => onChange({ oaScore: e.target.value })} />
      </td>
    </>
  );
}

function FileCell({ url, onUpload }: { url?: string | null; onUpload: (file: File) => void }) {
  return (
    <div className="file-cell">
      {url && (
        <a href={`${API_URL}${url}`} target="_blank" rel="noreferrer">
          View
        </a>
      )}
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function LiveDashboardTab({ driveId }: { driveId: string }) {
  const [board, setBoard] = useState<DriveBoard | null>(null);

  const load = useCallback(() => {
    api.get<DriveBoard>(`/candidate-status/drive/${driveId}/board`).then(setBoard);
  }, [driveId]);

  useEffect(load, [load]);
  useDriveRoom(driveId, load);

  if (!board) return <div className="page-loading">Loading…</div>;

  // Every candidate entered in this drive is already Round-2/PI-qualified —
  // there's no separate shortlist filter to apply here anymore.
  const piCandidates = board.candidates;
  const totalCriteria = board.drive.designation.scoringTemplate!.criteria.length;

  function scoresFor(candidateId: string) {
    return board!.scores.filter((s) => s.candidateId === candidateId);
  }

  return (
    <div className="card">
      <p className="muted">
        Summary — each candidate is interviewed one-on-one by their assigned panelist; this updates automatically as
        they submit scores.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Interviewer</th>
              <th>Progress</th>
              <th>Consolidated</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {piCandidates.map((c) => {
              const done = scoresFor(c.id).length;
              const isDone = done >= totalCriteria && totalCriteria > 0;
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.assignedPanelist ? c.assignedPanelist.name : <span className="muted">Unassigned</span>}</td>
                  <td className={isDone ? "cell-done" : done > 0 ? "cell-partial" : "cell-pending"}>
                    {!c.assignedPanelist ? "—" : isDone ? "✓ Complete" : `${done}/${totalCriteria}`}
                  </td>
                  <td>{(board.consolidated[c.id] ?? 0).toFixed(2)}</td>
                  <td>{c.status?.status ?? "TBD"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STATUS_OPTIONS: FinalStatus[] = ["TBD", "SELECTED", "REJECTED"];

function RoundTableTab({ driveId }: { driveId: string }) {
  const [board, setBoard] = useState<DriveBoard | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<DriveBoard>(`/candidate-status/drive/${driveId}/board`).then(setBoard);
  }, [driveId]);

  useEffect(load, [load]);
  useDriveRoom(driveId, load);

  if (!board) return <div className="page-loading">Loading…</div>;

  const tbdCount = board.candidates.filter((c) => !c.status || c.status.status === "TBD").length;

  async function setStatus(candidateId: string, status: FinalStatus) {
    await api.put(`/candidate-status/candidate/${candidateId}`, { status });
    load();
  }

  async function finalize() {
    setFinalizing(true);
    try {
      await api.post(`/candidate-status/drive/${driveId}/finalize`);
      load();
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="card">
      <p className="muted">
        Every candidate this drive interviewed, with their interviewer's final remarks. Click a row to see the
        full per-criterion breakdown; use the dropdown to move a candidate between stages.
      </p>
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Candidate</th>
            <th>Interviewer</th>
            <th>Score</th>
            <th>Remarks</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {board.candidates.map((c) => {
            const scores = board.scores.filter((s) => s.candidateId === c.id);
            const isExpanded = expandedId === c.id;
            return (
              <Fragment key={c.id}>
                <tr
                  className="round-table-summary-row"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <td>
                    <strong>{c.name}</strong>
                    <div className="muted">{c.rollNumber}</div>
                  </td>
                  <td>{c.assignedPanelist ? c.assignedPanelist.name : <span className="muted">Unassigned</span>}</td>
                  <td>{(board.consolidated[c.id] ?? 0).toFixed(2)}</td>
                  <td className="remarks-cell">
                    {scores.filter((s) => s.remarks).length === 0 && <span className="muted">No remarks</span>}
                    {scores
                      .filter((s) => s.remarks)
                      .map((s) => (
                        <div key={s.id}>
                          <strong>{s.criterion.label}:</strong> {s.remarks}
                        </div>
                      ))}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select value={c.status?.status ?? "TBD"} onChange={(e) => setStatus(c.id, e.target.value as FinalStatus)}>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={5} className="round-table-detail-cell">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Criterion</th>
                            <th>Score</th>
                            <th>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scores.map((s) => (
                            <tr key={s.id}>
                              <td>{s.criterion.label}</td>
                              <td>{s.score}</td>
                              <td className="wrap">{s.remarks}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>

      {board.drive.status !== "FINALIZED" ? (
        <>
          <button className="btn-primary" disabled={tbdCount > 0 || finalizing} onClick={finalize}>
            {finalizing ? "Concluding…" : "Conclude drive"}
          </button>
          {tbdCount > 0 && <p className="muted">Resolve all {tbdCount} TBD candidate(s) above before concluding.</p>}
        </>
      ) : (
        <p className="notice-text">This drive is concluded.</p>
      )}
    </div>
  );
}
