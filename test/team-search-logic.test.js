const test = require('node:test');
const assert = require('node:assert/strict');

const teamSearch = require('../../frontend/js/team-search.js');

const originalWindow = global.window;
const originalDocument = global.document;

test('makeSafeTeamName normalizes Birmingham City consistently', () => {
  assert.equal(teamSearch.makeSafeTeamName('Birmingham City'), 'birmingham-city');
  assert.equal(teamSearch.makeSafeTeamName('  Birmingham   City  '), 'birmingham-city');
});

test('manual team fallback preserves user-entered team name', () => {
  const result = teamSearch.buildManualTeamResult('Birmingham City');
  assert.equal(result.name, 'Birmingham City');
  assert.equal(result.logo, null);
  assert.equal(result.source, 'manual');
});

test('duplicate rapid searches are treated as the same request', () => {
  assert.equal(teamSearch.shouldSkipSearchRequest('Manchester United', 'manchester united'), true);
  assert.equal(teamSearch.shouldSkipSearchRequest('Manchester United', 'Manchester United'), true);
  assert.equal(teamSearch.shouldSkipSearchRequest('Manchester United', 'Manchester City'), false);
});

test('debounced team search waits for a pause before firing', async () => {
  let calls = 0;
  const debounce = teamSearch.createDebouncedSearch(() => {
    calls += 1;
  }, 1000);

  debounce('P');
  debounce('Pa');
  debounce('Par');

  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(calls, 0);

  await new Promise(resolve => setTimeout(resolve, 800));
  assert.equal(calls, 1);
});

test('local frontend defaults to the local backend URL', () => {
  global.window = {
    location: { hostname: 'localhost', search: '' },
    addEventListener: () => {},
    supabaseClient: null
  };
  global.document = {
    readyState: 'complete',
    addEventListener: () => {},
    head: { appendChild: () => {} },
    body: { insertAdjacentElement: () => {} },
    getElementById: () => null
  };

  delete require.cache[require.resolve('../../frontend/js/api-config.js')];
  const apiConfig = require('../../frontend/js/api-config.js');

  assert.equal(apiConfig.BACKEND_URL, 'http://localhost:5000');
  assert.equal(apiConfig.API_BASE_URL, 'http://localhost:5000/api');

  global.window = originalWindow;
  global.document = originalDocument;
});
