import { useSearchParams } from "react-router-dom";
import Workspace from "../editor/Workspace";

// Voice Studio now opens the same editor as /editor, with the voice assistant panel active.
// (Previously this page embedded the legacy white editor.html iframe.)
export default function Voice() {
  const [params] = useSearchParams();
  return <div className="h-full min-h-[calc(100vh-2rem)]"><Workspace docId={params.get("doc")} initialTab="voice" /></div>;
}
