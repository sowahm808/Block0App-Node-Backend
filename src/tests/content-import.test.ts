import { describe, expect, it } from 'vitest';
import { validateLearningPackImport } from '../modules/learning/content-import.js';
import {
  DocumentExtractionService,
  PdfExtractor,
  parseLearningPackDocument,
} from '../modules/learning/document-import.js';
import { LearningPackImportService } from '../modules/learning/import-workflow.js';

const document = `LEARNING PACK
External ID: pack-1
Code: LP1
Title: Cardiology
Topic: Medicine
Summary: A useful pack
Estimated Minutes: 20
Status: draft

LEARNING OBJECTIVES
1. Recognize the finding

CAPSULE 1
External ID: cap-1
Title: First capsule
Summary: Summary
Estimated Minutes: 10
Status: draft
CONTENT
Teaching content

QUESTION 1
External ID: q-1
Stem: Which answer?
A. Alpha
B. Beta
C. Gamma
D. Delta
Correct Answer: A
Correct Rationale: Alpha is correct
Incorrect Rationale A: unused
Incorrect Rationale B: Beta is wrong
Incorrect Rationale C: Gamma is wrong
Incorrect Rationale D: Delta is wrong
Reference: Textbook
Memory Tip: Remember alpha`;

describe('structured learning-pack parsing', () => {
  it('parses pack, objectives, capsules, questions, choices, and explanations', () => {
    const { draft } = parseLearningPackDocument(document, 'pack.docx');
    expect(draft.learningPack).toMatchObject({
      externalId: 'pack-1',
      title: 'Cardiology',
      topic: 'Medicine',
      objectives: ['Recognize the finding'],
    });
    expect(draft.capsules[0].questions[0]).toMatchObject({
      externalId: 'q-1',
      explanation: {
        correctChoiceId: 'a',
        correctRationale: 'Alpha is correct',
        incorrectRationales: { b: 'Beta is wrong' },
      },
    });
    expect(draft.capsules[0].questions[0].choices[0]).toEqual({
      id: 'a',
      label: 'A',
      text: 'Alpha',
    });
    expect(validateLearningPackImport(draft)).toEqual([]);
  });
  it('preserves a missing answer as a blocking error rather than guessing', () => {
    const { draft } = parseLearningPackDocument(
      document.replace('Correct Answer: A', 'Correct Answer:'),
      'pack.docx',
    );
    expect(validateLearningPackImport(draft)).toContain('question q-1 correctChoiceId is required');
  });
  it('reports duplicate sequences, ids, rationale gaps, and leaked answers together', () => {
    const { draft } = parseLearningPackDocument(document, 'pack.docx');
    draft.capsules.push({ ...draft.capsules[0], sequence: 1 });
    (draft.capsules[0].questions[0] as any).correctChoiceId = 'a';
    delete draft.capsules[0].questions[0].explanation.incorrectRationales.b;
    const errors = validateLearningPackImport(draft);
    expect(errors.some((error) => error.includes('Duplicate externalId'))).toBe(true);
    expect(errors.some((error) => error.includes('Duplicate capsule sequence'))).toBe(true);
    expect(errors.some((error) => error.includes('rationale for choice b'))).toBe(true);
    expect(errors.some((error) => error.includes('cannot include correctChoiceId'))).toBe(true);
  });
});

describe('PDF extraction', () => {
  it('extracts embedded text and page count', async () => {
    const phrase =
      'This is enough embedded text for a structured learning pack document and deterministic extraction.';
    const pdf = Buffer.from(
      `%PDF-1.4\n1 0 obj << /Type /Page >> endobj\nstream\nBT (${phrase}) Tj ET\nendstream\n%%EOF`,
      'latin1',
    );
    const result = await new PdfExtractor().extract({
      filename: 'pack.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    });
    expect(result.text).toContain('structured learning pack');
    expect(result.metadata.pageCount).toBe(1);
  });
  it('rejects scanned or unreadable PDFs clearly', async () => {
    await expect(
      new DocumentExtractionService().extract({
        filename: 'scan.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 scanned'),
      }),
    ).rejects.toThrow(/scanned/);
  });
});

describe('learning-pack import persistence', () => {
  it('does not send undefined import fields to Firestore', async () => {
    const created: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const records = {
      create: async (record: Record<string, unknown>) => {
        created.push(record);
      },
      update: async (_importId: string, changes: Record<string, unknown>) => {
        updates.push(changes);
        return null;
      },
    };
    const savedFiles: string[] = [];
    const storage = {
      bucket: () => ({
        file: (path: string) => ({
          save: async () => {
            savedFiles.push(path);
          },
        }),
      }),
    };
    const extraction = {
      extract: async () => ({
        text: document,
        warnings: [],
        metadata: { extractionMethod: 'test', characterCount: document.length, wordCount: 1 },
      }),
    };
    const service = new LearningPackImportService(
      records as any,
      {} as any,
      storage as any,
      'test-bucket',
      extraction as any,
    );

    await service.upload(
      { filename: 'pack.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf') },
      'admin-1',
      'trace-1',
    );

    expect(created).toHaveLength(1);
    expect(created[0]).not.toHaveProperty('tenantId');
    expect(Object.values(created[0])).not.toContain(undefined);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toHaveProperty('extractedText', document);
    expect(updates[0]).not.toHaveProperty('extractedTextStoragePath');
    expect(Object.values(updates[0])).not.toContain(undefined);
    expect(savedFiles).toHaveLength(1);
  });
});
