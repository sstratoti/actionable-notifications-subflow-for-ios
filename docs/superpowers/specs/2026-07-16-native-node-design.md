# iOS Actionable Notification: Subflow → Native Node — Design Spec

**Date:** 2026-07-16
**Status:** Approved by Steve (brainstorming session, 2026-07-16)
**Source:** `iOS Actionable Notification v2` subflow (`c0b683aefa9e5a95`) in BEEbox's
Node-RED instance, currently used across many of Steve's flows.

## Goal

Convert the existing Node-RED subflow into a real, publishable native Node-RED node
package: `node-red-contrib-ha-ios-notification`. Production-ready code and editor UI,
Home Assistant entity/service pickers replacing manual entity typing, an automated
test suite, documentation, and a publish plan targeting npm + the Node-RED flow
library.

## Current-state summary

The v2 subflow: 1 input, 10 fixed outputs (one per actionable-notification button),
~40 config properties (`env` vars), and 28 internal nodes. Core logic lives in two
function nodes:

- **`create service call`** — builds the HA `notify.*` service-call payload from a
  3-tier override chain (`msg.notificationOverride` → per-service override → node
  config default), fans out one message per configured target device, and records
  each sent notification (tag + device + timestamp) for later dedup/clear matching.
- **`create CLEAR service call`** — handles both an inbound `msg.clear = true`
  manual-clear trigger, and an automatic "clear this notification on every other
  device" behavior when `isClearNotificationsOnAction` is set and an action fires.

Supporting nodes (all contributed by `node-red-contrib-home-assistant-websocket`):
`api-call-service` (send), `server-events` (listens for
`ios.notification_action_fired`), `ha-api` (fetches HA user records via
`config/auth/list` when `populateUserInfo` is set).

### Known gaps driving this project
- `services` (notify targets) and `cameraEntity` require hand-typing HA
  identifiers — no picker.
- 10 fixed `actionNjson` textarea fields regardless of how many actions are
  actually used; 10 outputs always allocated.
- Dedup/tracking state lives in **global** flow context keyed only by tag+device —
  not safe across multiple node instances in one flow (which is Steve's actual
  usage pattern).
- Tag defaulting depends on an external `flow.get('random')` variable set
  elsewhere in the flow — an undocumented dependency.
- No automated tests; verified only via manual debug-node wiring in production.
- No error handling on HA service calls — failures are silent.

## Decisions

| Question | Decision |
|---|---|
| Migration strategy | Compatible config/msg shape for manual swap-in; no auto-migration tooling |
| Sound list | Keep dropdown (it's the iOS Companion App's *bundled* sound library, verify against current HA docs — not personal files) + free-text override for user-uploaded custom sounds |
| Entity pickers | Notify targets, camera entity, and action tap-to-perform entity/service — all three |
| Actions UX | Dynamic add/remove/reorder list; dynamic output count (0–10) matching configured actions |
| State scoping | `node.context()` — per-node-instance, collision-proof by construction |
| Platform scope | iOS-only for v1; action-listener and payload-builder kept separable for future Android work |
| Repo/npm | Restructure `sstratoti/actionable-notifications-subflow-for-ios` in place; new npm account (setup included in publish plan) |
| Test depth | Mocha unit tests (pure logic) + `node-red-node-test-helper` integration tests (real node, mocked HA) |
| Package name | `node-red-contrib-ha-ios-notification`, node type "HA iOS Notification" |
| HA connection | Depend on `node-red-contrib-home-assistant-websocket`; reuse its `server` config node type and entity data for pickers |
| Node shape | One self-contained node (input handles both send and manual-clear; dynamic outputs handle received actions) — not split into separate send/listen nodes, to preserve the compatible-swap goal |

## Architecture

### Package layout

```
ha-ios-notification/
  ha-ios-notification.js      # runtime: registers node, wires HA connection
  ha-ios-notification.html    # editor UI (config form + help text)
  lib/
    build-payload.js          # pure fn: config+overrides → HA notify.* service payload
    build-clear-payload.js    # pure fn: clear-notification payload (manual + auto-clear)
    action-list.js            # pure fn: validate/normalize the actions array
    sanitize-tag.js           # pure fn: tag sanitization, self-contained random suffix
  test/
    unit/                     # Mocha, tests lib/ directly
    integration/              # node-red-node-test-helper, loads the real node
  examples/                   # example flow snippets for Node-RED's examples browser
  legacy-subflow/             # existing subflow export, kept for reference
  package.json
  README.md
  CHANGELOG.md
```

### Config fields

Same names/shapes as v2's `env` vars so `msg.notificationOverride` usage in
existing flows keeps working: `tag`, `services` (now picker-populated), `group`,
`title`, `subtitle`, `message`, `notificationUrl`, `cameraEntity` (picker),
`customSoundPreInstalled` (dropdown, refreshed against current HA iOS Companion App
list) + `customSound` (free-text override), `interruptionLevel`, `userInfo`,
`isClearNotificationsOnAction`, map fields (lat/long pairs + display flags), media
fields (image/video/audio/contentUrl + display flags), `debugMode`.

The 3-tier override precedence (`msg.notificationOverride` → per-service override
→ node config default) is preserved exactly.

### Actions

Replace the 10 `actionNjson` blobs with a dynamic editable list in the editor —
each entry has real fields (title, id, URI, activation-mode dropdown,
destructive/auth-required checkboxes, optional tap-to-perform entity/service
picker) instead of a JSON textarea. Node outputs become dynamic: one per
configured action (0–10). The JSON-blob shape is still accepted as an *input*
override (`msg.notificationOverride.actions`) for anything constructing that
shape dynamically upstream.

**Override compatibility for actions:** Node-RED fixes a node's output count at
deploy time — a msg cannot spawn an output that doesn't exist on the canvas (v2
had this same ceiling, just always padded to 10). Each configured action gets a
stable `id`, auto-defaulting to `"1"`, `"2"`, `"3"`... in editor order — matching
legacy `actionOutput` numbers when actions are migrated in the same order.
`msg.notificationOverride.actions` keys by `id` instead of `actionOutput`.
Overriding the *content* of an already-configured slot works exactly as before.

`notificationBase` / `map` / `media` overrides are unchanged plain-value
overrides. `services` override is unchanged shape (`[{deviceName,
serviceOverride}]`) — the picker only changes how the *default* list is set at
design time.

### State management

Send/clear dedup tracking moves from global `flow.get('flow_messages')` to
`node.context()` (auto-scoped per node instance). Same 24h-TTL cleanup logic,
collision-proof between multiple node instances. Tag defaulting generates its own
random suffix internally instead of depending on an external `flow.get('random')`.

### Retained runtime behaviors (explicit — nothing here is new, all ported from v2)

1. **Manual clear trigger** — `msg.clear = true` into the node's single input
   fires a clear-notification call instead of a send.
2. **Auto-clear on action** — `isClearNotificationsOnAction` clears the same
   tagged notification off every *other* target device when one device's action
   is tapped.
3. **Action-ownership matching** — inbound `ios.notification_action_fired` events
   (a global HA event stream) are checked against this node instance's own
   `node.context()` store before being routed to an output, so multiple node
   instances don't react to each other's notifications.
4. **User-info enrichment** — if `userInfo` was set, fetch the HA user list
   (`config/auth/list`) on action-received and attach the record matching
   `context.user_id` to the output message.
5. **Rate limiting** — v2 wires ad-hoc delay/rate-limit nodes (10s+jitter, two
   5s-rate throttles) into the canvas to avoid slamming HA/APNs on multi-device
   fan-out. Becomes an explicit configurable "stagger between per-device sends"
   node option. **Exact original wiring needs verification during
   implementation** — traced that these nodes exist and their configs, not their
   precise placement in the wire graph.
6. **`node.status()` feedback** — action-received status, "no services defined"
   error, clear-count status — retained.
7. **`debugMode`** — can't dynamically wire debug nodes in a packaged node;
   becomes conditional `node.trace()`/`node.debug()` logging plus an optional
   `msg._debug` field showing the constructed payload.

### Error handling (new — v2 has none)

HA service-call failures produce `node.error(err, msg)` with payload attached,
surfacing in the Node-RED debug sidebar / catch node instead of failing silently.

## Editor UI

Config form organized into collapsible sections (replacing v2's single flat
40-field list):

- **Basics:** Name, Title, Subtitle, Message, Group, Tag, Notification URL.
- **Targets:** Notify-services picker (multi-select against discovered
  `notify.mobile_app_*` services on the configured HA server), each with an
  optional per-device override expand. Camera Entity picker (`camera.*` domain).
- **Actions:** the dynamic editable list — add/remove/reorder, Title, id
  (auto/custom), Activation Mode dropdown, URI, Destructive/Auth-required
  checkboxes, optional tap-to-perform entity/service picker.
- **Map / Media / Advanced:** same fields as v2 (interruption level, sound,
  user info, clear-on-action, debug), organized into their own collapsed
  sections instead of one long scroll.

**Picker mechanics:** populated via an admin HTTP endpoint the node registers
(`RED.httpAdmin.get('/ha-ios-notification/entities', ...)`), querying the
connected `server` config node's cached entity/service list — the same mechanism
`node-red-contrib-home-assistant-websocket`'s own nodes use — filtered
server-side to `notify.*` / `camera.*`. Falls back to free-text entry if no HA
server is reachable at editor-open time.

## Local development / debugging workflow

- `npm link` the package into the BEEbox Node-RED container's `node_modules` for
  live testing against the real HA server and Steve's actual devices during
  development.
- Editor-time "Debug info" panel (always available, independent of the runtime
  `debugMode` flag) showing last constructed payload, last HA call result/error,
  and current `node.context()` store contents.
- `node-red-node-test-helper`'s log capture doubles as the fastest debug loop
  while writing tests — failing assertions show exact msg objects per step.

## Testing

- **Unit (Mocha + should/chai):** every `lib/*.js` pure function — payload
  building across the full override chain, both clear-payload paths, action-list
  validation, tag sanitization, dedup-store TTL cleanup.
- **Integration (`node-red-node-test-helper`):** real node loaded into a test
  runtime, messages injected, assertions against a mocked HA `server` config node
  (no live HA/APNs calls) — node wiring, dynamic output count matching configured
  actions, `node.context()` isolation between two instances in one test flow,
  `node.status()`/`node.error()` behavior.
- **CI:** GitHub Actions running both suites on PRs and `main`, ESLint, and a
  `package.json` `node-red` manifest validator.

## Documentation

- `README.md` — install, quick-start example, full config reference, migration
  notes for existing v2 subflow users (compatible-config mapping above).
- `CHANGELOG.md` — semver from `1.0.0` of the new package identity.
- In-editor help (`data-help-name` script block) — condensed config reference.
- `examples/` flow snippets registered via `package.json`'s `node-red.examples`
  (send, actionable buttons, manual clear, multi-device fan-out) — importable
  through Node-RED's built-in examples browser.

## Publishing plan

1. Set up npm account (signup, email verification, 2FA — required for publishing
   since 2022).
2. Restructure `sstratoti/actionable-notifications-subflow-for-ios` in place: new
   package code lands alongside existing docs history; old subflow export moves
   to `legacy-subflow/` with a pointer to the new node rather than being deleted.
3. `package.json` with the `node-red` manifest section (`node-red.nodes` →
   `ha-ios-notification.js`), `keywords` including `node-red`, `home-assistant`,
   `ios`, `notification` — the `node-red` keyword is what the flow library
   indexes on.
4. `npm publish` as `1.0.0`; verify indexing at flows.nodered.org.
5. GitHub release tagged to the npm version, CHANGELOG entry as release notes.

## Out of scope for v1

- Android companion app notification actions (architecture leaves room, no work now).
- Auto-migration tooling that rewrites `flows.json` subflow instances automatically.
- Standalone HA connection (depends on `node-red-contrib-home-assistant-websocket`
  instead).
