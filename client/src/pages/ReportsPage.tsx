import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { HiringCycle } from "../lib/types";

interface DriveRow {
  driveId: string;
  college: string;
  department: string;
  designation: string;
  status: string;
  targetCount: number | null;
  applicants: number;
  round1: number;
  round2: number;
  selected: number;
  rejected: number;
  tbd: number;
}

interface SummaryRow {
  department: string;
  designation: string;
  target: number;
  hired: number;
}

export function ReportsPage() {
  const [cycles, setCycles] = useState<HiringCycle[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [rows, setRows] = useState<DriveRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);

  useEffect(() => {
    api.get<HiringCycle[]>("/meta/cycles").then((c) => {
      setCycles(c);
      if (c.length) setCycleId(c[0].id);
    });
  }, []);

  useEffect(() => {
    if (!cycleId) return;
    api.get<{ rows: DriveRow[]; summary: SummaryRow[] }>(`/reports/cycle/${cycleId}`).then((data) => {
      setRows(data.rows);
      setSummary(data.summary);
    });
  }, [cycleId]);

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Cycle Performance</span>
        <h1>Reports</h1>
        <p>Hiring funnel and target attainment across every drive in the cycle.</p>
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

      <div className="card">
        <h3>Target vs Hired</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Designation</th>
              <th>Target</th>
              <th>Hired</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s, i) => (
              <tr key={i}>
                <td>{s.department}</td>
                <td>{s.designation}</td>
                <td>{s.target}</td>
                <td>{s.hired}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Drive funnel</h3>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>College</th>
                <th>Dept / Designation</th>
                <th>Status</th>
                <th>Target</th>
                <th>Applicants</th>
                <th>Round 1</th>
                <th>Round 2</th>
                <th>Selected</th>
                <th>Rejected</th>
                <th>TBD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.driveId}>
                  <td>{r.college}</td>
                  <td>
                    {r.department} / {r.designation}
                  </td>
                  <td>{r.status.replace(/_/g, " ")}</td>
                  <td>{r.targetCount ?? "—"}</td>
                  <td>{r.applicants}</td>
                  <td>{r.round1}</td>
                  <td>{r.round2}</td>
                  <td>{r.selected}</td>
                  <td>{r.rejected}</td>
                  <td>{r.tbd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
