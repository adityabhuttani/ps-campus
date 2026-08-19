import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { roleAtLeast } from "../../auth/AuthContext";
import { initials } from "../../lib/initials";
import { STAFF_DESIGNATIONS } from "../../lib/staffDesignations";
import { AppUser, HiringCycle, Team } from "../../lib/types";

interface DraftPanel {
  tempId: string;
  name: string;
  size: number;
}

const PANEL_SIZES = [3, 4, 5];

function isCaptainEligible(u: AppUser): boolean {
  return roleAtLeast(u.role, "CAPTAIN");
}

function designationLabel(u: AppUser): string {
  return STAFF_DESIGNATIONS.find((d) => d.value === u.designation)?.label ?? "—";
}

export function TeamsPage() {
  const [cycles, setCycles] = useState<HiringCycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [drafts, setDrafts] = useState<DraftPanel[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<HiringCycle[]>("/meta/cycles").then((c) => {
      setCycles(c);
      if (c.length) setCycleId(c[0].id);
    });
    api.get<AppUser[]>("/users").then(setUsers);
  }, []);

  const loadTeams = (cid: string) => api.get<Team[]>(`/teams?cycleId=${cid}`).then(setTeams);

  // A brand-new cycle starts with six blank panels to fill in — matches how
  // this campus year's teams were actually planned. An already-populated
  // cycle just shows what exists; add more with "+ Add panel".
  useEffect(() => {
    if (!cycleId) return;
    setDrafts([]);
    api.get<Team[]>(`/teams?cycleId=${cycleId}`).then((t) => {
      setTeams(t);
      if (t.length === 0) {
        setDrafts(Array.from({ length: 6 }, (_, i) => ({ tempId: `draft-${i}`, name: `Panel ${i + 1}`, size: 4 })));
      }
    });
  }, [cycleId]);

  const availablePanels = teams.filter((t) => t.isComplete);
  const buildingPanels = teams.filter((t) => !t.isComplete);

  // Which team (if any) each user already sits on this cycle — a person can
  // only be captain or panelist of one panel at a time, so every
  // select/checklist below excludes people already placed elsewhere.
  const assignedTeamId = new Map<string, string>();
  for (const t of teams) {
    assignedTeamId.set(t.captainId, t.id);
    for (const m of t.members) assignedTeamId.set(m.userId, t.id);
  }
  const roster = users.filter((u) => !assignedTeamId.has(u.id));

  function availableFor(teamId: string | null): AppUser[] {
    return users.filter((u) => !assignedTeamId.has(u.id) || assignedTeamId.get(u.id) === teamId);
  }
  function captainOptionsFor(teamId: string | null): AppUser[] {
    return availableFor(teamId).filter(isCaptainEligible);
  }
  function panelistOptionsFor(t: Team): AppUser[] {
    return availableFor(t.id).filter((u) => u.id !== t.captainId && !t.members.some((m) => m.userId === u.id));
  }

  async function setCaptain(team: Team | null, draft: DraftPanel | null, userId: string) {
    if (!userId) return;
    setError(null);
    try {
      if (draft) {
        await api.post("/teams", { cycleId, name: draft.name, captainId: userId, size: draft.size, memberIds: [] });
        setDrafts((prev) => prev.filter((d) => d.tempId !== draft.tempId));
      } else if (team) {
        await api.patch(`/teams/${team.id}`, { captainId: userId });
      }
      loadTeams(cycleId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function togglePanelist(team: Team, userId: string, add: boolean) {
    setError(null);
    const current = new Set(team.members.map((m) => m.userId));
    if (add === current.has(userId)) return;
    if (add) current.add(userId);
    else current.delete(userId);
    try {
      await api.patch(`/teams/${team.id}`, { memberIds: [...current] });
      loadTeams(cycleId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function changeSize(team: Team, size: number) {
    setError(null);
    if (size - 1 < team.members.length) {
      const toDrop = team.members.length - (size - 1);
      if (
        !window.confirm(
          `Shrinking to ${size} means removing ${toDrop} panelist(s) from the end of the list. Continue?`
        )
      ) {
        return;
      }
      const keep = team.members.slice(0, size - 1).map((m) => m.userId);
      await api.patch(`/teams/${team.id}`, { size, memberIds: keep });
    } else {
      await api.patch(`/teams/${team.id}`, { size });
    }
    loadTeams(cycleId);
  }

  async function renameTeam(team: Team, newName: string) {
    if (!newName || newName === team.name) return;
    await api.patch(`/teams/${team.id}`, { name: newName });
    loadTeams(cycleId);
  }

  function renameDraft(tempId: string, newName: string) {
    setDrafts((prev) => prev.map((d) => (d.tempId === tempId ? { ...d, name: newName } : d)));
  }

  function resizeDraft(tempId: string, size: number) {
    setDrafts((prev) => prev.map((d) => (d.tempId === tempId ? { ...d, size } : d)));
  }

  function addDraftPanel() {
    const n = teams.length + drafts.length + 1;
    setDrafts((prev) => [...prev, { tempId: `draft-${Date.now()}`, name: `Panel ${n}`, size: 4 }]);
  }

  function removeDraftPanel(tempId: string) {
    setDrafts((prev) => prev.filter((d) => d.tempId !== tempId));
  }

  async function deleteTeam(t: Team) {
    setError(null);
    if (!window.confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/teams/${t.id}`);
      loadTeams(cycleId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function setComplete(team: Team, isComplete: boolean) {
    await api.patch(`/teams/${team.id}`, { isComplete });
    loadTeams(cycleId);
  }

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Administration</span>
        <h1>Teams</h1>
        <p>Build out each panel, then submit it to move it into Available Panels.</p>
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
      {error && <div className="error-text">{error}</div>}

      <h3 className="section-heading">Available panels ({availablePanels.length})</h3>
      {availablePanels.length === 0 ? (
        <p className="muted">No panels submitted yet — build one below and hit "Submit panel."</p>
      ) : (
        <div className="panels-grid completed-grid">
          {availablePanels.map((t, i) => (
            <div key={t.id} className="panel-card panel-card-complete">
              <span className="eyebrow">Panel {String(i + 1).padStart(2, "0")} · Complete</span>
              <h3 className="panel-title">{t.name}</h3>
              <p className="muted">
                {t.size} people · 1 captain + {t.members.length} panelist{t.members.length === 1 ? "" : "s"}
              </p>

              <div className="summary-row">
                <span className="avatar-chip avatar-captain">{initials(t.captain.name)}</span>
                <span className="summary-name">
                  {t.captain.name}
                  <span className="summary-sub">{designationLabel(t.captain)}</span>
                </span>
                <span className="summary-tag">Captain</span>
              </div>
              {t.members.map((m) => (
                <div key={m.userId} className="summary-row">
                  <span className="avatar-chip avatar-member">{initials(m.user.name)}</span>
                  <span className="summary-name">
                    {m.user.name}
                    <span className="summary-sub">{designationLabel(m.user)}</span>
                  </span>
                </div>
              ))}

              <div className="panel-card-footer">
                <button className="btn-outline" onClick={() => setComplete(t, false)}>
                  Edit panel
                </button>
                <button className="btn-outline" onClick={() => deleteTeam(t)}>
                  Delete panel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="section-heading">Still building</h3>
      <div className="teams-board">
        <aside className="roster-panel">
          <h3>Unassigned ({roster.length})</h3>
          <div className="roster-list">
            {roster.map((u) => (
              <div key={u.id} className="roster-chip">
                <span className={`avatar-chip ${isCaptainEligible(u) ? "avatar-captain" : "avatar-member"}`}>
                  {initials(u.name)}
                </span>
                <span className="roster-chip-info">
                  <span className="roster-chip-name">{u.name}</span>
                  <span className="roster-chip-role">{designationLabel(u)}</span>
                </span>
              </div>
            ))}
            {roster.length === 0 && <p className="muted">Everyone's assigned to a panel.</p>}
          </div>
        </aside>

        <section className="panels-grid">
          {buildingPanels.map((t, i) => {
            const remaining = t.size - 1 - t.members.length;
            const options = panelistOptionsFor(t);
            return (
              <div key={t.id} className="panel-card">
                <span className="eyebrow">Panel {String(availablePanels.length + i + 1).padStart(2, "0")}</span>
                <input className="panel-name-input" defaultValue={t.name} onBlur={(e) => renameTeam(t, e.target.value)} />

                <label className="panel-field">
                  <span className="panel-field-label">Panel size</span>
                  <select value={t.size} onChange={(e) => changeSize(t, Number(e.target.value))}>
                    {PANEL_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s} people
                      </option>
                    ))}
                  </select>
                </label>

                <label className="panel-field">
                  <span className="panel-field-label">Captain</span>
                  <select value={t.captainId} onChange={(e) => setCaptain(t, null, e.target.value)}>
                    {captainOptionsFor(t.id).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="panel-field">
                  <span className="panel-field-label">
                    Panelists ({t.members.length} of {t.size - 1})
                  </span>
                  {t.members.map((m) => (
                    <div key={m.userId} className="person-row">
                      <span className="avatar-chip avatar-member">{initials(m.user.name)}</span>
                      <span className="person-row-name">
                        {m.user.name}
                        <span className="summary-sub">{designationLabel(m.user)}</span>
                      </span>
                      <button className="chip-remove" onClick={() => togglePanelist(t, m.userId, false)} aria-label="Remove">
                        ×
                      </button>
                    </div>
                  ))}

                  {remaining > 0 ? (
                    <select value="" onChange={(e) => e.target.value && togglePanelist(t, e.target.value, true)}>
                      <option value="">
                        + Add panelist ({remaining} slot{remaining === 1 ? "" : "s"} left)…
                      </option>
                      {options.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {designationLabel(u)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="muted">Panel is full.</p>
                  )}
                </div>

                <div className="panel-card-footer">
                  <button className="btn-primary btn-sm" disabled={remaining > 0} onClick={() => setComplete(t, true)}>
                    Submit panel
                  </button>
                  <button className="btn-outline" onClick={() => deleteTeam(t)}>
                    Delete panel
                  </button>
                </div>
                {remaining > 0 && <p className="muted">Fill {remaining} more slot{remaining === 1 ? "" : "s"} to submit.</p>}
              </div>
            );
          })}

          {drafts.map((d) => (
            <div key={d.tempId} className="panel-card panel-card-draft">
              <span className="eyebrow">New panel</span>
              <input className="panel-name-input" value={d.name} onChange={(e) => renameDraft(d.tempId, e.target.value)} />

              <label className="panel-field">
                <span className="panel-field-label">Panel size</span>
                <select value={d.size} onChange={(e) => resizeDraft(d.tempId, Number(e.target.value))}>
                  {PANEL_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s} people
                    </option>
                  ))}
                </select>
              </label>

              <label className="panel-field">
                <span className="panel-field-label">Captain</span>
                <select value="" onChange={(e) => setCaptain(null, d, e.target.value)}>
                  <option value="">Select captain…</option>
                  {captainOptionsFor(null).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">Assign a captain to unlock panelist selection.</p>

              <button className="btn-outline panel-delete" onClick={() => removeDraftPanel(d.tempId)}>
                Remove
              </button>
            </div>
          ))}

          <button className="add-panel-card" onClick={addDraftPanel}>
            + Add panel
          </button>
        </section>
      </div>
    </div>
  );
}
