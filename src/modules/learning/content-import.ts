export type ImportQuestion = {
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
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
export function validateLearningPackImport(payload: LearningPackImportPayload): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const checkExternalId = (kind: string, value?: string) => {
    if (!value) return errors.push(`${kind} externalId is required`);
    if (seen.has(value)) errors.push(`Duplicate externalId: ${value}`);
    seen.add(value);
  };
  if (!payload?.learningPack?.title) errors.push('learningPack.title is required');
  if (!text(payload?.learningPack?.topic)) errors.push('learningPack.topic is required');
  if (
    !Array.isArray(payload?.learningPack?.objectives) ||
    payload.learningPack.objectives.length === 0
  )
    errors.push('learningPack.objectives must contain at least one objective');
  if (!['draft', 'published'].includes(payload?.learningPack?.status ?? 'draft'))
    errors.push('learningPack.status must be draft or published');
  checkExternalId('learningPack', payload?.learningPack?.externalId);
  if (!Array.isArray(payload?.capsules) || payload.capsules.length === 0)
    errors.push('At least one capsule is required');
  for (const capsule of payload?.capsules ?? []) {
    if (!capsule.title)
      errors.push(`capsule ${capsule.externalId ?? '(missing externalId)'} title is required`);
    checkExternalId('capsule', capsule.externalId);
    if (!Number.isInteger(capsule.sequence) || capsule.sequence < 1)
      errors.push(`capsule ${capsule.externalId} sequence must be a positive integer`);
    if (
      payload.learningPack?.status === 'published' &&
      terminalDraftStatuses.has(capsule.status ?? 'draft')
    ) {
      errors.push(
        `Published learning pack cannot include ${capsule.status ?? 'draft'} capsule ${capsule.externalId}`,
      );
    }
    if (!Array.isArray(capsule.questions) || capsule.questions.length === 0)
      errors.push(`capsule ${capsule.externalId} needs at least one question`);
    const questionSequences = new Set<number>();
    for (const question of capsule.questions ?? []) {
      checkExternalId('question', question.externalId);
      if (!question.stem) errors.push(`question ${question.externalId} stem is required`);
      if (!Number.isInteger(question.sequence) || question.sequence < 1)
        errors.push(`question ${question.externalId} sequence must be a positive integer`);
      if (questionSequences.has(question.sequence))
        errors.push(
          `Duplicate question sequence ${question.sequence} in capsule ${capsule.externalId}`,
        );
      questionSequences.add(question.sequence);
      if (!Array.isArray(question.choices) || question.choices.length < 2)
        errors.push(`question ${question.externalId} needs at least two choices`);
      if ((question.choices ?? []).length > 6)
        errors.push(`question ${question.externalId} cannot have more than six choices`);
      const choiceIds = new Set((question.choices ?? []).map((choice) => choice.id));
      if (choiceIds.size !== (question.choices ?? []).length)
        errors.push(`question ${question.externalId} choice ids must be unique`);
      for (const choice of question.choices ?? []) {
        if (!text(choice.id) || !text(choice.label) || !text(choice.text))
          errors.push(`question ${question.externalId} choices require id, label, and text`);
      }
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
      for (const choice of question.choices ?? []) {
        if (
          choice.id !== explanation?.correctChoiceId &&
          !text(explanation?.incorrectRationales?.[choice.id])
        )
          errors.push(
            `question ${question.externalId} needs an incorrect rationale for choice ${choice.id}`,
          );
      }
      for (const leaked of ['correctChoiceId', 'correctRationale', 'incorrectRationales']) {
        if (Object.prototype.hasOwnProperty.call(question, leaked))
          errors.push(`question ${question.externalId} W1 payload cannot include ${leaked}`);
      }
    }
  }
  const capsuleSequences = new Set<number>();
  for (const capsule of payload?.capsules ?? []) {
    if (capsuleSequences.has(capsule.sequence))
      errors.push(`Duplicate capsule sequence: ${capsule.sequence}`);
    capsuleSequences.add(capsule.sequence);
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
