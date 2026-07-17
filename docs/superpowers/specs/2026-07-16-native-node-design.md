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

---

# Revision 2 (2026-07-16) — Companion-docs review + design review

Two reviews followed the initial spec: (1) a full pass over the current HA iOS
Companion App notification docs (companion.home-assistant.io), and (2) a critical
design/logic review by Fable 5. This section amends the decisions above; where it
conflicts with Revision 1, Revision 2 wins.

## Companion-docs findings and decisions (approved by Steve)

**Sound list — CONFIRMED bundled; hedge withdrawn.** The ~140
Morgan-Freeman/Alexa/Daisy `.wav` sounds are genuinely bundled in the Companion App,
not personal uploads. Keep the bundled-sound dropdown + free-text override. Custom
sounds must be 32-bit float 48000 Hz `.wav`; users can additionally import ~400 iOS
system `.caf` sounds — so the free-text override is load-bearing, not a nicety. The
"verify the list against current docs" task stays; the earlier "these might be
personal files" concern is withdrawn.

**Action-tap event — modernize to dual-listen (CHANGES the integration + routing).**
v2 listens only on `ios.notification_action_fired`, the legacy/deprecated event. The
current unified event is `mobile_app_notification_action`. Decision: **subscribe to
BOTH and normalize.** The action identifier field differs — legacy
`event.actionName`, modern `event.action` — normalize to a single internal `actionId`.
`action_data` (tag / deviceName / allServices, used for ownership matching and
auto-clear) is present on both. The action listener registers two event types in the
HA client's `eventsList`, and one handler normalizes either shape.

**New iOS features added to v1 scope:**
- **Badge:** `data.push.badge` (integer) config field, plus a `clear_badge` input
  command (analogous to `msg.clear`, e.g. `msg.clearBadge = true`).
- **presentation_options:** `data.presentation_options` array (editor checkboxes:
  alert / badge / sound) controlling foreground display.
- **Media key-placement fix:** emit the documented
  `data.attachment.{url, content-type, lazy, hide-thumbnail}` structure. v2's
  top-level `data.contentUrl` and `data.lazy` are corrected to `data.attachment.url`
  and `data.attachment.lazy`; `content-type` is newly exposed. This is a deliberate
  behavior change from v2 (justified by "production ready" + matching current docs) —
  requires a migration note. The exact current structure will be re-verified against
  the attachments doc during implementation before finalizing.

**Live Activities / Live Updates — IN v1 scope (new capability + new editor section).**
iOS 17.2+, HA Core 2026.7+, currently Labs/TestFlight. Mechanically a standard notify
call: `data.data.live_update: true` + required `tag`, plus optional `progress`,
`progress_max`, `chronometer`, `when`, `when_relative`, `notification_icon`,
`notification_icon_color`, `color`, `background_color`, `text_color`, `url`. Updating
= re-send the same tag; ending = `clear_notification` with the same tag (already
supported by the node's clear path). Design: a "Live Activity" section on the node;
when enabled, the payload builder emits the live-update field set. iOS throttles
updates (avoid sub-second) — documented, not enforced by the node. Kept as a separate
payload-builder path so it doesn't entangle the standard-notification builder.

## Design-review findings folded into the plan revision

Confirmed against the extracted v2 source; fixed in the revised plan (implementation
detail, recorded here so the design of record acknowledges them):

1. **Override null-semantics:** the payload builder must use nullish (`??`) precedence
   for title/subtitle/message/url/cameraEntity/interruptionLevel/group/tag and all
   map/media fields (so an explicit `""` override is honored, matching v2), and `||`
   only for the sound chain. Rev-1's `pick()` (which treats `""` as absent for
   everything) is wrong — split into `pick` (|| semantics) and `pickNullish` (??).
2. **Action override = full replace, not merge:** an override supplies the whole action
   object for that id (matching v2), not a shallow field merge.
3. **Received-action must purge tracking state (scoped):** always remove the firing
   device's own `sentMessages` entry so a duplicate/late event for that same tag+device
   can't re-fire routing (v2 left this entry unless clear-on-action was set — a latent
   bug). On clear-on-action, *also* remove the other devices' entries for the tag (v2's
   `cleanUpMessages` for every device), since their notifications were just cleared. With
   clear-on-action off, leave the other devices' entries so each device can still be
   actioned independently (matches v2). See Task 17.
4. **Send-path persistence:** persist `sentMessages` incrementally (or in `finally`) so
   a mid-fan-out failure doesn't silently drop already-sent devices from tracking.
5. **Rate-limit fidelity + default:** v2 always throttles multi-device fan-out (~5s) on
   BOTH send and clear paths, and additionally applies a one-shot ~10s+jitter
   sequencing delay before routing an action when clear-on-action is set. The
   `staggerMs` option must default to v2's throttle rather than 0/off, and the
   sequencing delay must be reproduced (or consciously dropped, with a migration note).
6. **Two-instance isolation test (required):** the suite MUST instantiate two node
   instances in one flow and verify their `node.context()` tracking doesn't collide —
   the property that motivated the whole rewrite. Rev-1 never tested it.
7. **Async test determinism:** integration tests must await the input handler's
   completion (via the `done` callback / a returned promise) instead of `setTimeout`
   races, and avoid millisecond-precision timing assertions.

Minor: the Rev-1 `fetchUsers` note "verify live whether send() returns a bare array or
{result}" is resolved — `home-assistant-js-websocket`'s `sendMessagePromise` resolves
`message.result`, so `send()` returns the bare array. The defensive `{result}` branch
is dead code and can be dropped.

## Open decision resolved (2026-07-16)

**Tap-to-perform action entity/service picker — IN v1 (approved by Steve).** An action
may optionally carry an HA target (entity_id + domain/service) that the node calls
directly via `callService` when that action is received, in addition to emitting on
the action's output. New per-action editor fields (service picker + entity picker),
a new admin endpoint enumerating callable services, and a service-call step in the
action-received handler (after ownership match, alongside user-info enrichment and
auto-clear). The action's `uri`/other fields are unaffected; tap-to-perform is purely
additive and skipped when no target is configured.
