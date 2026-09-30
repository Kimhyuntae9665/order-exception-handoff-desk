import { createHash } from 'node:crypto';

const KEY_FIELDS = ['source_system', 'order', 'item', 'schedule_line'];
const ROLES = ['Service', 'Warehouse Review', 'Authorized Commercial Review'];
const DATE_FIELDS = ['requested_destination_arrival_date', 'confirmed_destination_arrival_date', 'planned_dispatch_date', 'actual_delivery_date'];
const BINDING_FIELDS = ['source_revision', 'source_sha256', 'policy_sha256', 'role', 'role_revision', 'key', 'block_instance_id', 'view_fingerprint'];
const clone = value => structuredClone(value);
const fail = code => { const error = new Error(code); error.code = code; throw error; };

export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  throw new TypeError('Canonical values must be JSON values');
}

export function digest(valueOrBytes) {
  const bytes = typeof valueOrBytes === 'string' || valueOrBytes instanceof Uint8Array ? valueOrBytes : canonical(valueOrBytes);
  return createHash('sha256').update(bytes).digest('hex');
}

export function compositeKey(key) {
  if (!key || Object.keys(key).length !== 4 || KEY_FIELDS.some(field => typeof key[field] !== 'string')) {
    throw new TypeError('Schedule key requires exactly four string fields');
  }
  return canonical(KEY_FIELDS.map(field => key[field]));
}

function checkRevision(source, revision) {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > source.source_revision) fail('INVALID_REVISION');
}

function isMinimal(order, role, policy) {
  return order === 'SO-B' && (policy?.so_b_minimal_projection?.roles ?? ['Service', 'Warehouse Review']).includes(role);
}

function checkRole(role, policy) {
  if (!(policy?.roles ?? ROLES).includes(role)) fail('INVALID_ROLE');
}

// IDs are immutable source identities. Exact transport copies are never events.
export function foldEvents(source, { revision = source.source_revision } = {}) {
  checkRevision(source, revision);
  const byId = new Map();
  const conflicts = [];
  let transport_duplicate_count = 0;
  for (const raw of source.events ?? []) {
    if (raw.revision > revision) continue;
    if (!Number.isSafeInteger(raw.revision) || typeof raw.event_id !== 'string') {
      conflicts.push({ code: 'INVALID_EVENT', event_id: raw.event_id ?? null }); continue;
    }
    const previous = byId.get(raw.event_id);
    if (previous) {
      if (canonical(previous) === canonical(raw)) transport_duplicate_count++;
      else conflicts.push({ code: 'EVENT_ID_CONFLICT', event_id: raw.event_id });
    } else byId.set(raw.event_id, clone(raw));
  }
  const events = [...byId.values()].sort((a, b) => a.revision - b.revision || String(a.at).localeCompare(String(b.at)) || a.event_id.localeCompare(b.event_id));
  const instances = new Map();
  const clears = new Map();
  for (const event of events) {
    let key;
    try { key = compositeKey(event.key); } catch { conflicts.push({ code: 'INVALID_KEY', event_id: event.event_id }); continue; }
    if (typeof event.block_instance_id !== 'string' || !event.block_instance_id) {
      conflicts.push({ code: 'INVALID_INSTANCE', event_id: event.event_id }); continue;
    }
    const identity = canonical([key, event.block_instance_id]);
    const instance = instances.get(identity);
    const conflict = code => conflicts.push({ code, event_id: event.event_id });
    if (event.kind === 'OPEN') {
      if (instance) { conflict('INSTANCE_REOPEN_CONFLICT'); continue; }
      instances.set(identity, { key: clone(event.key), block_instance_id: event.block_instance_id,
        status: event.status ?? 'ORDER_EXCEPTION', owner_role: event.owner_role ?? null,
        opened_at: event.at ?? null, opened_event_id: event.event_id, active: true, clear_event_id: null });
    } else if (event.kind === 'CLEAR') {
      if (!instance?.active) { conflict('INVALID_CLEAR_TARGET'); continue; }
      instance.active = false; instance.clear_event_id = event.event_id;
      clears.set(event.event_id, { identity, reversed: false });
    } else if (event.kind === 'CLEAR_REVERSED') {
      const allowed = ['event_id', 'revision', 'key', 'at', 'kind', 'block_instance_id', 'reverses_event_id'];
      if (typeof event.reverses_event_id !== 'string' || Object.keys(event).some(field => !allowed.includes(field))) {
        conflict('INVALID_REVERSAL_PAYLOAD'); continue;
      }
      const target = event.reverses_event_id;
      const clear = clears.get(target);
      if (!clear || clear.identity !== identity || clear.reversed || !instance || instance.active || instance.clear_event_id !== target) {
        conflict('INVALID_REVERSAL_TARGET'); continue;
      }
      clear.reversed = true; instance.active = true; instance.clear_event_id = null;
    } else conflict('UNSUPPORTED_EVENT_KIND');
  }
  const all = [...instances.values()];
  return { valid: conflicts.length === 0, conflicts, events, instances: all,
    active_blocks: all.filter(block => block.active), unique_event_count: events.length,
    transport_duplicate_count, block_instance_count: all.length, revision };
}

function quantity(value) {
  if (value === null || value === undefined) return { value: null, state: 'unknown' };
  return Number.isSafeInteger(value) && value >= 0 ? { value, state: 'known' } : { value: null, state: 'invalid' };
}

function normalizeLine(raw, complete) {
  const ordered = quantity(raw.ordered_ea), confirmed = quantity(raw.confirmed_ea), delivered = quantity(raw.delivered_ea);
  if (ordered.state === 'known' && delivered.state === 'known' && delivered.value > ordered.value) delivered.state = 'invalid';
  const remaining = ordered.state === 'invalid' || delivered.state === 'invalid'
    ? { value: null, state: 'invalid' }
    : complete && ordered.state === 'known' && delivered.state === 'known'
      ? { value: ordered.value - delivered.value, state: 'known' } : { value: null, state: 'unknown' };
  const quantities = { ordered_ea: ordered, confirmed_ea: confirmed, delivered_ea: delivered, remaining_ordered_ea: remaining };
  return { record_id: raw.record_id, revision: raw.revision, key: clone(raw.key),
    ...Object.fromEntries(Object.entries(quantities).map(([field, q]) => [field, q.state === 'known' ? q.value : null])),
    quantity_states: Object.fromEntries(Object.entries(quantities).map(([field, q]) => [field, q.state])),
    ...Object.fromEntries(DATE_FIELDS.map(field => [field, raw[field] ?? null])) };
}

function lineSnapshots(source, order, revision) {
  const latest = new Map(), versions = new Map(), conflicts = [];
  for (const line of source.lines ?? []) {
    if (line.key?.order !== order || line.revision > revision) continue;
    let key;
    try { key = compositeKey(line.key); } catch { conflicts.push({ code: 'INVALID_LINE_KEY', record_id: line.record_id }); continue; }
    if (!Number.isSafeInteger(line.revision)) { conflicts.push({ code: 'INVALID_LINE_REVISION', record_id: line.record_id }); continue; }
    const versionKey = canonical([key, line.revision]);
    if (versions.has(versionKey) && canonical(versions.get(versionKey)) !== canonical(line)) conflicts.push({ code: 'LINE_REVISION_CONFLICT', key: clone(line.key) });
    else versions.set(versionKey, line);
    const previous = latest.get(key);
    if (!previous || previous.revision < line.revision) latest.set(key, line);
  }
  return { lines: [...latest.values()], conflicts };
}

export function deriveOrder(source, policy, order, role, { revision = source.source_revision } = {}) {
  checkRole(role, policy); checkRevision(source, revision);
  if (!policy.known_orders.includes(order)) fail('ORDER_UNAVAILABLE');
  // Project before constructing source-derived metadata or fingerprints.
  if (isMinimal(order, role, policy)) {
    return { status: 'CREDIT_REVIEW_BLOCK', owner_role: 'Authorized Commercial Review' };
  }
  const snapshots = lineSnapshots(source, order, revision);
  const fold = foldEvents({ ...source, events: (source.events ?? []).filter(event => event.key?.order === order) }, { revision });
  const rawLines = snapshots.lines;
  const complete = source.completeness?.no_omitted_cancellation_or_delivery_reversal_records === true;
  const lines = rawLines.map(line => normalizeLine(line, complete));
  const quantities = { states: {} };
  for (const field of ['ordered_ea', 'confirmed_ea', 'delivered_ea', 'remaining_ordered_ea']) {
    const states = lines.map(line => line.quantity_states[field]);
    const state = states.includes('invalid') ? 'invalid' : !states.length || states.includes('unknown') ? 'unknown' : 'known';
    quantities.states[field] = state;
    quantities[field] = state === 'known' ? lines.reduce((sum, line) => sum + line[field], 0) : null;
    if (quantities[field] !== null && !Number.isSafeInteger(quantities[field])) { quantities[field] = null; quantities.states[field] = 'invalid'; }
  }
  const snapshotBlocks = rawLines.flatMap(line => (line.snapshot_blocks ?? []).map(block => ({ ...clone(block), key: clone(line.key), active: true, origin: 'snapshot' })));
  const active_blocks = [...snapshotBlocks, ...fold.active_blocks.filter(block => block.key.order === order)];
  const events = fold.events.filter(event => event.key?.order === order);
  const instances = fold.instances.filter(block => block.key.order === order);
  const seenEvents = new Map();
  let transportDuplicateCount = 0;
  for (const event of source.events ?? []) {
    if (event.key?.order !== order || event.revision > revision) continue;
    if (seenEvents.has(event.event_id)) {
      if (canonical(seenEvents.get(event.event_id)) === canonical(event)) transportDuplicateCount++;
    } else seenEvents.set(event.event_id, event);
  }
  const conflicts = [...snapshots.conflicts, ...fold.conflicts];
  const unresolved_questions = [];
  if (conflicts.length) unresolved_questions.push('Source conflicts require resolution before a current handoff can be acknowledged.');
  if (!lines.length) unresolved_questions.push('Schedule line source is unavailable.');
  for (const line of lines) {
    for (const [field, state] of Object.entries(line.quantity_states)) if (state !== 'known') unresolved_questions.push(`${field} is ${state} for ${compositeKey(line.key)}.`);
    if (line.confirmed_destination_arrival_date === null) unresolved_questions.push(`Confirmed destination arrival date is unknown for ${compositeKey(line.key)}.`);
  }
  for (const block of active_blocks) if (block.owner_role === null || block.owner_role === undefined) unresolved_questions.push(`Who owns active block ${block.block_instance_id}? Responsible role is unknown.`);
  const confirmedDates = lines.map(line => line.confirmed_destination_arrival_date);
  const order_wide_confirmed_arrival_date = confirmedDates.length && confirmedDates.every(date => typeof date === 'string' && date === confirmedDates[0]) ? confirmedDates[0] : null;
  const owners = [...new Set(active_blocks.map(block => block.owner_role ?? null))];
  const permitted = rawLines.find(line => line.permitted_status);
  return { order, role, source_revision: revision, status: conflicts.length ? 'SOURCE_CONFLICT' : active_blocks.length ? 'BLOCKED' : permitted?.permitted_status ?? (unresolved_questions.length ? 'UNRESOLVED' : 'NO_ACTIVE_BLOCK'),
    owner_role: owners.length === 1 ? owners[0] : permitted?.owner_role ?? null,
    lines, quantities, order_wide_confirmed_arrival_date, active_blocks, events,
    event_summary: { valid: !conflicts.length, conflicts, unique_event_count: events.length, block_instance_count: instances.length,
      transport_duplicate_count: transportDuplicateCount },
    unresolved_questions, notes: clone((source.notes ?? []).filter(note => note.order === order && note.revision <= revision)),
    restricted_context: clone((source.restricted_context ?? []).filter(record => record.order === order && record.revision <= revision && record.allowed_role === role)),
    seeded_reviews: clone((source.seeded_reviews ?? []).filter(review => review.key?.order === order && review.source_revision <= revision)).map(review => ({ ...review, origin: 'seeded_fixture_history', current: false })),
    model_calls: 0 };
}

export function sourceRecords(source, order, role, { revision = source.source_revision } = {}) {
  checkRole(role);
  if (!['SO-A', 'SO-B', 'SO-C'].includes(order) || isMinimal(order, role)) return [];
  const records = [];
  for (const [field, kind, identity] of [['lines', 'schedule_line', 'record_id'], ['notes', 'request_note', 'record_id'], ['events', 'source_event', 'event_id'], ['seeded_reviews', 'seeded_fixture_history', 'review_id'], ['restricted_context', 'fictional_context', 'record_id']]) {
    for (const record of source[field] ?? []) {
      if ((record.order ?? record.key?.order) !== order || (record.revision ?? record.source_revision ?? 0) > revision || (field === 'restricted_context' && record.allowed_role !== role)) continue;
      const item = { record_id: record[identity], kind, revision: record.revision ?? record.source_revision,
        record_sha256: digest(record), pointer: `${field}/${record[identity]}`, value: clone(record) };
      if (!records.some(previous => canonical(previous) === canonical(item))) records.push(item);
    }
  }
  return records;
}

export function createReviewStore({ source, policy, source_sha256, policy_sha256 }) {
  // Snapshot immutable inputs so an external mutation cannot reuse old hashes.
  const localSource = clone(source), localPolicy = clone(policy);
  const receipts = new Map();
  const inspectedBindings = new Set();
  function calculateInspection(order, role, role_revision, options = {}) {
    if (!Number.isSafeInteger(role_revision) || role_revision < 0) fail('INVALID_ROLE_REVISION');
    const revision = options.revision ?? localSource.source_revision;
    const view = deriveOrder(localSource, localPolicy, order, role, { revision });
    if (isMinimal(order, role, localPolicy)) return { view, binding: null, review_enabled: false };
    const active = view.active_blocks.filter(block => (!options.key || compositeKey(block.key) === compositeKey(options.key)) && (!options.block_instance_id || block.block_instance_id === options.block_instance_id));
    const block = active.length === 1 ? active[0] : null;
    const review_enabled = revision === localSource.source_revision && view.event_summary.valid && !!block && !!source_sha256 && !!policy_sha256;
    const scopedSourceHash = digest({ source_revision: revision, records: sourceRecords(localSource, order, role, { revision }) });
    const binding = block ? { source_revision: revision, source_sha256: scopedSourceHash, policy_sha256, role, role_revision,
      key: clone(block.key), block_instance_id: block.block_instance_id, view_fingerprint: digest(view) } : null;
    return { view, binding, review_enabled };
  }
  function inspect(order, role, role_revision, options = {}) {
    const result = calculateInspection(order, role, role_revision, options);
    if (result.review_enabled) inspectedBindings.add(digest(result.binding));
    return result;
  }
  function review(body, session) {
    const stale = () => ({ ok: false, error: 'STALE_REVIEW' });
    if (!body || !session || body.acknowledgment !== true || Object.keys(body).some(field => ![...BINDING_FIELDS, 'acknowledgment'].includes(field)) || BINDING_FIELDS.some(field => !Object.hasOwn(body, field))) return stale();
    if (body.role !== session.role || body.role_revision !== session.role_revision || body.source_revision !== localSource.source_revision) return stale();
    let inspection;
    try { inspection = calculateInspection(body.key.order, session.role, session.role_revision, { key: body.key, block_instance_id: body.block_instance_id }); } catch { return stale(); }
    try {
      if (!inspection.review_enabled || canonical(inspection.binding) !== canonical(Object.fromEntries(BINDING_FIELDS.map(field => [field, body[field]])))) return stale();
    } catch { return stale(); }
    const receiptKey = digest(inspection.binding);
    if (!inspectedBindings.has(receiptKey)) return stale();
    if (receipts.has(receiptKey)) return { ok: true, receipt: clone(receipts.get(receiptKey)), idempotent: true };
    const receipt = { review_id: `LOCAL-${receiptKey.slice(0, 20)}`, kind: 'local_handoff_acknowledgment', origin: 'executed_local_review',
      ...clone(inspection.binding), acknowledgment: true, acknowledged_questions: clone(inspection.view.unresolved_questions),
      reviewed_at: new Date().toISOString(), model_calls: 0, source_blocks_changed: false };
    receipts.set(receiptKey, receipt);
    return { ok: true, receipt: clone(receipt), idempotent: false };
  }
  function history(order, role) {
    checkRole(role, localPolicy);
    if (isMinimal(order, role, localPolicy) || !localPolicy.known_orders.includes(order)) return [];
    const seeded = (localSource.seeded_reviews ?? []).filter(receipt => receipt.key?.order === order).map(receipt => ({ ...clone(receipt), origin: 'seeded_fixture_history', current: false }));
    const executed = [...receipts.values()].filter(receipt => receipt.key.order === order && receipt.role === role).map(receipt => ({ ...clone(receipt), current: true }));
    return [...seeded, ...executed];
  }
  return { inspect, review, history, get count() { return receipts.size; } };
}
