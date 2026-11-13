import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ReportMissing from "./pages/ReportMissing.jsx";
import CaseDetail from "./pages/CaseDetail.jsx";
import MatchDetail from "./pages/MatchDetail.jsx";
import Notifications from "./pages/Notifications.jsx";
import Profile from "./pages/Profile.jsx";
import { getToken } from "./api.js";

const Private = ({ children }) => (getToken() ? children : <Navigate to="/login" replace />);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Private><Dashboard /></Private>} />
      <Route path="/report" element={<Private><ReportMissing /></Private>} />
      <Route path="/cases/:id" element={<Private><CaseDetail /></Private>} />
      <Route path="/matches/:id" element={<Private><MatchDetail /></Private>} />
      <Route path="/notifications" element={<Private><Notifications /></Private>} />
      <Route path="/profile" element={<Private><Profile /></Private>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
