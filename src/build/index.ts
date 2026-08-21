/** Generación y verificación del corpus. Se usa desde scripts, no en runtime. */
export {
  buildCore,
  buildSections,
  collectButtonMarkers,
  collectCoreFiles,
  extractButtonMarkers,
  renderButtonMarkers,
  writeCorpus,
} from "./corpus";
export type { CorpusPaths } from "./corpus";
export { checkCorpus, collectRoutes } from "./check";
export type { CheckOptions, CheckResult } from "./check";
export { extractUiLabels } from "./labels";
