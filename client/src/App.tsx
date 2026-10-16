import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { WelcomePage } from "./pages/WelcomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterStudentPage } from "./pages/RegisterStudentPage";
import { RegisterOrganizationPage } from "./pages/RegisterOrganizationPage";
import { SearchPage } from "./pages/SearchPage";
import { ActivityDetailPage } from "./pages/ActivityDetailPage";
import { MyPage } from "./pages/MyPage";
import { ReportPage } from "./pages/ReportPage";
import { OrgDashboardPage } from "./pages/OrgDashboardPage";
import { OrgActivityFormPage } from "./pages/OrgActivityFormPage";
import { OrgApplicantsPage } from "./pages/OrgApplicantsPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { CommunityListPage } from "./pages/CommunityListPage";
import { CommunityDetailPage } from "./pages/CommunityDetailPage";
import { CommunityCreatePage } from "./pages/CommunityCreatePage";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/welcome" replace />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register/student" element={<RegisterStudentPage />} />
        <Route path="/register/organization" element={<RegisterOrganizationPage />} />

        <Route path="/search" element={<SearchPage />} />
        <Route path="/activities/:id" element={<ActivityDetailPage />} />
        <Route path="/report" element={<ReportPage />} />

        <Route path="/communities" element={<CommunityListPage />} />
        <Route path="/communities/:id" element={<CommunityDetailPage />} />
        <Route
          path="/communities/new"
          element={
            <ProtectedRoute roles={["STUDENT"]}>
              <CommunityCreatePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/mypage"
          element={
            <ProtectedRoute roles={["STUDENT"]}>
              <MyPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/org"
          element={
            <ProtectedRoute roles={["ORG_ADMIN"]}>
              <OrgDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/org/activities/new"
          element={
            <ProtectedRoute roles={["ORG_ADMIN"]}>
              <OrgActivityFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/org/activities/:id/edit"
          element={
            <ProtectedRoute roles={["ORG_ADMIN"]}>
              <OrgActivityFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/org/activities/:activityId/applicants"
          element={
            <ProtectedRoute roles={["ORG_ADMIN"]}>
              <OrgApplicantsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["OPERATOR"]}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
