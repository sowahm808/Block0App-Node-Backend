import { inflateRawSync, inflateSync } from 'node:zlib';
import type { LearningPackImportPayload, ImportQuestion } from './content-import.js';

export type UploadedFile = { filename: string; mimeType: string; buffer: Buffer };
export type ExtractedDocument = {
  text: string;
  warnings: string[];
  metadata: {
    extractionMethod: string;
    characterCount: number;
    wordCount: number;
    pageCount?: number;
  };
};
export interface DocumentExtractor {
  supports(mimeType: string): boolean;
  extract(file: UploadedFile): Promise<ExtractedDocument>;
}
const stats = (text: string, extractionMethod: string, extra = {}) => ({
  extractionMethod,
  characterCount: text.length,
  wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
  ...extra,
});

function unzipEntry(input: Buffer, wanted: string) {
  for (let offset = 0; offset + 30 < input.length;) {
    if (input.readUInt32LE(offset) !== 0x04034b50) {
      offset++;
      continue;
    }
    const method = input.readUInt16LE(offset + 8),
      size = input.readUInt32LE(offset + 18);
    const nameLength = input.readUInt16LE(offset + 26),
      extraLength = input.readUInt16LE(offset + 28);
    const name = input.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength,
      compressed = input.subarray(start, start + size);
    if (name === wanted) return method === 0 ? compressed : inflateRawSync(compressed);
    offset = start + size;
  }
  throw new Error('DOCX does not contain word/document.xml');
}
const decodeXml = (value: string) =>
  value
    .replace(/<w:tab\/?\s*>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br\/?\s*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

export class DocxExtractor implements DocumentExtractor {
  supports(mimeType: string) {
    return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  async extract(file: UploadedFile): Promise<ExtractedDocument> {
    const text = decodeXml(unzipEntry(file.buffer, 'word/document.xml').toString('utf8'))
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text) throw new Error('DOCX contains no readable text');
    return { text, warnings: [], metadata: stats(text, 'docx-embedded-xml') };
  }
}
export class PdfExtractor implements DocumentExtractor {
  supports(mimeType: string) {
    return mimeType === 'application/pdf';
  }
  async extract(file: UploadedFile): Promise<ExtractedDocument> {
    const binary = file.buffer.toString('latin1');
    const pageCount = Math.max(1, (binary.match(/\/Type\s*\/Page\b/g) ?? []).length);
    const chunks: string[] = [];
    const streams = [...binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
    for (const match of streams) {
      let content = Buffer.from(match[1], 'latin1');
      try {
        if (/\/FlateDecode/.test(binary.slice(Math.max(0, match.index! - 200), match.index)))
          content = inflateSync(content);
      } catch {
        continue;
      }
      const source = content.toString('latin1');
      for (const token of source.matchAll(/\(((?:\\.|[^\\)])*)\)\s*(?:Tj|['"])/g))
        chunks.push(token[1].replace(/\\([()\\])/g, '$1'));
      for (const array of source.matchAll(/\[([\s\S]*?)\]\s*TJ/g))
        for (const token of array[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g))
          chunks.push(token[1].replace(/\\([()\\])/g, '$1'));
    }
    const text = chunks.join('\n').trim();
    if (text.length < 40)
      throw new Error(
        'PDF has no usable embedded text and may be scanned; OCR is not performed automatically',
      );
    return {
      text,
      warnings: text.length < 200 ? ['PDF extraction produced suspiciously short text'] : [],
      metadata: stats(text, 'pdf-embedded-text', { pageCount }),
    };
  }
}
export class DocumentExtractionService {
  constructor(
    private extractors: DocumentExtractor[] = [new DocxExtractor(), new PdfExtractor()],
  ) {}
  extract(file: UploadedFile) {
    const extractor = this.extractors.find((item) => item.supports(file.mimeType));
    if (!extractor) throw new Error(`Unsupported document type: ${file.mimeType}`);
    return extractor.extract(file);
  }
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'learning-pack';
const field = (block: string, name: string) =>
  block.match(new RegExp(`^${name}[ \\t]*:[ \\t]*(.*)$`, 'im'))?.[1]?.trim();
export function parseLearningPackDocument(
  input: string,
  sourceFileName?: string,
): { draft: LearningPackImportPayload; warnings: string[] } {
  const text = input.replace(/\r\n?/g, '\n');
  const warnings: string[] = [];
  const capsuleMatches = [...text.matchAll(/^CAPSULE\s+(\d+)\s*$/gim)];
  const packBlock = text.slice(0, capsuleMatches[0]?.index ?? text.length);
  const title = field(packBlock, 'Title') ?? '';
  const objectiveBlock = packBlock.match(/^LEARNING OBJECTIVES\s*$([\s\S]*)/im)?.[1] ?? '';
  const objectives = objectiveBlock
    .split('\n')
    .map((line) => line.match(/^\s*\d+[.)]\s*(.+)$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const packExternalId = field(packBlock, 'External ID') || slug(title);
  if (!field(packBlock, 'External ID'))
    warnings.push('Learning pack external ID was missing and generated from title');
  const capsules = capsuleMatches.map((match, index) => {
    const block = text.slice(match.index!, capsuleMatches[index + 1]?.index ?? text.length);
    const questionMatches = [...block.matchAll(/^QUESTION\s+(\d+)\s*$/gim)];
    const capsuleHeader = block.slice(0, questionMatches[0]?.index ?? block.length);
    const capsuleTitle = field(capsuleHeader, 'Title') ?? '';
    const externalId =
      field(capsuleHeader, 'External ID') || `${packExternalId}-capsule-${index + 1}`;
    const content = capsuleHeader.match(/^CONTENT\s*$([\s\S]*)/im)?.[1]?.trim() ?? '';
    const questions: ImportQuestion[] = questionMatches.map((questionMatch, qIndex) => {
      const question = block.slice(
        questionMatch.index!,
        questionMatches[qIndex + 1]?.index ?? block.length,
      );
      const choices = [...question.matchAll(/^\s*([A-F])[.)]\s*(.+)$/gim)].map((choice) => ({
        id: choice[1].toLowerCase(),
        label: choice[1].toUpperCase(),
        text: choice[2].trim(),
      }));
      const answer = field(question, 'Correct Answer')?.match(/[A-F]/i)?.[0]?.toLowerCase() ?? '';
      const incorrectRationales: Record<string, string> = {};
      for (const choice of choices) {
        const rationale = field(question, `Incorrect Rationale ${choice.label}`);
        if (rationale) incorrectRationales[choice.id] = rationale;
      }
      const memoryTip = field(question, 'Memory Tip');
      return {
        externalId: field(question, 'External ID') || `${externalId}-question-${qIndex + 1}`,
        sequence: Number(questionMatch[1]),
        stem: field(question, 'Stem') ?? '',
        choices,
        explanation: {
          correctChoiceId: answer,
          correctRationale: field(question, 'Correct Rationale') ?? '',
          incorrectRationales,
          ...(field(question, 'Reference') ? { reference: field(question, 'Reference') } : {}),
          ...(memoryTip ? { memory: { tip: memoryTip } } : {}),
        },
      };
    });
    return {
      externalId,
      sequence: Number(match[1]),
      title: capsuleTitle,
      summary: field(capsuleHeader, 'Summary') ?? '',
      content,
      estimatedMinutes: Number(field(capsuleHeader, 'Estimated Minutes')) || 0,
      status: field(capsuleHeader, 'Status')?.toLowerCase() || 'draft',
      questions,
    };
  });
  if (!field(packBlock, 'Summary')) warnings.push('Learning pack summary is missing');
  return {
    draft: {
      sourceFileName,
      learningPack: {
        externalId: packExternalId,
        code: field(packBlock, 'Code') ?? '',
        title,
        topic: field(packBlock, 'Topic') ?? '',
        summary: field(packBlock, 'Summary') ?? '',
        description: field(packBlock, 'Summary') ?? '',
        estimatedMinutes: Number(field(packBlock, 'Estimated Minutes')) || 0,
        status: field(packBlock, 'Status')?.toLowerCase() || 'draft',
        objectives,
      },
      capsules,
    },
    warnings,
  };
}
