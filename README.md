# Flash History

Keep versions of a JSON document and move through them with undo and redo. Each write checks the current version so one client does not overwrite another client's changes.

Default address: **http://127.0.0.1:4311**.

## Getting started

Requires Node.js 22 or later. No packages need to be installed.

```sh
npm start
```

Keep that terminal open while using the API. In a second terminal, run `npm run demo` to try it or `npm test` to run the tests. Press Ctrl+C in the first terminal to stop the server.

## Endpoints

| Method | Path | Input | Result |
| --- | --- | --- | --- |
| GET | /health | None | Service name, version, status |
| PUT | /v1/documents/:id | value, expectedVersion | Create (201) or edit (200) a document |
| GET | /v1/documents/:id | None | Current value and history state |
| GET | /v1/documents/:id/revisions | None | Retained revisions with the current one marked |
| POST | /v1/documents/:id/undo | expectedVersion | Move to the previous retained revision |
| POST | /v1/documents/:id/redo | expectedVersion | Move to the next retained revision |

Create with `{"value":{"theme":"dark"},"expectedVersion":0}`. The response contains `id`, `version`, `revisionId`, `value`, `canUndo` and `canRedo`. A first write has version 1. Editing, undoing and redoing each advance the version; clients must send the latest version with every change. A mismatch returns 409 instead of overwriting someone else's change.

An undo request looks like `{"expectedVersion":2}`. Moving past either end returns 409. A new edit after undo discards the redo branch. Revision IDs are not reused within the lifetime of a document. A full history is bounded: older revisions are dropped, so undo cannot reach them.

## Limits

Data lives **only in memory** and is lost when the process stops. The defaults are 100 documents, 25 retained revisions per document, and 8 KiB of serialized UTF-8 JSON per value. There is no database, audit retention, deletion endpoint, or shared state between instances. Treat this as temporary edit history, not a backup system. The exported `createService` factory accepts alternative positive-integer limits for embedding/tests.

Six service tests cover undo/redo, branches, simultaneous writers, retention, capacity, and malformed requests. Seven transport tests cover the HTTP boundary.

## Access and requests

By default, the server listens on `127.0.0.1`. Set `PORT` and `HOST` to change the listener. Setting `API_TOKEN` enables Bearer authentication for all API routes; `GET /health` stays public. A token must be 32–256 characters. Non-loopback binding requires a token. For example, in PowerShell:

```powershell
$env:API_TOKEN = 'replace-with-a-random-secret-at-least-32-characters'
npm start
```

Send `Authorization: Bearer <your-token>` when authentication is enabled. The demo reads the same `API_TOKEN` environment variable; its optional `API_URL` changes the target server. The server does not read a .env file automatically. For access beyond your own computer, use a trusted HTTPS reverse proxy and restrict access. There is no built-in TLS, per-user authorization, CORS support, or managed hosting in this repository.

Requests with bodies must use `Content-Type: application/json`. Keys/IDs are 1–64 ASCII letters, numbers, underscores or hyphens and must start with a letter or number. No query parameters are supported. Responses are JSON. Error responses use `{"error":{"code":"...","message":"..."}}`.

Bodies are limited to 64 KiB, 32 nesting levels and 10,000 values. Numbers must be finite. Unsupported methods return 405, bad JSON 400, unsupported content types 415, oversized bodies 413, and missing/incorrect credentials 401. Responses use `Cache-Control: no-store`. Health reports process availability, not downstream readiness. No endpoint executes submitted code or fetches URLs from submitted data.

## Tests

Tests send HTTP requests to local servers on temporary ports. GitHub Actions runs them on Node 22 and 24.

This repository contains a small service you host yourself. It runs as one process.

MIT licensed. See [LICENSE](LICENSE).
