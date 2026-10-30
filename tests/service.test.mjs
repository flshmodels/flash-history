import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../src/server.mjs';
import { fixture } from './fixture.mjs';
const route = '/v1/documents/layout';
const put = (value, expectedVersion) => ({ method: 'PUT', body: { value, expectedVersion } });
const post = expectedVersion => ({ method: 'POST', body: { expectedVersion } });

test('create, edit, undo and redo preserve values and advance versions', async t => {
  const { call } = await fixture(t, createService());
  assert.equal((await call(route, put({ x: 1 }, 0))).status, 201);
  assert.equal((await call(route, put({ x: 2 }, 1))).body.version, 2);
  const undo = await call(route + '/undo', post(2));
  assert.deepEqual(undo.body.value, { x: 1 });
  assert.equal(undo.body.version, 3);
  assert.equal(undo.body.canRedo, true);
  const redo = await call(route + '/redo', post(3));
  assert.deepEqual(redo.body.value, { x: 2 });
  assert.equal(redo.body.version, 4);
});
test('an edit after undo discards redo history', async t => {
  const { call } = await fixture(t, createService());
  await call(route, put('a', 0)); await call(route, put('b', 1));
  await call(route + '/undo', post(2)); await call(route, put('c', 3));
  assert.equal((await call(route + '/redo', post(4))).status, 409);
  const list = (await call(route + '/revisions')).body.revisions;
  assert.deepEqual(list.map(item => item.value), ['a', 'c']);
  assert.deepEqual(list.map(item => item.id), [1, 4]);
});
test('concurrent writes with the same version cannot both succeed', async t => {
  const { call } = await fixture(t, createService());
  await call(route, put('original', 0));
  const results = await Promise.all([call(route, put('one', 1)), call(route, put('two', 1))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await call(route)).body.version, 2);
});
test('undo boundaries, missing documents and stale writes fail without mutation', async t => {
  const { call } = await fixture(t, createService());
  assert.equal((await call(route)).status, 404);
  await call(route, put(null, 0));
  assert.equal((await call(route + '/undo', post(1))).status, 409);
  assert.equal((await call(route, put(false, 0))).status, 409);
  assert.equal((await call(route)).body.value, null);
});
test('history retention and document capacity are bounded', async t => {
  const { call } = await fixture(t, createService({ maxDocuments: 1, maxRevisions: 2 }));
  await call(route, put(1, 0)); await call(route, put(2, 1)); await call(route, put(3, 2));
  assert.deepEqual((await call(route + '/revisions')).body.revisions.map(r => r.value), [2, 3]);
  assert.equal((await call('/v1/documents/another', put(1, 0))).status, 503);
});
test('invalid bodies, keys and oversized values are refused', async t => {
  const { call } = await fixture(t, createService({ maxValueBytes: 10 }));
  await call(route, put('ok', 0));
  for (const body of [{ value: 1 }, { value: 1, expectedVersion: -1 }, { value: 1, expectedVersion: 1.5 }, { value: 1, expectedVersion: 1, admin: true }]) {
    assert.equal((await call(route, { method: 'PUT', body })).status, 400);
  }
  assert.equal((await call(route, put('x'.repeat(10), 1))).status, 413);
  assert.equal((await call(route)).body.value, 'ok');
  assert.equal((await call('/v1/documents/bad%2Fkey', put(1, 0))).status, 400);
});
