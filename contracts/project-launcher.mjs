// Public management interface; consumers do not import kernel implementation paths.
export {
  ProjectLauncher,
  readProject,
  saveProject,
  validateProjectName,
} from "../kernel/launcher/manager.mjs";

export { managementFingerprint } from "../kernel/launcher/io.mjs";
