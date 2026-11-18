import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "./api.js";
import Layout, { HomeRedirect, RoleRoute } from "./components/Layout.jsx";
import { Session } from "./session.jsx";
import Login from "./pages/Login.jsx";
import Forgot from "./pages/Forgot.jsx";
import Welcome from "./pages/report/Welcome.jsx";
import Authority from "./pages/report/Authority.jsx";
import ReportStart from "./pages/report/ReportStart.jsx";
import GuestReport from "./pages/report/GuestReport.jsx";
import { ReportList, ReportView } from "./pages/reports/Reports.jsx";
import StaffSignup from "./pages/StaffSignup.jsx";
import Notifications from "./pages/Notifications.jsx";
import Profile from "./pages/Profile.jsx";
import NotFound from "./pages/NotFound.jsx";
import FamilyHome from "./pages/family/FamilyHome.jsx";
import MemberReport from "./pages/family/MemberReport.jsx";
import CaseView from "./pages/family/CaseView.jsx";
import MatchView from "./pages/family/MatchView.jsx";
import ReporterHome from "./pages/reporter/ReporterHome.jsx";
import RecordForm from "./pages/reporter/RecordForm.jsx";
import RecordView from "./pages/reporter/RecordView.jsx";
import OfficerQueue from "./pages/officer/OfficerQueue.jsx";
import OfficerMatch from "./pages/officer/OfficerMatch.jsx";
import { OfficerRecordList, OfficerRecordView } from "./pages/officer/OfficerLists.jsx";
import AdminHome from "./pages/admin/AdminHome.jsx";
import AdminUsers from "./pages/admin/AdminUsers.jsx";
import AuditLog from "./pages/admin/AuditLog.jsx";

const Private = ({ children }) => (getToken() ? <Session>{children}</Session> : <Navigate to="/" replace />);
const only = (roles, el) => <RoleRoute roles={roles}>{el}</RoleRoute>;
const FAMILY = ["family"], REPORTER = ["police", "medical"], OFFICER = ["officer", "admin"], ADMIN = ["admin"], AUDIT = ["auditor", "admin"];
const BROWSE = ["police", "officer", "admin"]; // every family report, with search and filters

export default function App() {
  return (
    <Routes>
      {/* new visitors: welcome -> start -> report steps -> own details + SMS code + password */}
      <Route path="/" element={<Welcome />} />
      <Route path="/authority" element={<Authority />} />
      <Route path="/report" element={<ReportStart />} />
      <Route path="/report/steps" element={<GuestReport />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/signup" element={<Navigate to="/report" replace />} />
      <Route path="/signup/staff" element={<StaffSignup />} />
      <Route element={<Private><Layout /></Private>}>
        <Route path="/home" element={<HomeRedirect />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />

        <Route path="/dashboard" element={only(FAMILY, <FamilyHome />)} />
        <Route path="/cases/new" element={only(FAMILY, <MemberReport />)} />
        <Route path="/cases/new/steps" element={only(FAMILY, <MemberReport />)} />
        <Route path="/cases/:id" element={only(FAMILY, <CaseView />)} />
        <Route path="/matches/:id" element={only(FAMILY, <MatchView />)} />

        <Route path="/reporter" element={only(REPORTER, <ReporterHome />)} />
        <Route path="/records/new" element={only(REPORTER, <RecordForm />)} />
        <Route path="/records/:id" element={only(REPORTER, <RecordView />)} />
        <Route path="/records/:id/edit" element={only(REPORTER, <RecordForm />)} />

        <Route path="/officer" element={only(OFFICER, <OfficerQueue />)} />
        <Route path="/officer/matches/:id" element={only(OFFICER, <OfficerMatch />)} />
        <Route path="/reports" element={only(BROWSE, <ReportList />)} />
        <Route path="/reports/:id" element={only(BROWSE, <ReportView />)} />
        <Route path="/officer/cases" element={<Navigate to="/reports" replace />} />
        <Route path="/officer/records" element={only(OFFICER, <OfficerRecordList />)} />
        <Route path="/officer/records/:id" element={only(OFFICER, <OfficerRecordView />)} />

        <Route path="/admin" element={only(ADMIN, <AdminHome />)} />
        <Route path="/admin/users" element={only(ADMIN, <AdminUsers />)} />
        <Route path="/audit" element={only(AUDIT, <AuditLog />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
