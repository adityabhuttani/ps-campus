import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { College, Department, Designation, HiringCycle, HiringTarget, ScoringTemplate } from "../../lib/types";

type Tab = "setup" | "criteria";

const TAB_LABELS: Record<Tab, string> = {
  setup: "Setup",
  criteria: "Evaluation Criteria",
};

export function SetupPage() {
  const [tab, setTab] = useState<Tab>("setup");

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Administration</span>
        <h1>Cycle Setup</h1>
        <p>Departments, designations, colleges, targets, and evaluation criteria for the hiring cycle.</p>
      </div>
      <div className="tab-bar">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === "setup" && <SetupOverview />}
      {tab === "criteria" && <EvaluationCriteriaTab />}
    </div>
  );
}

function SetupOverview() {
  return (
    <div>
      <h3 className="section-heading">Hiring cycles</h3>
      <CyclesTab />

      <h3 className="section-heading">Reference data</h3>
      <p className="muted">Departments, designations, and colleges — set once, rarely touched.</p>
      <div className="card-grid">
        <SimpleNameTab kind="departments" title="Departments" />
        <SimpleNameTab kind="designations" title="Designations" />
        <SimpleNameTab kind="colleges" title="Colleges" />
      </div>

      <h3 className="section-heading">Hiring targets</h3>
      <p className="muted">Headcount targets per department and designation, for the selected cycle.</p>
      <TargetsTab />
    </div>
  );
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

interface CycleDraft {
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

function CyclesTab() {
  const [cycles, setCycles] = useState<HiringCycle[]>([]);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CycleDraft>({ name: "", startDate: "", endDate: "", isActive: true });

  const load = () => api.get<HiringCycle[]>("/meta/cycles").then(setCycles);
  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!name || !startDate || !endDate) return;
    setError("");
    try {
      await api.post("/meta/cycles", { name, startDate, endDate });
      setName("");
      setStartDate("");
      setEndDate("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  function startEdit(c: HiringCycle) {
    setEditingId(c.id);
    setDraft({ name: c.name, startDate: toDateInput(c.startDate), endDate: toDateInput(c.endDate), isActive: c.isActive });
    setError("");
  }

  async function saveEdit(id: string) {
    setError("");
    try {
      await api.patch(`/meta/cycles/${id}`, draft);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function remove(c: HiringCycle) {
    if (!window.confirm(`Delete cycle "${c.name}"?`)) return;
    setError("");
    try {
      await api.delete(`/meta/cycles/${c.id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="card">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Start</th>
            <th>End</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((c) =>
            editingId === c.id ? (
              <tr key={c.id}>
                <td>
                  <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                </td>
                <td>
                  <input
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={draft.endDate}
                    onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                  />
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
                <td>{c.name}</td>
                <td>{new Date(c.startDate).toLocaleDateString()}</td>
                <td>{new Date(c.endDate).toLocaleDateString()}</td>
                <td>{c.isActive ? "Yes" : "No"}</td>
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
        </tbody>
      </table>
      {error && <div className="error-text">{error}</div>}
      <div className="inline-form">
        <input placeholder="e.g. 2026-27" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <button className="btn-primary" onClick={create}>
          Add cycle
        </button>
      </div>
    </div>
  );
}

function SimpleNameTab({ kind, title }: { kind: "departments" | "designations" | "colleges"; title: string }) {
  const [items, setItems] = useState<(Department | Designation | College)[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = () => api.get<(Department | Designation | College)[]>(`/meta/${kind}`).then(setItems);
  useEffect(() => {
    load();
  }, [kind]);

  async function create() {
    if (!name) return;
    setError("");
    try {
      await api.post(`/meta/${kind}`, { name });
      setName("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  function startEdit(item: Department | Designation | College) {
    setEditingId(item.id);
    setEditValue(item.name);
    setError("");
  }

  async function saveEdit(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    setError("");
    try {
      await api.patch(`/meta/${kind}/${id}`, { name: trimmed });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function remove(item: Department | Designation | College) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    setError("");
    try {
      await api.delete(`/meta/${kind}/${item.id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="card">
      <h3>{title}</h3>
      <ul className="plain-list">
        {items.map((i) =>
          editingId === i.id ? (
            <li key={i.id}>
              <input
                className="editable-row-input"
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => saveEdit(i.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(i.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
              />
            </li>
          ) : (
            <li key={i.id}>
              <span className="editable-row-name" onClick={() => startEdit(i)}>
                {i.name}
              </span>
              <button className="chip-remove" onClick={() => remove(i)} aria-label={`Delete ${i.name}`}>
                ×
              </button>
            </li>
          )
        )}
      </ul>
      {error && <div className="error-text">{error}</div>}
      <div className="inline-form">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary" onClick={create}>
          Add
        </button>
      </div>
    </div>
  );
}

function TargetsTab() {
  const [cycles, setCycles] = useState<HiringCycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [targets, setTargets] = useState<HiringTarget[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<HiringCycle[]>("/meta/cycles"),
      api.get<Department[]>("/meta/departments"),
      api.get<Designation[]>("/meta/designations"),
    ]).then(([c, d, des]) => {
      setCycles(c);
      setDepartments(d);
      setDesignations(des);
      if (c.length && !cycleId) setCycleId(c[0].id);
    });
  }, []);

  const cellKey = (deptId: string, desigId: string) => `${deptId}:${desigId}`;

  const loadTargets = (cid: string) =>
    api.get<HiringTarget[]>(`/targets?cycleId=${cid}`).then((t) => {
      setTargets(t);
      const nextDrafts: Record<string, number> = {};
      t.forEach((x) => {
        nextDrafts[cellKey(x.departmentId, x.designationId)] = x.targetCount;
      });
      setDrafts(nextDrafts);
      setDirty(new Set());
    });
  useEffect(() => {
    if (cycleId) loadTargets(cycleId);
  }, [cycleId]);

  function valueFor(deptId: string, desigId: string): number {
    return drafts[cellKey(deptId, desigId)] ?? 0;
  }

  function update(deptId: string, desigId: string, value: number) {
    const k = cellKey(deptId, desigId);
    setDrafts((prev) => ({ ...prev, [k]: value }));
    const original = targets.find((t) => t.departmentId === deptId && t.designationId === desigId)?.targetCount ?? 0;
    setDirty((prev) => {
      const next = new Set(prev);
      if (value === original) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await Promise.all(
        [...dirty].map((k) => {
          const [departmentId, designationId] = k.split(":");
          return api.put("/targets", { cycleId, departmentId, designationId, targetCount: drafts[k] });
        })
      );
      loadTargets(cycleId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
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
      <table className="data-table">
        <thead>
          <tr>
            <th>Department \ Designation</th>
            {designations.map((d) => (
              <th key={d.id}>{d.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {departments.map((dept) => (
            <tr key={dept.id}>
              <td>{dept.name}</td>
              {designations.map((desig) => {
                const k = cellKey(dept.id, desig.id);
                return (
                  <td key={desig.id}>
                    <input
                      type="number"
                      min={0}
                      className={`target-input ${dirty.has(k) ? "target-input-dirty" : ""}`}
                      value={valueFor(dept.id, desig.id)}
                      onChange={(e) => update(dept.id, desig.id, Number(e.target.value) || 0)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {error && <div className="error-text">{error}</div>}
      <div className="panel-card-footer">
        <button className="btn-primary btn-sm" disabled={dirty.size === 0 || saving} onClick={save}>
          {saving ? "Saving…" : dirty.size > 0 ? `Save changes (${dirty.size})` : "Save changes"}
        </button>
      </div>
    </div>
  );
}

interface CriterionDraft {
  key: string;
  label: string;
  weightPct: number;
}

let criterionKeySeq = 0;
function nextKey() {
  criterionKeySeq += 1;
  return `c${criterionKeySeq}`;
}

function toDrafts(criteria: ScoringTemplate["criteria"]): CriterionDraft[] {
  return criteria.map((c) => ({ key: nextKey(), label: c.label, weightPct: Math.round(c.weight * 1000) / 10 }));
}

function EvaluationCriteriaTab() {
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [templates, setTemplates] = useState<ScoringTemplate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CriterionDraft[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = () => {
    Promise.all([
      api.get<Designation[]>("/meta/designations"),
      api.get<ScoringTemplate[]>("/scoring-templates"),
    ]).then(([d, t]) => {
      setDesignations(d);
      setTemplates(t);
      const nextDrafts: Record<string, CriterionDraft[]> = {};
      d.forEach((desig) => {
        const template = t.find((tpl) => tpl.designationId === desig.id);
        nextDrafts[desig.id] = template ? toDrafts(template.criteria) : [];
      });
      setDrafts(nextDrafts);
    });
  };
  useEffect(load, []);

  function updateRow(designationId: string, key: string, patch: Partial<CriterionDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [designationId]: prev[designationId].map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));
  }

  function addRow(designationId: string) {
    setDrafts((prev) => ({
      ...prev,
      [designationId]: [...(prev[designationId] ?? []), { key: nextKey(), label: "", weightPct: 0 }],
    }));
  }

  function removeRow(designationId: string, key: string) {
    setDrafts((prev) => ({
      ...prev,
      [designationId]: prev[designationId].filter((row) => row.key !== key),
    }));
  }

  function totalFor(designationId: string): number {
    return (drafts[designationId] ?? []).reduce((sum, r) => sum + (Number(r.weightPct) || 0), 0);
  }

  function isValid(designationId: string): boolean {
    const rows = drafts[designationId] ?? [];
    if (rows.length === 0) return false;
    if (rows.some((r) => !r.label.trim() || !r.weightPct || r.weightPct <= 0)) return false;
    return Math.abs(totalFor(designationId) - 100) <= 0.5;
  }

  async function save(designation: Designation) {
    const rows = drafts[designation.id] ?? [];
    const criteria = rows.map((r) => ({ label: r.label.trim(), weight: r.weightPct / 100 }));
    const existing = templates.find((t) => t.designationId === designation.id);

    setSaving((prev) => ({ ...prev, [designation.id]: true }));
    setErrors((prev) => ({ ...prev, [designation.id]: "" }));
    try {
      if (existing) {
        await api.patch(`/scoring-templates/${existing.id}`, { criteria });
      } else {
        await api.post("/scoring-templates", { name: `${designation.name} rubric`, designationId: designation.id, criteria });
      }
      load();
    } catch (err) {
      setErrors((prev) => ({ ...prev, [designation.id]: err instanceof ApiError ? err.message : "Something went wrong" }));
    } finally {
      setSaving((prev) => ({ ...prev, [designation.id]: false }));
    }
  }

  return (
    <div className="card-grid criteria-grid">
      {designations.map((d) => {
        const rows = drafts[d.id] ?? [];
        const total = totalFor(d.id);
        const valid = isValid(d.id);
        return (
          <div key={d.id} className="card criteria-card">
            <div className="criteria-card-header">
              <h3>{d.name}</h3>
              <span className={`criteria-total ${valid ? "criteria-total-ok" : "criteria-total-warn"}`}>
                {Math.round(total)}%
              </span>
            </div>

            {rows.map((row) => (
              <div key={row.key} className="criteria-row">
                <input
                  className="criteria-label-input"
                  placeholder="Criterion label"
                  value={row.label}
                  onChange={(e) => updateRow(d.id, row.key, { label: e.target.value })}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="criteria-weight-input"
                  value={row.weightPct || ""}
                  onChange={(e) => updateRow(d.id, row.key, { weightPct: Number(e.target.value) || 0 })}
                />
                <span className="criteria-weight-suffix">%</span>
                <button className="chip-remove" onClick={() => removeRow(d.id, row.key)} aria-label="Remove criterion">
                  ×
                </button>
              </div>
            ))}
            {rows.length === 0 && <p className="muted">No criteria yet — add the first one below.</p>}

            <button className="btn-link" onClick={() => addRow(d.id)}>
              + Add criterion
            </button>

            {!valid && rows.length > 0 && (
              <p className="muted">
                {Math.abs(total - 100) <= 0.5
                  ? "Every criterion needs a label and a weight."
                  : total < 100
                    ? `Add ${Math.round(100 - total)}% more to reach 100%.`
                    : `Remove ${Math.round(total - 100)}% to reach 100%.`}
              </p>
            )}
            {errors[d.id] && <div className="error-text">{errors[d.id]}</div>}

            <div className="panel-card-footer">
              <button className="btn-primary btn-sm" disabled={!valid || saving[d.id]} onClick={() => save(d)}>
                {saving[d.id] ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
