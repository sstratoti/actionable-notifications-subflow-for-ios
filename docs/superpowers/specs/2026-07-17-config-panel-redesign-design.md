# HA iOS Notification — Config Panel Redesign — Design Spec

**Date:** 2026-07-17
**Status:** Approved by Steve (brainstorming session, 2026-07-17)
**Applies to:** `node-red-contrib-ha-ios-notification` — the editor UI in
`ha-ios-notification.html` (and small supporting touches in
`ha-ios-notification.js` and `lib/`).
**Predecessor spec:** `docs/superpowers/specs/2026-07-16-native-node-design.md`
(the node itself; this spec is a follow-on usability pass on its editor).

## Goal

Redesign the node's configuration panel for clarity and usability: group like
fields into collapsible bordered sections, align every control to one column,
add sample-data placeholders, unify the value pickers into one searchable
widget, and replace the clunky foreground-presentation control. The panel
should feel native to Node-RED and be easier to scan and fill in.

## Guardrails (non-negotiable)

- **Editor-only (runtime/schema untouched).** No change to the saved config
  schema or the node runtime. Every existing flow that uses this node keeps
  working with no edits. Non-runtime supporting changes are in scope: a new
  browser-served resource file (`resources/sound-field.js`) with its unit test,
  and a `package.json` `files`-allowlist entry so it ships — none of these
  affect runtime behavior.
- **Backward compatible.** Existing saved nodes open correctly in the new
  panel and, when re-saved, migrate cleanly with identical runtime behavior
  (see Backward Compatibility).
- **Stays in Node-RED's visual language.** Work within Node-RED's editor
  conventions and its light/dark themes (including third-party dark themes like
  midnight-red). Do not import a novel visual identity.
- **One functional touch only.** The tap-to-perform entity picker gains
  domain filtering via the `prefix` query param the `/entities` admin endpoint
  already supports. No other behavior changes.

## Current-state problems

1. **No grouping.** Seven flat `<h4>` headers on one long unbroken scroll.
2. **Misaligned inputs.** A mix of Node-RED default widths, hardcoded
   `width:45%` / `30%`, and `width:auto` checkboxes — nothing lines up down the
   column.
3. **Sparse placeholders.** Most text inputs are empty with no example.
4. **Clunky foreground presentation.** Three loose checkboxes crammed onto the
   label line — the roughest control in the panel.
5. **Fragmented value pickers.** Sound is a 127-item `<select>` *plus* a
   separate "custom sound" text box; tap-to-perform uses native `<datalist>`
   that dumps every HA entity into one list; content-type is a bare text box.

## Decisions

| Question | Decision |
|---|---|
| Section layout | Collapsible bordered section cards (chevron header + title). |
| Default open state | **Smart:** Basics + Targets always open; any section holding non-default values auto-opens; the rest collapsed. Per-dialog-open (not persisted). Auto-open is a mechanical predicate against the `registerType` defaults with named exceptions — see §1. |
| Alignment | One uniform label/control grid per section; paired fields get sub-labels and align under the control column. |
| Placeholders | Realistic sample data in every free-text field. |
| Value pickers | Known-but-open value sets → one searchable type-or-pick combo (the device-picker widget). Genuinely fixed sets stay plain `<select>`. |
| Sound field | Merge the bundled `<select>` and the "custom sound" box into one searchable combo. |
| Tap-to-perform pickers | Upgrade Service + Target-entity from `<datalist>` to the searchable widget; entity suggestions filter to the chosen service's domain. |
| Content type | Searchable combo suggesting iOS-supported types; free-form (per HA docs). |
| Foreground presentation | One labeled segmented toggle group (Alert / Badge / Sound) — **multi-select**, each active segment showing an explicit on/off check, plus a one-line explanation. |
| Action buttons | Each button rendered as a bordered card (header preview + fields + tap-to-perform block). |
| Config schema | Unchanged. Editor load/save adapts to the existing keys. |

## Design detail

### 1. Collapsible sections

Each of the seven groups (Basics, Targets, Actions, Map, Media, Advanced, Live
Activity) becomes a bordered card: a clickable header (chevron + title +
optional subtitle and/or a small count chip like "2 devices") over a body that
shows/hides on click.

**Smart default open state**, evaluated in `oneditprepare` when the dialog opens.
State is not persisted (Node-RED reopens the dialog fresh each time; expected
editor behavior).

- **Basics and Targets are always open.**
- Every other section opens iff it **holds a non-default value**, decided
  mechanically rather than by hand-listing fields (hand-listing is how the field
  that matters gets forgotten). The rule is: *a section auto-opens if any field
  mapped to that section differs from its `defaults` value declared in
  `registerType`* — with three named exceptions where a raw comparison is wrong:

  1. **`staggerMs` (Advanced)** — its editor default is `1000`, but nodes saved
     before the field existed have `undefined`/`''`, and `normalizeNodeConfig`
     treats `undefined`/`''`/`1000` all as the default 1000. Treat all three as
     "default" (do not auto-open Advanced for them).
  2. **Sound (Advanced)** — compare the **resolved** value
     `soundFieldValue(customSound, customSoundPreInstalled) !== 'default'`, not
     the raw keys (an old node with `customSoundPreInstalled: 'default'`,
     `customSound: ''` is still default).
  3. **`presentationOptions` (Advanced)** — an array; "non-default" means
     `length > 0`, not `!== []` (array identity comparison is always true).

- **Field → section map** (the authoritative list the predicate iterates; every
  config field appears exactly once):

  | Section | Fields |
  |---|---|
  | Basics (always open) | `title`, `subtitle`, `message`, `group`, `tag`, `notificationUrl` |
  | Targets (always open) | `services`, `cameraEntity` |
  | Actions | `actions` (open when non-empty) |
  | Map | `firstLatitude`, `firstLongitude`, `secondLatitude`, `secondLongitude`, `showLineBetweenPoints`, `showCompass`, `showPointsOfInterest`, `showScale`, `showTraffic`, `showUserLocation` |
  | Media | `imagePath`, `videoPath`, `audioPath`, `contentUrl`, `contentType`, `lazyLoading`, `hideThumbnail` |
  | Advanced | `customSound`, `customSoundPreInstalled` (via resolved sound), `interruptionLevel`, `userInfo`, `isClearNotificationsOnAction`, `staggerMs`, `debugMode`, `badge`, `presentationOptions` |
  | Live Activity | `liveActivity`, `progress`, `progressMax`, `chronometer`, `when`, `whenRelative`, `notificationIcon`, `notificationIconColor`, `color`, `backgroundColor`, `textColor` |

- **Live Activity** opens if `liveActivity` is on **or any other Live Activity
  field is non-default** — not solely on the checkbox (a node with `progress`/
  `when`/`notificationIcon` set but the toggle off still holds non-default
  values in that section).

### 2. Alignment

Inside each section, fields use one consistent two-column layout: a fixed-width
label column and a control column that fills the remaining width, so every
input's left and right edges line up. Paired inputs (lat/long, progress/max,
the accent/bg/text color trio) sit in a sub-grid **within the control column**,
each with a small caption (e.g. "Latitude", "Longitude"), instead of the
current side-by-side percentage-width boxes. This removes all ad-hoc inline
`width` styles.

### 3. Placeholders

Every free-text input gets a realistic placeholder that clears on typing —
e.g. Title "e.g. Front Door", Message "e.g. Someone is at the door", Tag
"auto-generated if left blank", Camera entity "camera.front_door", Image
"/local/front_door.jpg or camera.front_door", lat/long "40.0209" / "-75.1180".
Placeholders describe the value, never restate the label.

### 4. Unified pickers — one searchable widget

The device picker (notify targets) already established this pattern
(implemented, committed as `feat: iOS device picker…`): a type-or-pick field
with a suggestion dropdown, backed by a jQuery-UI-autocomplete-style widget
(jQuery UI ships with the Node-RED editor — no new dependency), free-type
always allowed. This redesign brings the remaining known-but-open fields onto
the same widget.

**Governing rule:** a field becomes a searchable combo when it has a known set
of good values but an open long tail (the user may legitimately type something
not in the list). A field stays a plain `<select>` when its values are a fixed,
closed enum. Under this rule:

- **Combos:** notify devices (done), sound, camera entity, tap-to-perform
  service, tap-to-perform entity, content type.
- **Plain selects (unchanged):** Interruption Level, per-action Activation Mode.

**Camera entity.** Today a native `<datalist>` (`camera.*` entities). Per the
governing rule it becomes the searchable widget for consistency, reading from
`/ha-ios-notification/camera-entities` (which already exists), free-type
retained.

**Sound (merge two fields → one).** The 127-entry bundled `<select>` and the
separate `customSound` text box merge into a single searchable field. The
verified bundled-sound list moves into a `<datalist>` (or equivalent option
store) that the field's autocomplete reads as its suggestion source; the field
still accepts any free-typed filename. Load/save behavior and the exact value
resolution are specified under Backward Compatibility.

**Tap-to-perform Service + Target-entity.** Both upgrade from native
`<datalist>` to the searchable widget. The Service field reads its suggestions
from the existing `/ha-ios-notification/callable-services` endpoint (all
`domain.service` strings). The Target-entity field filters its suggestions to
the **domain of the currently-selected service** in the same action row: it
derives the domain from the service value (text before the first `.`, matching
how the runtime parses `targetService`) and requests
`/ha-ios-notification/entities?prefix=<domain>.` — the endpoint already reads
this `prefix` param and applies `id.startsWith(prefix)` (the trailing `.` keeps
`light.` from matching a `light_switch`-style domain). With no service selected,
it falls back to unfiltered entity suggestions. Free-type is always allowed.

**Fetch strategy for the per-row entity picker.** Suggestions are fetched per
action row keyed by the row's current service domain. To avoid N redundant GETs
per dialog open (one node can have many action cards): fetch lazily on first
focus/keystroke of the entity field and re-fetch only when the row's service
domain changes; cache the result per domain within the dialog session; debounce
typing. The service picker's suggestions (all callable services) are fetched
once and shared across rows.

**Content type.** A searchable combo. Per the HA companion attachments docs the
value is free-form (HA auto-detects it from the file; this field is an
override), so it is **not** a locked `<select>`. Its suggestions are the
iOS-supported attachment types — image: `jpeg`, `png`, `gif`; video: `mpeg`,
`mp4`, `avi`; audio: `aiff`, `wav`, `mp3`, `m4a` — with a hint that it is
usually auto-detected and only set to override.

### 5. Foreground presentation

The three loose `presentationOptions` checkboxes (alert / badge / sound) become
one labeled segmented toggle group: a bordered control with three toggle
buttons, plus a one-line explanation ("How the notification shows while the app
is already open").

**Multi-select, made explicit.** These three options are independent on/off
toggles, not a pick-one choice — but a plain segmented control conventionally
reads as single-select. To remove that ambiguity, each **active** segment shows
an explicit on indicator (a check glyph), and toggling one segment never affects
the others. The visual must not rely on pressed-vs-unpressed styling alone
(insufficient contrast in some dark themes) — the per-segment check is required.

It reads and writes the same `presentationOptions` array — purely a nicer UI
over the existing config key. **Emit order:** write the array in fixed order
`['alert', 'badge', 'sound']` (matching today's DOM/checkbox order) so re-saving
a node with 2+ options on does not produce a spurious flow-file diff. All-off
produces `[]`, byte-identical to the current three-unchecked-checkboxes case
(verified: `normalizeNodeConfig` passes arrays through and the builder emits
`presentation_options` only when non-empty).

### 6. Action cards

Each entry in the Actions editable list renders as a bordered card:

- **Header:** drag grip, the action's output number, a live preview of its
  title, and a delete control.
- **Body:** Title / optional ID; Activation (select) / optional URI;
  Destructive and Requires-auth checkboxes; then a visually separated
  tap-to-perform block with the Service and Target-entity combos.

This keeps a multi-button configuration from collapsing into an
undifferentiated stack of inputs. The editable list stays a single
`editableList` (add / remove / reorder) — only the per-row rendering changes.

**Save invariants the row renderer must preserve** (a rewrite of `oneditsave`'s
per-row collector must not change any of these — they define the saved `actions`
shape the runtime and outputs depend on):

- `this.outputs = actions.length` after collecting — this drives the node's
  dynamic output count.
- Rows with an empty title are dropped (not saved as blank actions).
- Optional keys are emitted only when non-empty: `id`, `uri`, `targetService`,
  `targetEntityId` (and `targetData` if/when added). Never save `id: ''` etc. —
  that changes the saved shape and, for `id`, the action-routing fallback.
- `activation`, `destructive`, `authenticationRequired` are always written.

**Reorder = renumber.** The header shows each action's output number (its index).
Reordering cards remaps outputs by index (wires stay attached by position), same
as today — now that the number is displayed prominently, the card header should
make this legible ("Output N"), but the behavior is unchanged.

## Backward compatibility & migration

The config schema is unchanged; the editor adapts to the existing keys.

**Sound field.** Two keys remain in the config: `customSound` (free text) and
`customSoundPreInstalled` (formerly the dropdown; default `'default'`). The
runtime payload builder is unchanged — it already resolves
`pick(…customSound…, config.customSoundPreInstalled) || 'default'`, i.e.
`customSound` wins when set.

- **On load**, the combined field shows a single resolved value:
  `customSound` if it is a non-empty string, else `customSoundPreInstalled` if
  non-empty, else `'default'`. This is a pure function `soundFieldValue(customSound,
  customSoundPreInstalled)` — unit-tested (see Testing).
- **On save**, the field's value is written to `customSound`, and
  `customSoundPreInstalled` is reset to `'default'`. This makes `customSound`
  the single source of truth going forward while leaving the runtime result
  identical.

This migrates transparently:

| Existing state | Loads as | Saves as | Runtime result (before & after) |
|---|---|---|---|
| `customSoundPreInstalled: 'Morgan…wav'`, `customSound: ''` | `Morgan…wav` | `customSound: 'Morgan…wav'`, preinstalled `'default'` | `Morgan…wav` |
| `customSound: 'my_upload.wav'` | `my_upload.wav` | `customSound: 'my_upload.wav'`, preinstalled `'default'` | `my_upload.wav` |
| fresh node (`'default'`, `''`) | `default` | `customSound: 'default'`, preinstalled `'default'` | `default` |
| field cleared to empty | `` (empty) | `customSound: ''`, preinstalled `'default'` | `default` (empty ⇒ default) |
| `none` (No Sound) | `none` | `customSound: 'none'` | `none` |

Existing nodes work correctly **before** re-save too, because the runtime reads
both keys and `customSound` wins only when non-empty.

Two things the manual verifier should expect (neither is a runtime bug):

- **Load display is one-way, not a round-trip.** A node saved with an *empty*
  `customSound` re-loads showing `default` (the load rule falls through), not
  empty — the "Loads as `(empty)`" row above is only the pre-save state. The
  runtime result is `default` either way.
- **Expected flow-diff churn on re-save.** Re-saving any existing node after
  this change rewrites its `customSound`/`customSoundPreInstalled` keys (and a
  fresh/default node materializes `customSound: 'default'` where `''` was),
  marking the node modified and dirtying the flow-file diff. This is correct and
  intended — the save-and-diff verification should treat these specific key
  rewrites, and the fixed `presentationOptions` ordering, as the *expected*
  diff, and anything else as a regression.

**Everything else.** All other fields keep their existing keys and value shapes;
the redesign only changes how they're laid out and which widget renders them.
`presentationOptions` (same array, fixed order), `services`, `actions`,
map/media keys, badge, Live Activity keys — all unchanged.

## Testing

Node-RED editor UI (the client-side `<script>` in the `.html`) is not exercised
by the Mocha / `node-red-node-test-helper` suite, so most verification is code
review plus a manual pass in the live Node-RED editor (load an existing node,
confirm smart-open, confirm each picker, save and diff the config).

The one piece of genuinely testable logic is the sound-value resolution, whose
backward-compat behavior must be pinned:

- `soundFieldValue(customSound, customSoundPreInstalled)` → the string to
  display in the combined field, per the load rule above. Tests cover: custom
  wins over preinstalled; preinstalled used when custom empty; `'default'`
  fallback when both empty; `'none'` preserved; non-string inputs handled.

**Single-sourced across the runtime/editor boundary (no duplication).** The
Node-RED editor `<script>` runs in the browser and cannot `require()` a Node
module — but Node-RED serves a package's `resources/` directory to the editor at
`resources/node-red-contrib-ha-ios-notification/<file>`. So `soundFieldValue`
lives in **one** file, `resources/sound-field.js`, written with a small
dual-export guard:

```js
(function (root) {
  function soundFieldValue(customSound, customSoundPreInstalled) { /* … */ }
  if (typeof module !== 'undefined' && module.exports) module.exports = { soundFieldValue };
  else root.haIosSoundField = { soundFieldValue };
})(typeof window !== 'undefined' ? window : this);
```

The Mocha test `require()`s it directly; the editor loads it once via
`<script src="resources/node-red-contrib-ha-ios-notification/sound-field.js">`
in `ha-ios-notification.html` and calls `haIosSoundField.soundFieldValue(...)`
in `oneditprepare`. One source, unit-tested, no byte-sync discipline. `resources/`
must be added to `package.json`'s `files` allowlist so it ships. (This function
is editor-only logic — the node runtime never calls it; it lives in `resources/`
rather than `lib/` precisely because its consumer is the browser editor, not the
runtime.)

The save direction (write the field value to `customSound`, reset
`customSoundPreInstalled` to `'default'`) is trivial editor code, covered by the
manual save-and-diff check rather than a unit test.

No new automated coverage is added for the pure layout/placeholder/segmented-
control changes (they carry no logic). The existing suite must still pass
unchanged (it does not touch the `.html`).

## Files affected

- `ha-ios-notification.html` — the bulk of the work: section cards, aligned
  grid, placeholders, merged sound field, tap-to-perform combos with domain
  filtering, content-type combo, segmented foreground control, action cards,
  and the smart-open logic in `oneditprepare`.
- `ha-ios-notification.js` — no changes required for the pickers (the `/entities`
  `prefix` param and the `/callable-services` / `/camera-entities` endpoints
  already exist and return what the upgraded pickers need).
- `resources/sound-field.js` (new) — the single-sourced `soundFieldValue` (dual
  export; `require()`d by the test, `<script src>`-loaded by the editor).
- `test/unit/sound-field.spec.js` (new) — its unit tests.
- `package.json` — add `resources/` to the `files` allowlist so the resource
  ships in the published package.

## Out of scope

- Any change to the node runtime, payload builders, or saved config schema.
- Persisting section open/collapsed state across dialog opens.
- Adding a `targetData` editor input (a separate, previously-noted gap — not
  part of this redesign).
- The bundled-sound catalog contents (already verified in the node's own spec).

## Manual verification (run at deploy)

In a live Node-RED editor with the HA server configured:

1. **Open an existing (pre-redesign) node.** Basics + Targets open; any section with real values auto-opens (e.g. Actions if it has buttons, Advanced if a non-default sound/badge). Sections with no content stay collapsed. No section wrongly opens for a `staggerMs` of 1000/blank.
2. **Sound field** shows the node's current sound resolved into one box; the dropdown lists bundled sounds and filters as you type; a typed custom filename is accepted; clearing it and saving yields the default sound.
3. **Foreground presentation** shows the saved options as checked segments; toggling one doesn't change the others; each active segment shows a check.
4. **Tap-to-perform:** picking a service (e.g. `lock.unlock`) makes the entity field suggest only `lock.*`; free-typing any entity still works.
5. **Camera + content-type** combos suggest and free-type.
6. **Alignment:** every field's control edge lines up down each section; paired fields (lat/long, progress/max, colors) align under the control column.
7. **Save with no changes, then check the flow diff:** only expected churn — `customSound`/`customSoundPreInstalled` rewrite and `presentationOptions` fixed ordering. Re-open: config is identical in meaning; send a test notification and confirm the same sound/behavior as before.
8. **Theme:** confirm it reads correctly in the midnight-red dark theme and a light theme (colors come from `--red-ui-*`).
