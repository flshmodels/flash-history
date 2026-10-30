import { createApi, fail, fields, keyFrom, method, startFromEnv } from './http.mjs';

export function createService({ token = '', maxDocuments = 100, maxRevisions = 25, maxValueBytes = 8192 } = {}) {
  if (![maxDocuments, maxRevisions, maxValueBytes].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Limits must be positive integers.');
  const documents = new Map();
  const view = (id, doc) => ({ id, version: doc.version, revisionId: doc.revisions[doc.cursor].id, value: doc.revisions[doc.cursor].value, canUndo: doc.cursor > 0, canRedo: doc.cursor < doc.revisions.length - 1 });
  function expected(body, doc) {
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) fail(400, 'invalid_version', 'expectedVersion must be a nonnegative safe integer.');
    if (body.expectedVersion !== (doc?.version ?? 0)) fail(409, 'version_conflict', 'The document changed. Fetch it and retry with its current version.');
    if (body.expectedVersion === Number.MAX_SAFE_INTEGER) fail(409, 'version_exhausted', 'This document has reached the version limit.');
  }
  return createApi({ name: 'flash-history', token, handler: async ({ request, path, json }) => {
    const match = /^\/v1\/documents\/([^/]+)(?:\/(revisions|undo|redo))?$/.exec(path);
    if (!match) fail(404, 'not_found', 'No endpoint exists at this path.');
    const id = keyFrom(match[1]);
    const action = match[2];
    let doc = documents.get(id);
    if (!action && request.method === 'PUT') {
      const body = await json();
      fields(body, ['value', 'expectedVersion'], ['value', 'expectedVersion']);
      // Re-read after awaiting the body so simultaneous updates use the latest version.
      doc = documents.get(id);
      expected(body, doc);
      if (Buffer.byteLength(JSON.stringify(body.value)) > maxValueBytes) fail(413, 'value_too_large', `value exceeds ${maxValueBytes} serialized UTF-8 bytes.`);
      if (!doc && documents.size >= maxDocuments) fail(503, 'capacity_exceeded', 'The document limit has been reached.');
      const created = !doc;
      const version = (doc?.version ?? 0) + 1;
      const revisions = doc ? doc.revisions.slice(0, doc.cursor + 1) : [];
      revisions.push({ id: version, value: body.value });
      if (revisions.length > maxRevisions) revisions.shift();
      doc = { version, revisions, cursor: revisions.length - 1 };
      documents.set(id, doc);
      return { status: created ? 201 : 200, body: view(id, doc) };
    }
    method(request, action === 'undo' || action === 'redo' ? ['POST'] : action === 'revisions' ? ['GET'] : ['GET', 'PUT']);
    if (!doc) fail(404, 'document_not_found', 'The document does not exist.');
    if (action === 'undo' || action === 'redo') {
      const body = await json(); fields(body, ['expectedVersion'], ['expectedVersion']);
      doc = documents.get(id); expected(body, doc);
      const target = doc.cursor + (action === 'undo' ? -1 : 1);
      if (target < 0 || target >= doc.revisions.length) fail(409, 'history_boundary', `No ${action} is available.`);
      doc.cursor = target; doc.version++;
    }
    if (action === 'revisions') return { body: { id, version: doc.version, revisions: doc.revisions.map((revision, index) => ({ ...revision, current: index === doc.cursor })) } };
    return { body: view(id, doc) };
  } });
}
startFromEnv(import.meta.url, createService, 4311);
