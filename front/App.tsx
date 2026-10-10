import { CurrentTime } from './features/CurrentTime';
import { ProjectFileExplorer } from './features/ProjectFileExplorer';
import { ScreenshotButton } from './features/ScreenshotButton';

export function App() {
  return (
    <>
      <ScreenshotButton />
      <ProjectFileExplorer />
      <CurrentTime />
    </>
  );
}
