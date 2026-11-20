import { Navigate } from "react-router-dom";
import { getToken } from "../../api.js";
import { Toggles } from "../../components/ui.jsx";
import ReportWizard from "./ReportWizard.jsx";
import ArtBackdrop from "../../components/ArtBackdrop.jsx";

// Steps 3 and 4 for a new visitor: the report, then their own details, SMS code and password.
export default function GuestReport() {
  if (getToken()) return <Navigate to="/cases/new" replace />;
  return (
    <>
      <ArtBackdrop />
      <div className="page artpage">
        <Toggles />
        <main className="guestmain"><ReportWizard guest /></main>
      </div>
    </>
  );
}
