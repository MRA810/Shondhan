import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { getToken } from "./api.js";

const Private = ({ children }) => (getToken() ? children : <Navigate to="/login" replace />);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Private><Dashboard /></Private>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
