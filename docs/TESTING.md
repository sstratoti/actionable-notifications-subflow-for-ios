# Testing

This project has two test layers: fast unit tests for the pure `lib/` payload
builders, and integration tests that load the real node into a Node-RED test
runtime with a mocked Home Assistant connection. Neither layer talks to a live
HA instance or sends a real push notification — everything is safe to run
repeatedly, offline, with no side effects.

## Running the suite

```bash
npm install
npm test              # unit + integration, ~115 tests
npm run test:unit      # lib/*.js only (fast, no Node-RED runtime)
npm run test:integration  # the real node loaded into node-red-node-test-helper
npm run lint            # ESLint across the whole project
```

`npm test` is what CI runs (`.github/workflows/ci.yml`, on Node 18.x and
20.x) — if it's green locally, it should be green in CI, provided
`package-lock.json` stays committed and in sync with `package.json` (CI uses
`npm ci`, which fails outright on a missing or stale lockfile).

Run a single file directly with `npx mocha <path>`, e.g.:

```bash
npx mocha test/unit/build-payload.spec.js
npx mocha test/integration/ha-ios-notification.spec.js
```

## What each layer covers

**Unit tests** (`test/unit/`) exercise the pure functions in `lib/` directly
— no Node-RED, no mocks beyond plain JS objects:

| File | Covers |
|---|---|
| `sanitize-tag.spec.js` | Tag sanitization and random-suffix fallback |
| `action-list.spec.js` | Action normalization, full-replace override semantics, iOS-vs-tap-target prop separation |
| `message-store.spec.js` | Per-instance dedup/tracking store, TTL pruning |
| `build-payload.spec.js` | The full notification payload builder — base fields, actions, map, media, badge/presentation_options, and the 3-tier override chain's nullish (`??`) vs `\|\|` semantics |
| `build-clear-payload.spec.js` | Manual clear and auto-clear-on-action payloads |
| `build-live-activity.spec.js` | Live Activity (`live_update`) payload builder |

**Integration tests** (`test/integration/ha-ios-notification.spec.js`) load
the real `ha-ios-notification.js` node into `node-red-node-test-helper`, with
`lib/ha-client.js` swapped out via `proxyquire` for a fake HA client
(`test/integration/helpers/mock-home-assistant.js`) built on a real Node
`EventEmitter` — so action-event subscription/routing is exercised for real,
just against a fake bus instead of a live HA websocket. This layer covers:
send/manual-clear/clear-badge paths, action-received routing (both the
modern and legacy HA events), user-info enrichment, auto-clear-on-action and
its tracking-state cleanup scoping, per-device send stagger, debug mode,
tap-to-perform, Live Activity mode, and — the one test that exists
specifically to prove the project's whole reason for being — **two separate
node instances in one flow never react to each other's notifications**, even
with identical tag and target device.

## Writing new tests

- Follow TDD: write the failing test first, confirm it fails for the stated
  reason, then implement.
- Unit tests use `should` (`require('should')`) for assertions. For a value
  that might be `null`, use `should(value).be.null()` rather than
  `value.should.be.null()` — calling `.should` as a property getter on `null`
  throws before the assertion runs.
- Integration tests that append a **new top-level `describe(...)` block**
  need their own
  `afterEach(function (done) { helper.unload().then(() => done()); })` hook —
  `node-red-node-test-helper` reuses node ids across `helper.load()` calls
  within a file, and Mocha hooks don't cross sibling `describe` blocks, so a
  block without its own `afterEach` will hang tests that call `helper.load()`
  more than once. Copy the hook from any existing `describe` block in the
  file.
- If a test sends to 2+ devices through the node's normal send path, set
  `staggerMs: 0` in that test's flow config unless the test is specifically
  about the stagger delay — the default 1000ms stagger will otherwise make
  the test's timing assumptions wrong (or leave a dangling async
  continuation past test teardown).

## Manual smoke-testing against a real HA server

The automated suite never opens a live HA connection. To verify against a
real Home Assistant instance and real devices before publishing a change:

```bash
npm link
cd /path/to/your/node-red/user/dir   # e.g. ~/.node-red, or this repo's
                                      # deployment target
npm link node-red-contrib-ha-ios-notification
```

Restart Node-RED, drag the **HA iOS Notification** node onto a canvas, point
it at your `server` config node, and send a real test notification. This is
also the point to confirm the modern `mobile_app_notification_action` event's
field mapping (`action`, not `actionName`) against a real button tap — the
normalizer in `ha-ios-notification.js` degrades gracefully to the legacy
`actionName` field if the modern mapping is ever wrong, but only a live event
confirms which path actually fires.

## Manual config-panel checklist

The editor UI (`ha-ios-notification.html`) has no DOM test harness, so
changes to it are verified by hand in a running Node-RED editor:

- **Action icon + text-input fields:** add an action, set an Icon (e.g.
  `sfsymbols:car`), tick **Text input**, set a Button title and Placeholder,
  then Deploy and read the node's JSON (export the flow or inspect via the
  Node-RED admin API) — confirm `icon`, `behavior: "textInput"`, and both
  `textInputButtonTitle`/`textInputPlaceholder` are present on that action.
  Untick **Text input** and re-deploy — confirm `behavior`,
  `textInputButtonTitle`, and `textInputPlaceholder` are absent (icon should
  remain, since it's independent of the text-input toggle).
- **Action targetData drill-down:** add an action, click the **Service data
  (JSON)** button under Tap-to-perform — the built-in JSON editor opens.
  Enter `{"code":"1234"}` and click **Done** — the button label switches to
  "data set" and renders bold. Deploy and read the node's JSON — confirm
  `action.targetData` equals `{ "code": "1234" }`. Reopen the editor, clear
  the JSON to `{}` (or empty), click **Done** — the button reverts to
  "empty — click to add JSON", and after re-deploying, `targetData` is
  absent from that action's JSON.
- **Layout fixes:** open a fresh (unconfigured) node — the Targets list
  shows one empty row by default, not zero. The **Actionable Buttons**
  label reads on a single line, not wrapped/clipped. Add an action —
  the **Destructive** and **Requires auth** checkboxes sit side-by-side
  on one row with no wrapping/clipping. On any combo field with a caret
  (e.g. Camera entity, Content type, Sound, and an action's Service /
  Target entity), the caret sits flush against the input's right edge
  with no gap, and clicking directly on the caret focuses the field and
  opens its dropdown, same as clicking into the input itself.
