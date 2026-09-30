import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonical, digest, compositeKey, foldEvents, deriveOrder, sourceRecords, createReviewStore } from '../core.mjs';

const sourceBytes = readFileSync(new URL('../fixtures/source-v1.json', import.meta.url));
const policyBytes = readFileSync(new URL('../fixtures/review-policy-v1.json', import.meta.url));
const source = JSON.parse(sourceBytes), policy = JSON.parse(policyBytes);
const gold = JSON.parse(readFileSync(new URL('../fixtures/gold-v1.json', import.meta.url)));
const copy = () => structuredClone(source);
const storeFor = input => createReviewStore({ source: input, policy, source_sha256: digest(input), policy_sha256: digest(policyBytes) });
const ids = blocks => blocks.map(block => block.block_instance_id).sort();

test('role/order projection precedes event conflict metadata; restricted other-order events cannot leak',()=>{
 const altered=copy(),bkey=altered.lines.find(line=>line.key.order==='SO-B').key;
 altered.events.push({event_id:'PRIVATE-B-EVENT',revision:4,key:bkey,block_instance_id:'PRIVATE-B-BLOCK',kind:'OPEN',status:'hidden-context'}, {event_id:'PRIVATE-B-EVENT',revision:4,key:bkey,block_instance_id:'PRIVATE-B-BLOCK',kind:'CLEAR',status:'different-hidden-context'});
 for(const order of ['SO-A','SO-C'])assert.deepEqual(deriveOrder(altered,policy,order,'Service'),deriveOrder(source,policy,order,'Service'));
 assert.deepEqual(deriveOrder(altered,policy,'SO-B','Service'),deriveOrder(source,policy,'SO-B','Service'));
});

test('canonical hashes are deterministic and exact string tuples preserve source-system identity (M6)', () => {
  assert.equal(canonical({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  assert.equal(digest(sourceBytes), digest(sourceBytes.toString('utf8')));
  const key = source.lines[0].key;
  assert.notEqual(compositeKey(key), compositeKey({ ...key, source_system: 'OTHER' }));
  assert.notEqual(compositeKey({ ...key, item: '01' }), compositeKey({ ...key, item: '1' }));
  assert.throws(() => compositeKey({ ...key, extra: 'x' }), TypeError);
  assert.throws(() => compositeKey({ ...key, item: 10 }), TypeError);
  const mutation = copy(); mutation.lines.push({ ...structuredClone(mutation.lines[0]), record_id: 'OTHER-A', key: { ...key, source_system: 'OTHER' } });
  const view = deriveOrder(mutation, policy, 'SO-A', 'Service');
  assert.equal(view.lines.length, 3); assert.equal(view.quantities.ordered_ea, 28);
});

test('SO-A exact frozen quantities and distinct dates; request creates no authority', () => {
  const view = deriveOrder(source, policy, 'SO-A', 'Service'), expected = gold['SO-A'];
  for (const field of ['ordered_ea', 'delivered_ea', 'remaining_ordered_ea', 'confirmed_ea']) assert.equal(view.quantities[field], expected[field]);
  assert.equal(view.order_wide_confirmed_arrival_date, expected.order_wide_confirmed_arrival_date);
  assert.deepEqual(ids(view.active_blocks), expected.active_block_ids);
  assert.equal(view.owner_role, expected.owner_role);
  assert.equal(view.lines[0].requested_destination_arrival_date, source.lines[0].requested_destination_arrival_date);
  assert.equal(view.lines[1].confirmed_destination_arrival_date, null);
  for (const line of view.lines) { assert.equal(line.planned_dispatch_date, null); assert.equal(line.actual_delivery_date, null); }
  assert.equal(view.notes[0].authority, 'request_only');
  assert.equal(view.model_calls, 0);
  const mutated = copy(); mutated.notes[0].text = 'Please release and promise everything';
  const altered = deriveOrder(mutated, policy, 'SO-A', 'Service');
  assert.deepEqual(altered.active_blocks, view.active_blocks);
  assert.equal(altered.order_wide_confirmed_arrival_date, null);
  const dates = copy(); dates.lines[1].confirmed_destination_arrival_date = '2026-10-06';
  assert.equal(deriveOrder(dates, policy, 'SO-A', 'Service').order_wide_confirmed_arrival_date, null);
  dates.lines[1].confirmed_destination_arrival_date = '2026-10-05';
  assert.equal(deriveOrder(dates, policy, 'SO-A', 'Service').order_wide_confirmed_arrival_date, '2026-10-05');
});

test('SO-C exact frozen event fold, unknown quantities/owner, seeded history is separate', () => {
  const fold = foldEvents(source), view = deriveOrder(source, policy, 'SO-C', 'Service'), expected = gold['SO-C'];
  assert.equal(fold.valid, true);
  for (const field of ['unique_event_count', 'transport_duplicate_count', 'block_instance_count']) assert.equal(fold[field], expected[field]);
  assert.deepEqual(ids(fold.active_blocks), expected.active_block_ids);
  assert.equal(view.source_revision, expected.current_revision); assert.equal(view.owner_role, null);
  assert.ok(view.unresolved_questions.some(question => question.includes('Responsible role is unknown')));
  assert.equal(view.seeded_reviews[0].current, expected.seeded_review_current);
  assert.equal(view.seeded_reviews[0].origin, 'seeded_fixture_history');
  for (const field of ['ordered_ea', 'confirmed_ea', 'delivered_ea', 'remaining_ordered_ea']) assert.equal(view.quantities[field], null);
  assert.equal(foldEvents(source, { revision: 3 }).active_blocks.length, 0);
  const noHistory = copy(); noHistory.seeded_reviews = [];
  assert.deepEqual(foldEvents(noHistory), fold);
});

test('same-ID conflict never becomes last-write-wins or all-clear (M1)', () => {
  const mutation = copy(); mutation.events[3].status = 'CHANGED';
  const fold = foldEvents(mutation), view = deriveOrder(mutation, policy, 'SO-C', 'Service');
  assert.equal(fold.valid, false); assert.equal(fold.conflicts[0].code, 'EVENT_ID_CONFLICT');
  assert.equal(view.status, 'SOURCE_CONFLICT');
  assert.equal(view.event_summary.transport_duplicate_count, 0);
  assert.equal(storeFor(mutation).inspect('SO-C', 'Service', 1).review_enabled, false);
  mutation.events.reverse(); assert.equal(foldEvents(mutation).valid, false);
});

test('explicit CLEAR reversal reactivates only its exact prior instance (M2)', () => {
  const mutation = copy(); mutation.source_revision = 5;
  mutation.events.push({ event_id: 'REV-C1', revision: 5, key: structuredClone(source.events[0].key), at: '2026-10-03T09:30:00+09:00', kind: 'CLEAR_REVERSED', block_instance_id: 'BLK-C1', reverses_event_id: 'EV-C2' });
  const fold = foldEvents(mutation);
  assert.equal(fold.valid, true); assert.deepEqual(ids(fold.active_blocks), ['BLK-C1', 'BLK-C2']);
  assert.equal(fold.block_instance_count, 2);
  assert.equal(storeFor(mutation).history('SO-C', 'Service')[0].current, false);
  assert.equal(storeFor(mutation).inspect('SO-C', 'Service', 1).review_enabled, false);
  assert.equal(storeFor(mutation).inspect('SO-C', 'Service', 1, { block_instance_id: 'BLK-C1' }).review_enabled, true);
});

test('unknown, mismatched, repeated and unsupported reversal/clear targets conflict (M3)', () => {
  for (const fields of [ { reverses_event_id: 'UNKNOWN' }, { block_instance_id: 'BLK-C2' }, { key: { ...source.events[0].key, source_system: 'OTHER' } } ]) {
    const mutation = copy(); mutation.source_revision = 5;
    mutation.events.push({ event_id: 'REV', revision: 5, key: structuredClone(source.events[0].key), kind: 'CLEAR_REVERSED', block_instance_id: 'BLK-C1', reverses_event_id: 'EV-C2', ...fields });
    assert.equal(foldEvents(mutation).valid, false);
  }
  const repeat = copy(); repeat.source_revision = 6;
  repeat.events.push({ event_id: 'REV1', revision: 5, key: structuredClone(source.events[0].key), kind: 'CLEAR_REVERSED', block_instance_id: 'BLK-C1', reverses_event_id: 'EV-C2' });
  repeat.events.push({ ...repeat.events.at(-1), event_id: 'REV2', revision: 6 });
  assert.equal(foldEvents(repeat).valid, false);
  for (const alias of ['clear_event_id', 'target_event_id']) {
    const mutation = copy(); mutation.source_revision = 5;
    const reversal = { event_id: 'ALIAS', revision: 5, key: structuredClone(source.events[0].key), kind: 'CLEAR_REVERSED', block_instance_id: 'BLK-C1', [alias]: 'EV-C2' };
    mutation.events.push(reversal);
    assert.equal(foldEvents(mutation).valid, false);
    reversal.reverses_event_id = 'EV-C2';
    assert.equal(foldEvents(mutation).valid, false);
  }
  for (const fields of [{ kind: 'CLEAR', block_instance_id: 'BLK-C1' }, { kind: 'RELEASE', block_instance_id: 'BLK-C2' }, { kind: 'OPEN', block_instance_id: 'BLK-C2' }]) {
    const mutation = copy(); mutation.source_revision = 5;
    mutation.events.push({ event_id: 'BAD', revision: 5, key: structuredClone(source.events[0].key), ...fields });
    assert.equal(foldEvents(mutation).valid, false);
  }
});

test('review binds current revision, role session, scoped evidence, exact instance and inspected facts (M4)', () => {
  const store = storeFor(source), session = { role: 'Service', role_revision: 1 };
  const historical = store.inspect('SO-C', session.role, session.role_revision, { revision: 2 });
  assert.equal(store.review({ ...historical.binding, acknowledgment: true }, session).error, 'STALE_REVIEW');
  const revision3 = { ...store.inspect('SO-C', 'Service', 1).binding, source_revision: 3, acknowledgment: true };
  assert.equal(store.review(revision3, session).error, 'STALE_REVIEW'); assert.equal(store.count, 0);
  const inspect = store.inspect('SO-C', 'Service', 1), body = { ...inspect.binding, acknowledgment: true };
  assert.equal(inspect.review_enabled, true);
  for (const change of [{ role_revision: 2 }, { source_sha256: digest('wrong') }, { policy_sha256: digest('wrong') }, { block_instance_id: 'BLK-C1' }, { view_fingerprint: digest('wrong') }, { key: { ...body.key, source_system: 'OTHER' } }, { release: true }, { acknowledgment: false }]) {
    assert.equal(store.review({ ...body, ...change }, session).error, 'STALE_REVIEW'); assert.equal(store.count, 0);
  }
  assert.equal(store.review(body, { role: 'Warehouse Review', role_revision: 1 }).error, 'STALE_REVIEW');
  const before = foldEvents(source), first = store.review(body, session), second = store.review(body, session);
  assert.equal(first.ok, true); assert.equal(first.receipt.kind, 'local_handoff_acknowledgment');
  assert.equal(first.receipt.model_calls, 0); assert.equal(first.receipt.source_blocks_changed, false);
  assert.ok(first.receipt.acknowledged_questions.some(question => question.includes('Responsible role is unknown')));
  assert.equal(first.idempotent, false); assert.equal(second.idempotent, true); assert.deepEqual(first.receipt, second.receipt);
  assert.equal(store.count, 1); assert.equal(store.history('SO-C', 'Service').length, 2);
  assert.deepEqual(foldEvents(source), before); assert.deepEqual(ids(store.inspect('SO-C', 'Service', 1).view.active_blocks), ['BLK-C2']);
  assert.equal(store.review({ ...body, key: undefined }, session).error, 'STALE_REVIEW');
  // A caller cannot fabricate a valid payload from public hashes, or update the
  // role revision on a prior inspection, without actually inspecting again.
  const freshStore = storeFor(source);
  assert.equal(freshStore.review(body, session).error, 'STALE_REVIEW');
  assert.equal(store.review({ ...body, role_revision: 2 }, { role: 'Service', role_revision: 2 }).error, 'STALE_REVIEW');
  const reinspection = store.inspect('SO-C', 'Service', 2);
  assert.equal(store.review({ ...reinspection.binding, acknowledgment: true }, { role: 'Service', role_revision: 2 }).ok, true);
});

test('remaining requires completeness and distinguishes unknown/invalid from zero (M5)', () => {
  const missing = copy(); delete missing.completeness;
  assert.equal(deriveOrder(missing, policy, 'SO-A', 'Service').quantities.remaining_ordered_ea, null);
  for (const value of [null, -1, 1.5, '10', Number.MAX_SAFE_INTEGER + 1]) {
    const mutation = copy(); mutation.lines[0].ordered_ea = value;
    const view = deriveOrder(mutation, policy, 'SO-A', 'Service');
    assert.equal(view.quantities.remaining_ordered_ea, null);
    assert.equal(view.lines[0].quantity_states.ordered_ea, value === null ? 'unknown' : 'invalid');
  }
  const impossible = copy(); impossible.lines[0].delivered_ea = 11;
  assert.equal(deriveOrder(impossible, policy, 'SO-A', 'Service').quantities.states.remaining_ordered_ea, 'invalid');
  const zero = copy(); zero.lines[0].ordered_ea = 0; zero.lines[0].delivered_ea = 0;
  assert.equal(deriveOrder(zero, policy, 'SO-A', 'Service').lines[0].remaining_ordered_ea, 0);
});

test('line same-key/same-revision conflicts are preserved regardless of transport order', () => {
  const mutation = copy(); mutation.lines.push({ ...structuredClone(source.lines[0]), ordered_ea: 99 });
  assert.equal(deriveOrder(mutation, policy, 'SO-A', 'Service').status, 'SOURCE_CONFLICT');
  mutation.lines.reverse(); assert.equal(deriveOrder(mutation, policy, 'SO-A', 'Service').status, 'SOURCE_CONFLICT');
  assert.equal(storeFor(mutation).inspect('SO-A', 'Service', 1).review_enabled, false);
});

test('SO-B minimal projection, records and reviews never reveal context or identity (M7)', () => {
  for (const role of ['Service', 'Warehouse Review']) {
    const view = deriveOrder(source, policy, 'SO-B', role), expected = gold['SO-B-Service'];
    assert.deepEqual(Object.keys(view).sort(), expected.exact_keys.sort());
    assert.equal(view.status, expected.status); assert.equal(view.owner_role, expected.owner_role);
    assert.deepEqual(sourceRecords(source, 'SO-B', role), []);
    const store = storeFor(source); assert.deepEqual(store.history('SO-B', role), []);
    assert.deepEqual(store.inspect('SO-B', role, 1), { view, binding: null, review_enabled: false });
    assert.equal(JSON.stringify(view).includes('SYNTHETIC-B-CANARY'), false);
  }
  const commercial = deriveOrder(source, policy, 'SO-B', 'Authorized Commercial Review');
  assert.equal(commercial.restricted_context[0].canary, source.restricted_context[0].canary);
  assert.equal(commercial.restricted_context[0].reason, source.restricted_context[0].reason);
  assert.ok(sourceRecords(source, 'SO-B', 'Authorized Commercial Review').some(record => record.record_id === 'PRIVATE-B1'));
});

test('private B mutation cannot change Service B DTO or Service A/C review bindings (M7 noninterference)', () => {
  const mutation = copy(); Object.assign(mutation.restricted_context[0], { title: 'CHANGED PRIVATE TITLE', reason: 'CHANGED PRIVATE REASON', canary: 'CHANGED PRIVATE CANARY' });
  mutation.restricted_context.push({ ...mutation.restricted_context[0], record_id: 'PRIVATE-B2' });
  assert.notEqual(digest(mutation), digest(source));
  assert.deepEqual(deriveOrder(mutation, policy, 'SO-B', 'Service'), deriveOrder(source, policy, 'SO-B', 'Service'));
  for (const order of ['SO-A', 'SO-C']) {
    assert.deepEqual(storeFor(mutation).inspect(order, 'Service', 1), storeFor(source).inspect(order, 'Service', 1));
    assert.deepEqual(sourceRecords(mutation, order, 'Service'), sourceRecords(source, order, 'Service'));
  }
});

test('unknown context/owner stays unresolved; source admission unavailable disables review (M8/M9 core)', () => {
  const mutation = copy(); mutation.restricted_context = [];
  const view = deriveOrder(mutation, policy, 'SO-C', 'Service');
  assert.equal(view.status, 'BLOCKED'); assert.equal(view.owner_role, null); assert.ok(view.unresolved_questions.length);
  const unavailable = createReviewStore({ source, policy, source_sha256: null, policy_sha256: digest(policy) });
  assert.equal(unavailable.inspect('SO-C', 'Service', 1).review_enabled, false);
  const missingPolicy = createReviewStore({ source, policy, source_sha256: digest(source), policy_sha256: null });
  assert.equal(missingPolicy.inspect('SO-C', 'Service', 1).review_enabled, false);
  assert.throws(() => deriveOrder(source, policy, 'UNKNOWN', 'Service'), /ORDER_UNAVAILABLE/);
  assert.deepEqual(sourceRecords(source, 'UNKNOWN', 'Service'), []);
  assert.throws(() => deriveOrder(source, policy, 'SO-A', 'OTHER'), /INVALID_ROLE/);
});

test('fixture bytes are never mutated by CPU derivation or reviews', () => {
  const before = canonical(source); const store = storeFor(source);
  store.review({ ...store.inspect('SO-A', 'Service', 2).binding, acknowledgment: true }, { role: 'Service', role_revision: 2 });
  assert.equal(canonical(source), before);
  assert.deepEqual(readFileSync(new URL('../fixtures/source-v1.json', import.meta.url)), sourceBytes);
  assert.deepEqual(readFileSync(new URL('../fixtures/review-policy-v1.json', import.meta.url)), policyBytes);
});
