import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { SetupPage } from "./pages/admin/SetupPage";
import { TeamsPage } from "./pages/admin/TeamsPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { DrivesPage } from "./pages/admin/DrivesPage";
import { DriveDetailPage } from "./pages/admin/DriveDetailPage";
import { MyDrivesPage } from "./pages/panelist/MyDrivesPage";
import { ScoringPage } from "./pages/panelist/ScoringPage";
import { SummaryPage } from "./pages/panelist/SummaryPage";
import { MySummaryPage } from "./pages/panelist/MySummaryPage";
import { ReportsPage } from "./pages/ReportsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/my-drives" element={<MyDrivesPage />} />
          <Route path="/my-drives/:driveId/score" element={<ScoringPage />} />
          <Route path="/my-drives/:driveId/summary" element={<SummaryPage />} />
          <Route path="/my-summary" element={<MySummaryPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route element={<ProtectedRoute minRole="CAPTAIN" />}>
          <Route path="/drives" element={<DrivesPage />} />
          <Route path="/drives/:driveId" element={<DriveDetailPage />} />
        </Route>
        <Route element={<ProtectedRoute minRole="ADMIN" />}>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
