![Original source → deterministic rules → schedule lines and events → local review](docs/architecture.png)

# Customer-order exception handoff desk

A native schedule-line table, source-event timeline and unresolved-review queue over a small **original fictional fixture**. CPU rules determine quantities, exact block instances and role-filtered evidence. A human records a local acknowledgment tied to the inspected source, role and instance. The application sends no ERP write, customer message, release decision or delivery guarantee.

[Editable diagram](docs/architecture.svg) · [glyph provenance](docs/asset-provenance.json) · [source/review contract](CONTRACT.md) · [pinned original manifest](fixtures/source-manifest.json)

The diagram describes the implemented CPU path. Generic original process glyphs represent components, not technology brands. There is no model branch in this version; **zero model calls** have run for P14.

The current **UI v2** shows equal source and result panels, a schedule-line ledger, source events, unresolved questions and local receipt history. The original backend and all 15 original CPU contract files remain byte-for-byte frozen. The new static overlay delegates every API request to that backend. [Current UI browser checks and media provenance](evidence/ui-refit-browser-checks.json) record actual local Chrome execution separately from CI.

![현재 주문 라인 — 수량과 날짜를 구분합니다.](docs/ui-refit/01-current-lines.png)
![원문 근거 — 일정 키에서 원본 라인을 확인합니다.](docs/ui-refit/02-source-evidence.png)
![이벤트 접기 — 중복 전송과 현재 BLK-C2를 구분합니다.](docs/ui-refit/03-event-fold.png)
![미확인 담당 — 질문을 남기고 EV-C3 원문을 확인합니다.](docs/ui-refit/04-unknown-owner.png)
![과거 영수증 — 소스 revision과 현재 권한, 미확인 검토 역할을 구분합니다.](docs/ui-refit/05-historical-receipt.png)
![반복 검토 — 기존 영수증을 반환하고 차단은 유지합니다.](docs/ui-refit/06-repeated-review.png)
![영수증 내보내기 — 준비 상태와 다운로드·외부 반영의 한계를 표시합니다.](docs/ui-refit/07-export-receipt.png)
![Service 최소 권한 — 허용된 상태와 담당 역할만 표시합니다.](docs/ui-refit/08-service-minimal.png)
![390px 화면 — 한 줄 제목과 스크롤 가능한 일정 표를 유지합니다.](docs/ui-refit/09-mobile-390.png)
![소스 읽기 실패 — 근거와 영수증을 지우고 기록·내보내기를 비활성화합니다.](docs/ui-refit/10-source-unavailable.png)

[Historical pre-refit CPU browser video](docs/cpu-native-demo.mp4) shows the **original UI**, not current UI v2. It is an actual timestamp-ordered capture of 80 native browser frames at two frames/second (40 seconds, ten inspected stages), encoded with the existing CPU ffmpeg executable. It includes repeated acknowledgment, historical revision, role downgrade and isolated source-read failure. It contains no model demo. [Historical video transitions and exact media hash](evidence/demo-transitions.json). Original [schedule screenshot](docs/schedule-lines.png), [event/review screenshot](docs/event-handoff-review.png), [mobile screenshot](docs/mobile-390.png), [permitted status](docs/permitted-status.png) and [source failure](docs/source-unavailable.png) are also historical pre-refit UI. [Historical 15-check browser record and media hashes](evidence/browser-checks.json).

## Source facts and decision boundaries

The admitted cutoff is **2026-10-03 10:00 Asia/Seoul**, source revision4. Exact string keys contain source system, order, item and schedule line. Quantities are integer EA; unknown is null, not zero. The fictional manifest asserts no omitted cancellation/delivery-reversal records for these listed lines only.

| Order | Deterministic evidence | Unresolved or forbidden inference |
|---|---|---|
| SO-A | 18 ordered,6 delivered,12 remaining ordered; line1 arrival requested/confirmed Oct5; line2 requested Oct6, confirmation unknown; active DB-A2 owned by Warehouse Review | Remaining ordered does not mean inventory or dispatch readiness. No single confirmed order-wide date. The Oct2 “Please ship all tomorrow” note is a request only. |
| SO-B, Service/Warehouse view | Exactly `status=CREDIT_REVIEW_BLOCK` and `owner_role=Authorized Commercial Review` | No reason, financial data, record title/count/hash/source pointer or hidden-record hint. No creditworthiness/release recommendation. |
| SO-C | EV-C1 opens BLK-C1; EV-C2 clears it; EV-C3 opens BLK-C2. Exact duplicate EV-C3 is transport only:3 events,2 instances,1 active | Owner, quantities and dates remain unknown. The seeded09:05 BLK-C1 review is fictional historical data; it does not cause a clear or authorize BLK-C2. |

Requested destination arrival, confirmed destination arrival, planned dispatch and actual delivery have separate columns. No missing dates are inferred from quantities. No active instance in an inspected view is not an all-clear when context is unknown.

Event folding deduplicates identical transport records and rejects conflicting same-ID content. An isolated test of `CLEAR_REVERSED` must identify the exact prior clear using `reverses_event_id`; wrong/repeated/unsupported targets conflict. Local reviews never become source events. Reversal fixtures are test mutations, not original source events.

## Review, source navigation and receipts

Review binds current source revision, role-scoped source digest, policy digest, session role revision, exact schedule key, block-instance ID and complete inspected-view fingerprint. The server requires that exact binding to have been inspected in the same browser session. Revision3 cannot acknowledge revision4. Repeated identical acknowledgment returns the same receipt, without adding a case or clearing a block.

Role projection precedes public hashes and metadata: changing fictional restricted SO-B content cannot change Service SO-A/SO-C bindings or SO-B's two-field response. Denied and unknown source lookups have the same generic response. A role downgrade immediately erases old evidence from visible and hidden client DOM. Serialized mutations/reads plus generation guards discard delayed responses. Named source destinations support keyboard navigation and preserve a later explicit focus choice.

Missing/read-denied/hash-changed admitted files revoke current authority and prior session inspection grants. Old payloads cannot be reaccepted merely by restoring file bytes: a fresh inspection is required. Historical source views and seeded receipts remain explicitly historical. UI v2 distinguishes the selected source revision from the current session's permission projection. Receipt history displays `reviewed_at` and the actual recorded reviewer role; a seeded receipt with no role remains **Unknown**. Its original payload can be inspected without inferring an absent field. A prepared export acknowledgment is not proof of client download completion, target-system import or authorization.

## Run and verify

Requires Node20+; runtime has no npm dependencies.

```sh
npm test
python3 scripts/verify-freeze.py
node scripts/same-instance-extension.mjs
node ui-server-v2.mjs
# Current UI v2: http://127.0.0.1:5164
# Historical frozen UI: npm start (port 5140)
```

`node --test test/*.test.mjs` executes the actual core/API checks. Original gold is a declared oracle, not a test run. Original source/policy/gold bytes are pinned in the manifest before any optional future model work. Tests cover duplicate/conflict/reversal, null/invalid/zero quantities, exact composite IDs, stale/forged/session-bound review, restricted-data noninterference, source-read/hash failures and repeated actions. [Executed CPU browser checks](evidence/browser-checks.json) separately record real native Chrome flows at desktop and390px. Browser reproduction uses installed Python Playwright/Chrome/ffmpeg; no installer or inference is invoked.

## Business precedents and limits

These public vendor descriptions motivate distinct workflows; they are not evidence for this prototype's benefit or private architecture.

| Public source | Described workflow/maturity | Scope distinction |
|---|---|---|
| [Rollio: Campari](https://www.rollio.ai/case-studies/campari) | Vendor-reported production collaboration agent around ERP credit-block exceptions and stakeholder coordination | This desk has fictional records and a local handoff acknowledgment, no collaboration agent or ERP write. |
| [Microsoft: Regal Rexnord](https://www.microsoft.com/en/customers/story/26197-regal-rexnord-microsoft-copilot-studio) | Order-status support using Copilot Studio, with human handoff where needed; separate employee/customer/service-agent use cases | Distinct reported usage and productivity denominators must not be combined. We claim none of its metrics. |
| [Google Cloud: Danfoss](https://cloud.google.com/customers/danfoss) | Deployed order intake automation; complex pricing exceptions remain with staff; further analytics is described as future work | Intake, exception collaboration and order-status support have different authority and maturity. No throughput/ROI estimate is made here. |

Original fictional source and original code/assets are MIT licensed. No vendor data, screenshots or logos are redistributed. The role picker is a **synthetic permission simulation**, not production authentication. Sessions/receipts are in memory, the server binds to loopback, and a restart loses executed local receipts. There is no real customer, credit or financial data, durable audit service, multi-tenant authorization, production availability claim or integration. Optional model-generated cited handoff drafting remains future work requiring a separate frozen protocol and lease; its incremental usefulness must be evaluated independently from CPU correctness.
Verified current CPU results: **25/25 Node checks on Linux**, comprising the original 22 checks, one authorized versioned same-instance regression and two overlay delegation checks. The chmod case is intentionally skipped on Windows. The versioned extension changes only SO-C's requested arrival from null to `2026-10-06` at revision5 on the same BLK-C2 instance; unchanged events/case counts and rejection of both old payloads and counter/hash-adjusted old facts are checked with zero added receipts. This is an isolated CPU regression; the running UI remains admitted original revision4. [Executed extension evidence](evidence/same-instance-extension.json). CI runs CPU tests, freeze verification and exact extension-evidence verification. **21/21 current UI v2 Chrome checks and ten screenshots were executed locally**, not in CI. Original historical Chrome evidence remains 15/15. Reproduce current browser checks with `python3 scripts/ui-refit-browser.py` using already installed Playwright/Chrome. Original fixtures and frozen CPU files are unchanged. Local receipt timestamps record execution time, separately from the fictional source cutoff. **Zero model calls**; optional model protocol preparation is paused.
