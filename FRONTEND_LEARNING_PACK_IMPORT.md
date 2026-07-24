# Frontend guide: administrator learning-pack imports

The import UI should be an administrator-only workflow, but the API remains the authorization authority. Do not infer API access from a displayed role: send the backend access token and handle `403` Problem Details.

## Suggested screens and state flow

1. **Import history** calls `GET /api/v1/admin/learning-packs/imports?limit=20&cursor=...`. Display filename, pack title, uploader, upload time, status, validation count, and write counts.
2. **Upload** sends one `file` part to `POST /api/v1/admin/learning-packs/imports`. Accept `.pdf,.docx` in the picker and enforce 20 MB client-side for early feedback. The successful response is `202 Accepted`; navigate to the returned `importId`.
3. **Review** calls `GET /api/v1/admin/learning-packs/imports/:importId`. Render `draft.learningPack`, objectives, capsules, questions, choices, and explanation fields as editable controls. Show extraction warnings separately from blocking validation errors.
4. **Save** sends the complete edited `LearningPackImportPayload` to `PUT /api/v1/admin/learning-packs/imports/:importId/draft`. Never send the original file again. The backend preserves `sourceFileName` and revalidates.
5. **Validate** calls `POST /api/v1/admin/learning-packs/imports/:importId/validate`. Enable commit only when `valid` is true and `status` is `validated`.
6. **Commit** calls `POST /api/v1/admin/learning-packs/imports/:importId/commit`. Treat retries as safe: the backend returns the original summary after completion. Imported content remains `draft`; publishing must be a separate, explicitly authorized action.

## Upload example

```ts
export async function uploadLearningPack(file: File, accessToken: string) {
  if (file.size === 0 || file.size > 20 * 1024 * 1024)
    throw new Error('Choose a non-empty file up to 20 MB.');
  const form = new FormData();
  form.append('file', file, file.name);
  const response = await fetch('/api/v1/admin/learning-packs/imports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }, // do not set Content-Type; the browser adds the boundary
    body: form,
  });
  if (!response.ok) throw await response.json();
  return response.json();
}
```

## Editing rules

- Choice IDs are stable lowercase values (`a` through `f`); labels may be uppercase for display.
- Correct-answer data belongs under `question.explanation`, never at question root.
- Keep external IDs stable after the first commit. They drive updates and unchanged-content detection.
- Display every returned error; validation intentionally reports all blocking issues together.
- A `409` means workflow state or content version conflict. Refresh the detail before offering another action.
- Render RFC 7807 `detail`, field `errors`, and `traceId`. Include the trace ID in support copy, but never expose storage paths or request internals.

The scholar learning-pack screens require no import-specific changes. Continue using `GET /api/v1/learning-packs` and `GET /api/v1/learning-packs/:packId`; scholar progress and navigation remain server-computed and separate from imported global content.
