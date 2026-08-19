import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { AppUser, Department, StaffDesignation, UserRole } from "../../lib/types";
import { STAFF_DESIGNATIONS } from "../../lib/staffDesignations";

const ROLES: UserRole[] = ["PANELIST", "CAPTAIN", "ADMIN", "SUPER_ADMIN", "VIEWER"];

function designationLabel(value?: StaffDesignation | null): string {
  return STAFF_DESIGNATIONS.find((d) => d.value === value)?.label ?? "—";
}

export function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designation, setDesignation] = useState<StaffDesignation | "">("");
  const [role, setRole] = useState<UserRole>("PANELIST");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => api.get<AppUser[]>("/users").then(setUsers);
  useEffect(() => {
    load();
    api.get<Department[]>("/meta/departments").then(setDepartments);
  }, []);

  async function create() {
    setError(null);
    setNotice(null);
    if (!name || !email) return;
    try {
      const created = await api.post<{ name: string; tempPassword: string }>("/users", {
        name,
        email,
        role,
        departmentId: departmentId || undefined,
        designation: designation || undefined,
      });
      setNotice(
        `${created.name} created — temporary password: ${created.tempPassword}. Share this with them securely; it won't be shown again. Use "Reset" below if you'd rather set a specific password.`
      );
      setName("");
      setEmail("");
      setDepartmentId("");
      setDesignation("");
      setRole("PANELIST");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  // Merges the PATCH response into local state in place rather than
  // refetching the whole list — refetching would remount every row's inputs,
  // which drops a second field's edit if it blurs while the first field's
  // reload is still in flight.
  function applyUpdate(updated: AppUser) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  async function toggleActive(user: AppUser) {
    applyUpdate(await api.patch<AppUser>(`/users/${user.id}`, { active: !user.active }));
  }

  async function changeRole(user: AppUser, newRole: UserRole) {
    applyUpdate(await api.patch<AppUser>(`/users/${user.id}`, { role: newRole }));
  }

  async function deleteUser(user: AppUser) {
    setError(null);
    setNotice(null);
    if (!window.confirm(`Delete ${user.name}'s account? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  async function resetPassword(user: AppUser) {
    setError(null);
    setNotice(null);
    const custom = window.prompt(
      `Set a specific password for ${user.name} (8+ characters), or leave blank to auto-generate a random one:`
    );
    if (custom === null) return; // cancelled
    try {
      const { tempPassword } = await api.post<{ tempPassword: string }>(`/users/${user.id}/reset-password`, {
        password: custom || undefined,
      });
      setNotice(`New password for ${user.name}: ${tempPassword}. Their old password no longer works.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <div>
      <div className="page-header">
        <span className="eyebrow">Administration</span>
        <h1>Users</h1>
        <p>Provision panelist, captain, and admin accounts.</p>
      </div>
      <div className="card">
        <p className="muted">
          Passwords are never stored in plaintext or recoverable — only a bcrypt hash is kept. If someone loses
          their password, use "Reset" to issue a new one; there's no way to look up the old one. Department and
          designation are set once, at creation, in the row at the bottom of this table. Panel/captain is
          read-only here — assign it for the active cycle on the Teams page.
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Panel</th>
                <th>Role</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>
                    <span className="truncate" title={u.email}>
                      {u.email}
                    </span>
                  </td>
                  <td>{u.department?.name ?? "—"}</td>
                  <td>{designationLabel(u.designation)}</td>
                  <td>
                    {u.panel ? (
                      <span className="truncate" title={`${u.panel.teamName} · Captain: ${u.panel.captainName}`}>
                        {u.panel.teamName} · Capt. {u.panel.captainName}
                      </span>
                    ) : (
                      <span className="muted">Unassigned</span>
                    )}
                  </td>
                  <td>
                    <select value={u.role} onChange={(e) => changeRole(u, e.target.value as UserRole)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{u.active ? "Yes" : "No"}</td>
                  <td className="row-actions">
                    <button className="btn-outline" onClick={() => resetPassword(u)}>
                      Reset
                    </button>
                    <button className="btn-outline" onClick={() => toggleActive(u)}>
                      {u.active ? "Deactivate" : "Reactivate"}
                    </button>
                    <button className="btn-outline" onClick={() => deleteUser(u)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="new-row">
                <td>
                  <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                </td>
                <td>
                  <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </td>
                <td>
                  <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                    <option value="">—</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={designation} onChange={(e) => setDesignation(e.target.value as StaffDesignation)}>
                    <option value="">—</option>
                    {STAFF_DESIGNATIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="muted">—</td>
                <td>
                  <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="muted">—</td>
                <td>
                  <button className="btn-primary btn-sm" onClick={create}>
                    Add user
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {notice && <div className="notice-text">{notice}</div>}
        {error && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
}
