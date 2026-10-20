// Public management interface; consumers do not import kernel implementation paths.
export {
  ProjectLauncher,
  readProject,
  saveProject,
  validateProjectName,
} from "./manager.mjs";

export { managementFingerprint } from "./io.mjs";
export { prepareSetupUI } from "./setup-ui.mjs";

export { closeDockForMaintenance } from './dock.mjs';
