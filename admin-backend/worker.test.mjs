import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from './worker.mjs';

const origin = 'https://postmark-admin.joas0123.workers.dev';
const ownerId = 353211348;
const hex = character => character.repeat(64);
const sha = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');

function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      let values = [];
      return {bind(...args) { values = args; return this; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async run() { return sqlite.prepare(sql).run(...values); },
        async all() { return {results: sqlite.prepare(sql).all(...values)}; },
        execute() { return /^SELECT/.test(sql) ? {results: sqlite.prepare(sql).all(...values)} : (sqlite.prepare(sql).run(...values), {results: []}); }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  return {DB, sqlite, GITHUB_CLIENT_ID: 'test', GITHUB_CLIENT_SECRET: 'test-secret', REPORT_TOKEN: hex('c'), VISITOR_SALT: hex('d')};
}

const request = (path, init = {}) => new Request(origin + path, init);

test('private APIs deny anonymous, report-only, and non-owner sessions', async () => {
  const env = environment();
  assert.equal((await worker.fetch(request('/api/dashboard'), env)).status, 401);
  assert.equal((await worker.fetch(request('/api/dashboard', {headers: {Authorization: 'Bearer ' + env.REPORT_TOKEN}}), env)).status, 401);
  await env.DB.prepare('INSERT INTO sessions VALUES (?, ?, ?)').bind(await sha(hex('a')), 42, Date.now() + 60000).run();
  assert.equal((await worker.fetch(request('/api/dashboard', {headers: {Cookie: '__Host-pm_session=' + hex('a')}}), env)).status, 401);
  assert.equal((await worker.fetch(request('/admin'), env)).headers.get('Location'), '/auth/login');
  env.sqlite.close();
});

test('login uses one-time state and PKCE; only configured owner gets session', async () => {
  const env = environment();
  const response = await worker.fetch(request('/auth/login'), env);
  const target = new URL(response.headers.get('Location'));
  assert.equal(target.origin, 'https://github.com');
  assert.equal(target.searchParams.get('scope'), '');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  const state = target.searchParams.get('state');
  const flowCookie = '__Host-pm_flow=' + state;
  assert.equal((await worker.fetch(request('/auth/callback?state=' + state + '&code=test'), env)).status, 400);
  const originalFetch = globalThis.fetch;
  let requestedVerifier;
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/access_token')) { requestedVerifier = JSON.parse(init.body).code_verifier; return Response.json({access_token: 'test'}); }
    return Response.json({id: ownerId});
  };
  try {
    const callback = request('/auth/callback?state=' + state + '&code=test', {headers: {Cookie: flowCookie}});
    const result = await worker.fetch(callback, env);
    assert.equal(result.status, 302);
    assert.equal(result.headers.get('Location'), '/admin');
    const computed = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(requestedVerifier))).toString('base64url');
    assert.equal(computed, target.searchParams.get('code_challenge'));
    const sessionCookie = result.headers.getSetCookie().find(value => value.startsWith('__Host-pm_session='));
    assert.match(sessionCookie, /HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await worker.fetch(request('/api/dashboard', {headers: {Cookie: sessionCookie.split(';')[0]}}), env)).status, 200);
    assert.equal((await worker.fetch(callback, env)).status, 400);
    globalThis.fetch = async url => Response.json(url.endsWith('/access_token') ? {access_token: 'test'} : {id: 42});
    const newFlow = await worker.fetch(request('/auth/login'), env);
    const newState = new URL(newFlow.headers.get('Location')).searchParams.get('state');
    assert.equal((await worker.fetch(request('/auth/callback?state=' + newState + '&code=test', {headers: {Cookie: '__Host-pm_flow=' + newState}}), env)).status, 403);
  } finally { globalThis.fetch = originalFetch; env.sqlite.close(); }
});

test('report upload is write-only, validates token, and preserves newer reports', async () => {
  const env = environment();
  const payload = {health: {checked_at: '2026-11-12T00:00:00Z', issues: [], sources: {}, status: 'ok'}, counts: {stamps: 23, commemorative: 45, scenic: 413}};
  const send = (token, value = payload) => worker.fetch(request('/api/report', {method: 'POST', headers: {Authorization: 'Bearer ' + token}, body: JSON.stringify(value)}), env);
  assert.equal((await send(hex('b'))).status, 401);
  assert.equal((await send(env.REPORT_TOKEN)).status, 200);
  const older = structuredClone(payload); older.health.checked_at = '2026-11-11T00:00:00Z';
  assert.equal((await send(env.REPORT_TOKEN, older)).status, 200);
  const row = await env.DB.prepare('SELECT payload FROM reports WHERE id=1').first();
  assert.equal(JSON.parse(row.payload).health.checked_at, payload.health.checked_at);
  assert.equal((await worker.fetch(request('/api/report', {headers: {Authorization: 'Bearer ' + env.REPORT_TOKEN}}), env)).status, 404);
  env.sqlite.close();
});

test('view collection has no public read API, deduplicates retries, and hashes visitors', async () => {
  const env = environment();
  const event = {id: 'a'.repeat(32), visitor: 'b'.repeat(32), page: 'scenic'};
  const send = (source = 'https://zhuya-tw.github.io') => worker.fetch(request('/api/view', {method: 'POST', headers: {Origin: source, 'Content-Type': 'application/json'}, body: JSON.stringify(event)}), env);
  assert.equal((await send('https://example.invalid')).status, 403);
  assert.equal((await send()).status, 204);
  assert.equal((await send()).status, 204);
  const row = await env.DB.prepare('SELECT * FROM pageviews').first();
  assert.notEqual(row.visitor_hash, event.visitor);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM pageviews').first()).n, 1);
  assert.equal((await worker.fetch(request('/api/view'), env)).status, 404);
  assert.equal((await worker.fetch(request('/api/dashboard'), env)).status, 401);
  env.sqlite.close();
});
