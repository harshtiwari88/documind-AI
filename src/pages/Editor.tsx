import { useSearchParams } from "react-router-dom";
import Workspace from "../editor/Workspace";

export default function Editor() {
  const [params] = useSearchParams();
  // Pass the ?doc=ID from the URL so the document uploaded on the Home page actually loads
  return (
    <div className="h-full min-h-[calc(100vh-2rem)]">
      <Workspace docId={params.get("doc")} />
    </div>
  );
}
