import assert from 'node:assert/strict';
const url = 'http://127.0.0.1:4317';
async function act(action, code = 200) {
  const response = await fetch(`${url}/api/action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
  });
  assert.equal(response.status, code, `${action}: unexpected response`);
  const data = await response.json();
  return data.state ?? data;
}
assert.equal((await fetch(url)).status, 200);
await act('reset');
assert.equal((await act('redeem', 422)).status, 'Не выпущен');
assert.equal((await act('issue')).owner, 'Алиса');
await act('issue', 422);
await act('authorizeAlice');
assert.equal((await act('transfer')).authorization, null);
await act('authorizeAlice', 422);
await act('redeem', 422);
assert.equal((await act('authorizeBob')).authorization.owner, 'Боб');
assert.equal((await act('redeem')).status, 'Использован');
await act('redeem', 422);
await act('reset');
await act('issue');
assert.equal((await act('revoke')).status, 'Отменён');
await act('transfer', 422);
await act('authorizeAlice', 422);
await act('reset');
const forbidden = await fetch(`${url}/api/action`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.org' }, body: JSON.stringify({ action: 'issue' }),
});
assert.equal(forbidden.status, 403);
const invalid = await fetch(`${url}/api/action`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
});
assert.equal(invalid.status, 400);
console.log('UI API smoke passed: issue, ownership change, stale permission, admission, replay, revocation, reset, origin and JSON checks.');
