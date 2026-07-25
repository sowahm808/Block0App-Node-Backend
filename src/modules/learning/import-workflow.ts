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
  'uploaded' | 'extracted' | 'needs_review' | 'validated' | 'committing' | 'completed' | 'failed';
export type ValidationIssue = { path: string; message: string };
export type ImportRecord = Record<string, any> & {
  importId: string;
  status: ImportStatus;
  valid: boolean;
  contentVersion: string;
  sourceFileName: string;
  draft?: LearningPackImportPayload;
  validationErrors: ValidationIssue[];
};

const issue = (message: string): ValidationIssue => {
  const path = message.match(/^(learningPack(?:\.[\w]+)?)/)?.[1] ?? '';
  return { path, message };
};
const normalized = (record: ImportRecord): ImportRecord => {
  const validationErrors = Array.isArray(record.validationErrors) ? record.validationErrors : [];
  const errors = validationErrors.map((value) =>
    typeof value === 'string' ? issue(value) : value,
  );
  const valid = record.status === 'validated' && errors.length === 0 && record.valid !== false;
  return {
    ...record,
    valid,
    validationErrors: errors,
    validationCount: errors.length,
    extractionWarnings: record.extractionWarnings ?? [],
    created: record.importSummary?.created ?? record.created ?? 0,
    updated: record.importSummary?.updated ?? record.updated ?? 0,
    skipped: record.importSummary?.skipped ?? record.skipped ?? 0,
    failed: record.importSummary?.failed ?? record.failed ?? 0,
    contentVersion: String(record.contentVersion ?? '1'),
    uploadedAt: record.uploadedAt ?? record.uploadedAtUtc,
    packTitle: record.draft?.learningPack?.title ?? record.packTitle ?? '',
  };
};

export class LearningPackImportRepository {
  constructor(private db: Firestore) {}
  async create(record: ImportRecord) {
    await this.db.collection(IMPORT_COLLECTION).doc(record.importId).set(record);
    return normalized(record);
  }
  async get(importId: string, tenantId?: string) {
    const snapshot = await this.db.collection(IMPORT_COLLECTION).doc(importId).get();
    if (!snapshot.exists) return null;
    const record = { importId: snapshot.id, ...snapshot.data() } as ImportRecord;
    return tenantId && record.tenantId !== tenantId ? null : normalized(record);
  }
  async update(importId: string, changes: Record<string, unknown>) {
    await this.db.collection(IMPORT_COLLECTION).doc(importId).set(changes, { merge: true });
    return this.get(importId);
  }
  async transition(
    importId: string,
    allowed: ImportStatus[],
    changes: Record<string, unknown>,
    tenantId?: string,
  ) {
    const ref = this.db.collection(IMPORT_COLLECTION).doc(importId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = snapshot.exists
        ? ({ importId: snapshot.id, ...snapshot.data() } as ImportRecord)
        : null;
      if (!record || (tenantId && record.tenantId !== tenantId))
        throw new NotFoundError('Learning-pack import not found');
      if (!allowed.includes(record.status))
        throw new ConflictError(`Import cannot be changed while ${record.status}`);
      transaction.set(ref, changes, { merge: true });
      return normalized({ ...record, ...changes } as ImportRecord);
    });
  }
  async list(query: Record<string, any>, tenantId?: string) {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const snapshot = await this.db.collection(IMPORT_COLLECTION).get();
    let records = snapshot.docs.map((doc) =>
      normalized({ importId: doc.id, ...doc.data() } as ImportRecord),
    );
    if (tenantId) records = records.filter((item) => item.tenantId === tenantId);
    records.sort((a, b) =>
      `${b.uploadedAtUtc}|${b.importId}`.localeCompare(`${a.uploadedAtUtc}|${a.importId}`),
    );
    let offset = 0;
    if (query.cursor) {
      const index = records.findIndex((item) => item.importId === query.cursor);
      if (index < 0)
        throw new AppError(
          400,
          'Invalid cursor',
          'The pagination cursor is invalid',
          'invalid_cursor',
        );
      offset = index + 1;
    }
    const items = records.slice(offset, offset + limit);
    return {
      items,
      nextCursor: offset + limit < records.length ? (items.at(-1)?.importId ?? null) : null,
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
  async upload(file: UploadedFile, userId: string, traceId: string, tenantId?: string) {
    const importId = `imp_${crypto.randomUUID().replaceAll('-', '')}`,
      now = new Date().toISOString();
    const storagePath = `learning-pack-imports/${importId}/${crypto.randomUUID()}`;
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
      status: 'uploaded',
      valid: false,
      contentVersion: '1',
      sourceFileName: file.filename,
      sourceMimeType: file.mimeType,
      sourceFileSize: file.buffer.length,
      sourceStoragePath: storagePath,
      validationErrors: [],
      extractionWarnings: [],
      uploadedBy: userId,
      uploadedAt: now,
      uploadedAtUtc: now,
      updatedBy: userId,
      updatedAtUtc: now,
      ...(tenantId === undefined ? {} : { tenantId }),
      traceId,
    });
    try {
      const extracted = await this.extraction.extract(file);
      const parsed = parseLearningPackDocument(extracted.text, file.filename);
      const warnings = [...extracted.warnings, ...parsed.warnings];
      const extractedText = extracted.text.length <= 300_000 ? extracted.text : undefined;
      const extractedTextStoragePath =
        extractedText === undefined ? `${storagePath}.txt` : undefined;
      if (extractedTextStoragePath)
        await this.storage
          .bucket(this.bucketName)
          .file(extractedTextStoragePath)
          .save(extracted.text, { contentType: 'text/plain', resumable: false });
      const updated = await this.records.update(importId, {
        status: 'extracted',
        valid: false,
        draft: parsed.draft,
        validationErrors: [],
        extractionWarnings: warnings,
        extractionMetadata: extracted.metadata,
        extractedTextPreview: extracted.text.slice(0, 10_000),
        ...(extractedText === undefined ? { extractedTextStoragePath } : { extractedText }),
        updatedAtUtc: new Date().toISOString(),
      });
      return updated!;
    } catch {
      await this.records.update(importId, {
        status: 'failed',
        valid: false,
        updatedAtUtc: new Date().toISOString(),
      });
      throw new AppError(
        500,
        'Document extraction failed',
        'The document could not be extracted safely',
        'document_extraction_failed',
      );
    }
  }
  async get(importId: string, tenantId?: string) {
    const record = await this.records.get(importId, tenantId);
    if (!record) throw new NotFoundError('Learning-pack import not found');
    return record;
  }
  list(query: Record<string, any>, tenantId?: string) {
    return this.records.list(query, tenantId);
  }
  async saveDraft(
    importId: string,
    payload: LearningPackImportPayload,
    userId: string,
    tenantId?: string,
  ) {
    const record = await this.get(importId, tenantId);
    if (!payload?.learningPack || !Array.isArray(payload.capsules))
      throw new AppError(
        422,
        'Invalid draft',
        'Draft must contain learningPack and capsules',
        'invalid_draft',
      );
    return this.records.transition(
      importId,
      ['uploaded', 'extracted', 'needs_review', 'validated', 'failed'],
      {
        draft: { ...payload, sourceFileName: record.sourceFileName },
        contentVersion: String(Number(record.contentVersion) + 1),
        validatedVersion: null,
        validationErrors: [],
        validationCount: 0,
        valid: false,
        status: 'needs_review',
        updatedBy: userId,
        updatedAtUtc: new Date().toISOString(),
      },
      tenantId,
    );
  }
  async validate(importId: string, userId: string, tenantId?: string) {
    const record = await this.get(importId, tenantId);
    if (!record.draft)
      throw new AppError(
        422,
        'Validation failed',
        'Import has no editable draft',
        'validation_failed',
      );
    const errors = validateLearningPackImport(record.draft).map(issue),
      valid = errors.length === 0;
    return this.records.transition(
      importId,
      ['extracted', 'needs_review', 'validated'],
      {
        validationErrors: errors,
        validationCount: errors.length,
        valid,
        status: valid ? 'validated' : 'needs_review',
        validatedVersion: valid ? record.contentVersion : null,
        updatedBy: userId,
        updatedAtUtc: new Date().toISOString(),
      },
      tenantId,
    );
  }
  async commit(importId: string, userId: string, tenantId?: string) {
    const existing = await this.get(importId, tenantId);
    if (existing.status === 'completed' && existing.commitResult) return existing.commitResult;
    if (
      !existing.draft ||
      !existing.valid ||
      existing.validationErrors.length ||
      existing.validatedVersion !== existing.contentVersion
    )
      throw new ConflictError('The current draft must be validated before commit');
    const locked = await this.records.transition(
      importId,
      ['validated'],
      { status: 'committing', updatedBy: userId, updatedAtUtc: new Date().toISOString() },
      tenantId,
    );
    const draft = {
      ...locked.draft!,
      learningPack: { ...locked.draft!.learningPack, status: 'draft', importId },
    };
    try {
      const summary = await this.learning.importLearningPack(draft, userId, importId);
      if (summary.failed) throw new Error('Persistence reported failed records');
      const importedAt = new Date().toISOString();
      const result = {
        created: summary.created,
        updated: summary.updated,
        skipped: summary.skipped,
        failed: 0,
        validationErrors: [],
        contentIds: summary.contentIds,
        importedBy: userId,
        importedAt,
        sourceFileName: existing.sourceFileName,
      };
      await this.records.update(importId, {
        status: 'completed',
        commitResult: result,
        importSummary: summary,
        committedAtUtc: importedAt,
        updatedAtUtc: importedAt,
      });
      return result;
    } catch {
      await this.records.update(importId, {
        status: 'failed',
        valid: false,
        updatedAtUtc: new Date().toISOString(),
      });
      throw new AppError(
        500,
        'Import commit failed',
        'No content was committed',
        'import_commit_failed',
      );
    }
  }
}
