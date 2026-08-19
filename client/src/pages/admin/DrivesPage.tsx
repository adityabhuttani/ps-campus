import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { roleAtLeast, useAuth } from "../../auth/AuthContext";
import { College, Department, Designation, Drive, HiringCycle, Team } from "../../lib/types";

interface DriveDraft {
  collegeId: string;
  departmentId: string;
  designationId: string;
  teamId: string;
  pptAt: string;
  oaAt: string;
  piAt: string;
  targetCount: string;
}

function emptyDraft(): DriveDraft {
  return {
    collegeId: "",
    departmentId: "",
    designationId: "",
    teamId: "",
    pptAt: "",
    oaAt: "",
    piAt: "",
    targetCount: "",
  };
}

// "2026-07-01T09:00:00.000Z" -> "2026-07-01T09:00", what <input type="datetime-local"> expects.
function toDatetimeLocal(iso?: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

function draftFrom(d: Drive): DriveDraft {
  return {
    collegeId: d.collegeId,
    departmentId: d.departmentId,
    designationId: d.designationId,
    teamId: d.teamId,
    pptAt: toDatetimeLocal(d.pptAt),
    oaAt: toDatetimeLocal(d.oaAt),
    piAt: toDatetimeLocal(d.piAt),
    targetCount: d.targetCount != null ? String(d.targetCount) : "",
  };
}

function draftToPayload(cycleId: string, draft: DriveDraft) {
  return {
    cycleId,
    collegeId: draft.collegeId,
    departmentId: draft.departmentId,
    designationId: draft.designationId,
    teamId: draft.teamId,
    pptAt: draft.pptAt || undefined,
    oaAt: draft.oaAt || undefined,
    piAt: draft.piAt || undefined,
    targetCount: draft.targetCount ? Number(draft.targetCount) : undefined,
  };
}

function isDraftComplete(draft: DriveDraft): boolean {
  return !!(draft.collegeId && draft.departmentId && draft.designationId && draft.teamId);
}

export function DrivesPage() {
  const { user } = useAuth();
  const isAdmin = roleAtLeast(user!.role, "ADMIN");
  const navigate = useNavigate();

  const [cycles, setCycles] = useState<HiringCycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [drives, setDrives] = useState<Drive[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DriveDraft>(emptyDraft());
  const [newDraft, setNewDraft] = useState<DriveDraft>(emptyDraft());

  useEffect(() => {
    Promise.all([
      api.get<HiringCycle[]>("/meta/cycles"),
      api.get<College[]>("/meta/colleges"),
      api.get<Department[]>("/meta/departments"),
      api.get<Designation[]>("/meta/designations"),
    ]).then(([c, col, dep, des]) => {
      setCycles(c);
      setColleges(col);
      setDepartments(dep);
      setDesignations(des);
      if (c.length) setCycleId(c[0].id);
    });
  }, []);

  const loadDrives = (cid: string) => api.get<Drive[]>(`/drives?cycleId=${cid}`).then(setDrives);
  useEffect(() => {
    if (cycleId) {
      loadDrives(cycleId);
      api.get<Team[]>(`/teams?cycleId=${cycleId}`).then(setTeams);
    }
  }, [cycleId]);

  const completeTeams = teams.filter((t) => t.isComplete);

  function startEdit(d: Drive) {
    setEditingId(d.id);
    setEditDraft(draftFrom(d));
    setError("");
  }

  async function saveEdit(id: string) {
    if (!isDraftComplete(editDraft)) {
      setError("College, Department, Designation, and Team are all required");
      return;
    }
    setError("");
    try {
      await api.patch(`/drives/${id}`, draftToPayload(cycleId, editDraft));
      setEditingId(null);
      loadDrives(cycleId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function createDrive() {
    if (!isDraftComplete(newDraft)) {
      setError("College, Department, Designation, and Team are all required");
      return;
    }
    setError("");
    try {
      await api.post("/drives", draftToPayload(cycleId, newDraft));
      setNewDraft(emptyDraft());
      loadDrives(cycleId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function remove(d: Drive) {
    if (!window.confirm(`Delete the ${d.college.name} drive? This also deletes its candidates and all scores. This cannot be undone.`)) return;
    setError("");
    try {
      await api.delete(`/drives/${d.id}`);
      loadDrives(cycleId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Campus Pipeline</span>
        <h1>Drives</h1>
        <p>Every college drive in this cycle — PPT through final results.</p>
      </div>
      <label>
        Cycle
        <select value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <h3 className="section-heading">Current drives</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>College</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Team</th>
              <th>PPT</th>
              <th>OA</th>
              <th>PI</th>
              <th>Target</th>
              <th>Status</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {drives.map((d) =>
              editingId === d.id ? (
                <tr key={d.id}>
                  <DriveFieldCells
                    draft={editDraft}
                    onChange={(patch) => setEditDraft((prev) => ({ ...prev, ...patch }))}
                    colleges={colleges}
                    departments={departments}
                    designations={designations}
                    teams={completeTeams}
                  />
                  <td>
                    <span className={`status-pill status-${d.displayStatus.toLowerCase()}`}>{d.displayStatus.replace(/_/g, " ")}</span>
                  </td>
                  <td className="row-actions">
                    <button className="btn-outline" onClick={() => saveEdit(d.id)}>
                      Save
                    </button>
                    <button className="btn-outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={d.id}>
                  <td>{d.college.name}</td>
                  <td>{d.department.name}</td>
                  <td>{d.designation.name}</td>
                  <td>{d.team.name}</td>
                  <td>{d.pptAt ? new Date(d.pptAt).toLocaleString() : "—"}</td>
                  <td>{d.oaAt ? new Date(d.oaAt).toLocaleString() : "—"}</td>
                  <td>{d.piAt ? new Date(d.piAt).toLocaleString() : "—"}</td>
                  <td>{d.targetCount ?? "—"}</td>
                  <td>
                    <span className={`status-pill status-${d.displayStatus.toLowerCase()}`}>{d.displayStatus.replace(/_/g, " ")}</span>
                  </td>
                  {isAdmin && (
                    <td className="row-actions">
                      <button className="btn-outline" onClick={() => navigate(`/drives/${d.id}`)}>
                        Open
                      </button>
                      <button className="btn-outline" onClick={() => startEdit(d)}>
                        Edit
                      </button>
                      <button className="btn-outline" onClick={() => remove(d)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              )
            )}

            {isAdmin && (
              <tr className="new-row">
                <DriveFieldCells
                  draft={newDraft}
                  onChange={(patch) => setNewDraft((prev) => ({ ...prev, ...patch }))}
                  colleges={colleges}
                  departments={departments}
                  designations={designations}
                  teams={completeTeams}
                />
                <td></td>
                <td className="row-actions">
                  <button className="btn-primary" onClick={createDrive}>
                    Add
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

function DriveFieldCells({
  draft,
  onChange,
  colleges,
  departments,
  designations,
  teams,
}: {
  draft: DriveDraft;
  onChange: (patch: Partial<DriveDraft>) => void;
  colleges: College[];
  departments: Department[];
  designations: Designation[];
  teams: Team[];
}) {
  return (
    <>
      <td>
        <select value={draft.collegeId} onChange={(e) => onChange({ collegeId: e.target.value })}>
          <option value="">College…</option>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={draft.departmentId} onChange={(e) => onChange({ departmentId: e.target.value })}>
          <option value="">Department…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={draft.designationId} onChange={(e) => onChange({ designationId: e.target.value })}>
          <option value="">Designation…</option>
          {designations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={draft.teamId} onChange={(e) => onChange({ teamId: e.target.value })}>
          <option value="">Team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input type="datetime-local" value={draft.pptAt} onChange={(e) => onChange({ pptAt: e.target.value })} />
      </td>
      <td>
        <input type="datetime-local" value={draft.oaAt} onChange={(e) => onChange({ oaAt: e.target.value })} />
      </td>
      <td>
        <input type="datetime-local" value={draft.piAt} onChange={(e) => onChange({ piAt: e.target.value })} />
      </td>
      <td>
        <input
          type="number"
          min={0}
          placeholder="Target"
          value={draft.targetCount}
          onChange={(e) => onChange({ targetCount: e.target.value })}
        />
      </td>
    </>
  );
}
