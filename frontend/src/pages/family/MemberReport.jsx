import { useLocation } from "react-router-dom";
import { StartContent } from "../report/ReportStart.jsx";
import ReportWizard from "../report/ReportWizard.jsx";
import ArtBackdrop from "../../components/ArtBackdrop.jsx";

// A logged-in family adds another report: same start page and steps, without the account part.
export default function MemberReport() {
  const { pathname } = useLocation();
  return (
    <>
      <ArtBackdrop />
      <div className="artpage">
        {pathname.endsWith("/steps") ? <ReportWizard /> : <StartContent to="/cases/new/steps?s=1" />}
      </div>
    </>
  );
}
