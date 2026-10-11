import { RestartServices } from './features/runtime-control/RestartServices';
import { GitVersionPanel } from './features/git-version/GitVersionPanel';
import { VersionFooter } from './features/version/VersionFooter';

export function App() {
  return <><div className="runtime-controls"><GitVersionPanel /><RestartServices /></div><VersionFooter /></>;
}
