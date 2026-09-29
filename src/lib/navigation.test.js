import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_PAGES, pageFromSearch, urlForPage, resolveView, isPublicView } from './navigation.js';

test('pageFromSearch reads known pages and falls back for unknown ones', () => {
  assert.equal(pageFromSearch('?page=tutor'), 'tutor');
  assert.equal(pageFromSearch('?page=signin'), 'signin');
  assert.equal(pageFromSearch('?page=nowhere'), 'dashboard');
  assert.equal(pageFromSearch(''), 'dashboard');
});

test('urlForPage sets ?page= and drops it again for the dashboard', () => {
  assert.equal(urlForPage('https://app.test/?page=tutor', 'dashboard'), '/');
  assert.equal(urlForPage('https://app.test/', 'study'), '/?page=study');
  assert.equal(urlForPage('https://app.test/?page=study', 'tutor'), '/?page=tutor');
});

test('signed-in visitors get app pages and never the marketing page', () => {
  assert.equal(resolveView({ page: 'tutor', signedIn: true }), 'tutor');
  assert.equal(resolveView({ page: 'landing', signedIn: true }), 'dashboard');
  // Landing and sign-in bounce to the dashboard once the session is live.
  assert.equal(resolveView({ page: 'signin', signedIn: true }), 'dashboard');
  assert.equal(resolveView({ signedIn: true }), 'dashboard');
});

test('signed-out visitors start on the landing page', () => {
  assert.equal(resolveView({ page: 'dashboard' }), 'landing');
  assert.equal(resolveView({ page: 'tutor' }), 'landing');
  assert.equal(resolveView({ page: 'landing' }), 'landing');
});

test('a guest session unlocks the app while sign-in stays reachable', () => {
  assert.equal(resolveView({ page: 'dashboard', guest: true }), 'dashboard');
  assert.equal(resolveView({ page: 'study', guest: true }), 'study');
  assert.equal(resolveView({ page: 'signin', guest: true }), 'signin');
});

test('nothing is rendered until accounts have resolved', () => {
  assert.equal(resolveView({ page: 'dashboard', ready: false }), 'loading');
  assert.equal(resolveView({ page: 'landing', ready: false }), 'loading');
});

test('the tutor is an app page, the landing page is not', () => {
  assert.ok(APP_PAGES.includes('tutor'));
  assert.equal(isPublicView('landing'), true);
  assert.equal(isPublicView('tutor'), false);
});
