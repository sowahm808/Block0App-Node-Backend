import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import { AppError, ConflictError, NotFoundError } from '../common/errors.js';
import {
  validateLearningPackImport,
  type LearningPackImportPayload,
  type ImportSummary,
} from './content-import.js';
import {
  DocumentExtractionService,
  parseLearningPackDocument,
  type UploadedFile,
} from './document-import.js';

export const IMPORT_COLLECTION = 'learningPackImports';
export type ImportStatus =
  | 'uploaded'
  | 'extracting'
  | 'extracted'
  | 'mapping'
  | 'needs_review'
  | 'validated'
  | 'importing'
  | 'completed'
  | 'failed';
export type ImportRecord = Record<string, any> & {
  importId: string;
  status: ImportStatus;
  sourceFileName: string;
  draft?: LearningPackImportPayload;
  validationErrors: string[];
};

export class LearningPackImportRepository {
  constructor(private db: Firestore) {}
  async create(record: ImportRecord) {
    await this.db.collection(IMPORT_COLLECTION).doc(record.importId).set(record);
    return record;
  }
  async get(importId: string) {
    const snapshot = await this.db.collection(IMPORT_COLLECTION).doc(importId).get();
    return snapshot.exists ? ({ importId: snapshot.id, ...snapshot.data() } as ImportRecord) : null;
  }
  async update(importId: string, changes: Record<string, unknown>) {
    await this.db.collection(IMPORT_COLLECTION).doc(importId).set(changes, { merge: true });
    return this.get(importId);
  }
  async list(query: Record<string, any>) {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const snapshot = await this.db.collection(IMPORT_COLLECTION).get();
    let records = snapshot.docs.map((doc) => ({ importId: doc.id, ...doc.data() }) as ImportRecord);
    if (query.status) records = records.filter((item) => item.status === query.status);
    if (query.uploadedBy) records = records.filter((item) => item.uploadedBy === query.uploadedBy);
    if (query.search)
      records = records.filter((item) =>
        `${item.sourceFileName} ${item.draft?.learningPack?.title ?? ''}`
          .toLowerCase()
          .includes(String(query.search).toLowerCase()),
      );
    records.sort((a, b) => String(b.uploadedAtUtc).localeCompare(String(a.uploadedAtUtc)));
    const offset = query.cursor
      ? Math.max(0, records.findIndex((item) => item.importId === query.cursor) + 1)
      : 0;
    const page = records.slice(offset, offset + limit);
    return {
      data: page.map((item) => ({
        importId: item.importId,
        sourceFileName: item.sourceFileName,
        status: item.status,
        packTitle: item.draft?.learningPack?.title ?? null,
        uploadedBy: item.uploadedBy,
        uploadedAtUtc: item.uploadedAtUtc,
        validationErrorCount: item.validationErrors?.length ?? 0,
        created: item.importSummary?.created ?? 0,
        updated: item.importSummary?.updated ?? 0,
        failed: item.importSummary?.failed ?? 0,
      })),
      nextCursor: records[offset + limit]?.importId ?? null,
    };
  }
}

export class LearningPackImportService {
  constructor(
    private records: LearningPackImportRepository,
    private learning: {
      importLearningPack(
        payload: LearningPackImportPayload,
        userId: string,
        importId?: string,
      ): Promise<ImportSummary>;
    },
    private storage?: Storage,
    private bucketName?: string,
    private extraction = new DocumentExtractionService(),
  ) {}
  async upload(file: UploadedFile, userId: string, traceId: string) {
    const importId = crypto.randomUUID(),
      now = new Date().toISOString();
    const storagePath = `learning-pack-imports/${importId}/${file.filename}`;
    if (!this.storage || !this.bucketName)
      throw new AppError(
        500,
        'Storage unavailable',
        'Firebase Storage is not configured',
        'storage_unavailable',
      );
    await this.storage
      .bucket(this.bucketName)
      .file(storagePath)
      .save(file.buffer, {
        contentType: file.mimeType,
        resumable: false,
        metadata: { metadata: { uploadedBy: userId, importId } },
      });
    await this.records.create({
      importId,
      status: 'extracting',
      sourceFileName: file.filename,
      sourceMimeType: file.mimeType,
      sourceFileSize: file.buffer.length,
      sourceStoragePath: storagePath,
      validationErrors: [],
      uploadedBy: userId,
      uploadedAtUtc: now,
      updatedBy: userId,
      updatedAtUtc: now,
      traceId,
    });
    const started = Date.now();
    try {
      const extracted = await this.extraction.extract(file);
      const parsed = parseLearningPackDocument(extracted.text, file.filename);
      const validationErrors = validateLearningPackImport(parsed.draft);
      const status = validationErrors.length ? 'needs_review' : 'validated';
      const extractedText = extracted.text.length <= 300_000 ? extracted.text : undefined;
      const extractedTextPreview = extracted.text.slice(0, 10_000);
      const extractedTextStoragePath = extractedText ? undefined : `${storagePath}.txt`;
      if (extractedTextStoragePath)
        await this.storage
          .bucket(this.bucketName)
          .file(extractedTextStoragePath)
          .save(extracted.text, { contentType: 'text/plain', resumable: false });
      await this.records.update(importId, {
        status,
        draft: parsed.draft,
        validationErrors,
        extractionWarnings: [...extracted.warnings, ...parsed.warnings],
        extractionMetadata: { ...extracted.metadata, durationMs: Date.now() - started },
        extractedText,
        extractedTextPreview,
        extractedTextStoragePath,
        updatedAtUtc: new Date().toISOString(),
      });
      return {
        importId,
        status,
        draft: parsed.draft,
        extractionWarnings: [...extracted.warnings, ...parsed.warnings],
        validationErrors,
        metadata: extracted.metadata,
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Document extraction failed';
      await this.records.update(importId, {
        status: 'failed',
        failureReason,
        updatedAtUtc: new Date().toISOString(),
      });
      throw new AppError(
        500,
        'Document extraction failed',
        failureReason,
        'document_extraction_failed',
      );
    }
  }
  async get(importId: string) {
    const record = await this.records.get(importId);
    if (!record) throw new NotFoundError('Learning-pack import not found');
    return record;
  }
  list(query: Record<string, any>) {
    return this.records.list(query);
  }
  async saveDraft(importId: string, payload: LearningPackImportPayload, userId: string) {
    const record = await this.get(importId);
    if (record.status === 'completed')
      throw new ConflictError('Completed imports cannot be revised');
    const draft = { ...payload, sourceFileName: record.sourceFileName };
    const validationErrors = validateLearningPackImport(draft);
    const status = validationErrors.length ? 'needs_review' : 'validated';
    return this.records.update(importId, {
      draft,
      validationErrors,
      status,
      updatedBy: userId,
      updatedAtUtc: new Date().toISOString(),
    });
  }
  async validate(importId: string, userId: string) {
    const record = await this.get(importId);
    if (!record.draft)
      throw new AppError(
        422,
        'Validation failed',
        'Import has no editable draft',
        'validation_failed',
      );
    const errors = validateLearningPackImport(record.draft);
    const status = errors.length ? 'needs_review' : 'validated';
    await this.records.update(importId, {
      validationErrors: errors,
      status,
      updatedBy: userId,
      updatedAtUtc: new Date().toISOString(),
    });
    return {
      valid: errors.length === 0,
      status,
      errors,
      warnings: record.extractionWarnings ?? [],
    };
  }
  async commit(importId: string, userId: string) {
    const record = await this.get(importId);
    if (record.status === 'completed' && record.importSummary)
      return record.importSummary as ImportSummary;
    if (record.status !== 'validated' || !record.draft)
      throw new ConflictError('Import must be validated before commit');
    const errors = validateLearningPackImport(record.draft);
    if (errors.length) {
      await this.records.update(importId, { status: 'needs_review', validationErrors: errors });
      throw new AppError(
        422,
        'Validation failed',
        'Import contains blocking validation errors',
        'validation_failed',
        errors,
      );
    }
    await this.records.update(importId, {
      status: 'importing',
      updatedBy: userId,
      updatedAtUtc: new Date().toISOString(),
    });
    const draft: LearningPackImportPayload = {
      ...record.draft,
      learningPack: { ...record.draft.learningPack, status: 'draft', importId },
    };
    const summary = await this.learning.importLearningPack(draft, userId, importId);
    await this.records.update(importId, {
      status: summary.failed ? 'failed' : 'completed',
      importSummary: summary,
      resultLearningPackId: draft.learningPack.externalId,
      committedAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    });
    return summary;
  }
}
