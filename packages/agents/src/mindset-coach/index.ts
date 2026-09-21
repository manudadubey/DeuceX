export {
  PATTERN_MIN_HITS,
  PATTERN_STRONG_RATIO,
  PATTERN_WINDOW_DAYS,
  computeConfidence,
  detectPatterns,
  type DetectPatternsInput,
  type MindsetConditionStamp,
  type MindsetNote,
  type PatternCandidate,
  type PatternConfidence,
  type PatternEvidenceEntry,
  type PatternKind,
} from './rules';
export { mergePattern, type ExistingPattern, type PatternMergeResult } from './merge-patterns';
export {
  evaluateDistress,
  matchesDistressLexicon,
  type DistressEvaluation,
  type DistressSignal,
  type EvaluateDistressInput,
} from './distress';
export {
  INSIGHT_MAX_WORDS,
  INSIGHT_MIN_WORDS,
  insightModelOutputSchema,
  runToneCheck,
  type InsightModelOutput,
  type ToneCheckResult,
} from './schema';
export {
  INSIGHT_PROMPT_VERSION,
  INSIGHT_SCHEMA_VERSION,
  buildCorrectiveInsightPrompt,
  buildInsightPrompt,
  buildToneRetryPrompt,
  type InsightPrompt,
  type InsightPromptCheckIn,
  type InsightPromptInput,
  type InsightPromptNote,
} from './prompt';
export {
  INSIGHT_MODEL,
  InsightModelCallError,
  createOpenAIInsightClient,
  type InsightModelClient,
  type OpenAIInsightClientConfig,
} from './model-client';
export {
  createClinicalLanguageInsightClient,
  createInvalidInsightClient,
  createMockInsightClient,
  type MockInsightFixture,
} from './mock-client';
export {
  generateInsight,
  type ExistingPatternWithId,
  type GenerateInsightInput,
  type GenerateInsightResult,
  type InsightDelivery,
  type InsightProvenance,
} from './generate-insight';
export type { MindsetCheckIn } from './types';
