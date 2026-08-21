/** Todo lo que corre en el servidor. */
export { createCopilotHandler } from "./handler";
export { streamCopilotAnswer, looksLikeRefusal } from "./chat";
export type { CopilotAnswer, CopilotStreamHandlers } from "./chat";
export { checkCopilotAvailability, startOfMonth } from "./limits";
export { buildSystemPrompt } from "./prompt";
export { buildRules } from "./rules";
export {
  buildSectionCatalog,
  buildSectionTool,
  getSection,
  readSectionForTool,
  sectionIds,
  TOOL_NAME,
} from "./sections";
export { calculateCostUsd, getModelRates, MODEL_RATES } from "./pricing";
export type { ModelRates } from "./pricing";
export {
  copilotChatRequestSchema,
  copilotFeedbackSchema,
  maskRoute,
} from "./schemas";
