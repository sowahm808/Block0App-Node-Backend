type ImportQuestion = {
  externalId: string;
  sequence: number;
  stem: string;
  choices: { id: string; label: string; text: string }[];
  explanation: {
    correctChoiceId: string;
    correctRationale: string;
    incorrectRationales: Record<string, string>;
    reference?: string;
    memory?: Record<string, string>;
  };
  [key: string]: unknown;
};
export type LearningPackImportPayload = {
  learningPack: Record<string, any>;
  capsules: Array<Record<string, any> & { questions: ImportQuestion[] }>;
  sourceFileName?: string;
};
export type ImportSummary = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  contentIds: string[];
  audit: { importedBy: string; importedAtUtc: string; sourceFileName: string | null };
};
const terminalDraftStatuses = new Set(['draft', 'rejected']);
export function validateLearningPackImport(payload: LearningPackImportPayload): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const checkExternalId = (kind: string, value?: string) => {
    if (!value) return errors.push(`${kind} externalId is required`);
    if (seen.has(value)) errors.push(`Duplicate externalId: ${value}`);
    seen.add(value);
  };
  if (!payload?.learningPack?.title) errors.push('learningPack.title is required');
  checkExternalId('learningPack', payload?.learningPack?.externalId);
  if (!Array.isArray(payload?.capsules) || payload.capsules.length === 0)
    errors.push('At least one capsule is required');
  for (const capsule of payload?.capsules ?? []) {
    if (!capsule.title)
      errors.push(`capsule ${capsule.externalId ?? '(missing externalId)'} title is required`);
    checkExternalId('capsule', capsule.externalId);
    if (
      payload.learningPack?.status === 'published' &&
      terminalDraftStatuses.has(capsule.status ?? 'draft')
    ) {
      errors.push(
        `Published learning pack cannot include ${capsule.status ?? 'draft'} capsule ${capsule.externalId}`,
      );
    }
    for (const question of capsule.questions ?? []) {
      checkExternalId('question', question.externalId);
      if (!question.stem) errors.push(`question ${question.externalId} stem is required`);
      if (!Array.isArray(question.choices) || question.choices.length < 2)
        errors.push(`question ${question.externalId} needs at least two choices`);
      const choiceIds = new Set((question.choices ?? []).map((choice) => choice.id));
      const explanation = question.explanation;
      if (!explanation?.correctChoiceId)
        errors.push(`question ${question.externalId} correctChoiceId is required`);
      if (explanation?.correctChoiceId && !choiceIds.has(explanation.correctChoiceId))
        errors.push(`question ${question.externalId} correctChoiceId must match a choice id`);
      if (!explanation?.correctRationale)
        errors.push(`question ${question.externalId} correctRationale is required`);
      if (
        !explanation?.incorrectRationales ||
        Object.keys(explanation.incorrectRationales).length === 0
      )
        errors.push(`question ${question.externalId} incorrectRationales are required`);
      for (const leaked of ['correctChoiceId', 'correctRationale', 'incorrectRationales']) {
        if (Object.prototype.hasOwnProperty.call(question, leaked))
          errors.push(`question ${question.externalId} W1 payload cannot include ${leaked}`);
      }
    }
  }
  return errors;
}
export function importFailedSummary(
  payload: LearningPackImportPayload,
  importedBy: string,
  errors: string[],
): ImportSummary {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: errors.length,
    errors,
    contentIds: [],
    audit: {
      importedBy,
      importedAtUtc: new Date().toISOString(),
      sourceFileName: payload.sourceFileName ?? null,
    },
  };
}
