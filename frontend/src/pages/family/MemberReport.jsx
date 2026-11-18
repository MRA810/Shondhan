import { useLocation } from "react-router-dom";
import { StartContent } from "../report/ReportStart.jsx";
import ReportWizard from "../report/ReportWizard.jsx";

// A logged-in family adds another report: same start page and steps, without the account part.
export default function MemberReport() {
  const { pathname } = useLocation();
  return pathname.endsWith("/steps") ? <ReportWizard /> : <StartContent to="/cases/new/steps?s=1" />;
}
