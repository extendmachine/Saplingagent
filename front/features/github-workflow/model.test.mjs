import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRepository, projectPaths, selectFeature } from './model.ts';
import { workflowMessages, workflowText } from './messages.ts';

test('repository, branch, file and SSH links resolve to the same repository', () => {
  const expected = { owner: 'acme', name: 'my-app', url: 'https://github.com/acme/my-app' };
  for (const link of ['https://github.com/acme/my-app', 'https://github.com/acme/my-app.git/', 'https://github.com/acme/my-app/tree/main/app', 'https://github.com/acme/my-app/blob/main/README.md', 'git@github.com:acme/my-app.git']) {
    assert.deepEqual(parseRepository(link), expected);
  }
});
test('lookalike hosts, embedded credentials, invalid paths and non-HTTPS links are rejected', () => {
  for (const link of ['', 'javascript:alert(1)', 'http://github.com/acme/app', 'https://github.com.evil.test/acme/app', 'https://github.com@evil.test/acme/app', 'https://user:password@github.com/acme/app', 'https://github.com:8443/acme/app', 'https://github.com/acme', 'https://github.com/acme/app/unknown', 'https://gist.github.com/acme/123']) {
    assert.equal(parseRepository(link), null, link);
  }
});
test('owners remain distinct and reference source is separate from generated application', () => {
  const first = projectPaths(parseRepository('https://github.com/acme/app'));
  const second = projectPaths(parseRepository('https://github.com/other/app'));
  assert.equal(first.source, 'projeccts/acme--app/source');
  assert.equal(first.output, 'projeccts/acme--app/saplingagent');
  assert.notEqual(first.root, second.root);
});
test('selecting an export includes its required core; removing core clears dependent features', () => {
  assert.deepEqual(selectFeature([], 'export'), ['core', 'export']);
  assert.deepEqual(selectFeature(['core', 'templates', 'preview', 'export'], 'core'), ['templates']);
  assert.deepEqual(selectFeature(['core', 'preview'], 'preview'), ['core']);
});
test('all prototype resources provide keyed English and Chinese strings', () => {
  for (const [key, messages] of Object.entries(workflowMessages)) {
    assert.equal(messages.length, 2, key);
    assert.ok(messages.every(value => typeof value === 'string' && value.trim()), key);
    assert.equal(workflowText('en', key), messages[0]);
    assert.equal(workflowText('zh', key), messages[1]);
  }
});
