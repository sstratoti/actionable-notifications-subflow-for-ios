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

- **Editor-only.** No change to the saved config schema or the node runtime.
  Every existing flow that uses this node keeps working with no edits.
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
| Default open state | **Smart:** Basics + Targets always open; any section holding non-default values auto-opens; the rest collapsed. Per-dialog-open (not persisted). |
| Alignment | One uniform label/control grid per section; paired fields get sub-labels and align under the control column. |
| Placeholders | Realistic sample data in every free-text field. |
| Value pickers | Known-but-open value sets → one searchable type-or-pick combo (the device-picker widget). Genuinely fixed sets stay plain `<select>`. |
| Sound field | Merge the bundled `<select>` and the "custom sound" box into one searchable combo. |
| Tap-to-perform pickers | Upgrade Service + Target-entity from `<datalist>` to the searchable widget; entity suggestions filter to the chosen service's domain. |
| Content type | Searchable combo suggesting iOS-supported types; free-form (per HA docs). |
| Foreground presentation | One labeled segmented toggle (Alert / Badge / Sound) with a one-line explanation. |
| Action buttons | Each button rendered as a bordered card (header preview + fields + tap-to-perform block). |
| Config schema | Unchanged. Editor load/save adapts to the existing keys. |

## Design detail

### 1. Collapsible sections

Each of the seven groups (Basics, Targets, Actions, Map, Media, Advanced, Live
Activity) becomes a bordered card: a clickable header (chevron + title +
optional subtitle and/or a small count chip like "2 devices") over a body that
shows/hides on click.

**Smart default open state**, evaluated when the edit dialog opens:

- Basics and Targets are always open.
- A section opens if it holds a non-default value — e.g. Actions opens when at
  least one action exists; Map opens when a latitude is set; Media opens when a
  path/URL is set; Advanced opens when a non-default sound/interruption/badge/
  toggle is set; Live Activity opens when its checkbox is on.
- Otherwise the section is collapsed.

Each section defines a small predicate `hasContent(config)` deciding auto-open.
State is not persisted (Node-RED reopens the dialog fresh each time; this is the
expected editor behavior).

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

- **Combos:** notify devices (done), sound, tap-to-perform service,
  tap-to-perform entity, content type.
- **Plain selects (unchanged):** Interruption Level, per-action Activation Mode.

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
derives the domain from the service value (text before the first `.`) and
requests `/ha-ios-notification/entities?prefix=<domain>.` — the endpoint already
supports this `prefix` param. With no service selected, it falls back to
unfiltered entity suggestions. Free-type is always allowed.

**Content type.** A searchable combo. Per the HA companion attachments docs the
value is free-form (HA auto-detects it from the file; this field is an
override), so it is **not** a locked `<select>`. Its suggestions are the
iOS-supported attachment types — image: `jpeg`, `png`, `gif`; video: `mpeg`,
`mp4`, `avi`; audio: `aiff`, `wav`, `mp3`, `m4a` — with a hint that it is
usually auto-detected and only set to override.

### 5. Foreground presentation

The three loose `presentationOptions` checkboxes (alert / badge / sound) become
one labeled segmented toggle group: a bordered control with three toggle
buttons, each showing an on/off state, plus a one-line explanation ("How the
notification shows while the app is already open"). It reads and writes the same
`presentationOptions` array — purely a nicer UI over the existing config key.

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

**Everything else.** All other fields keep their existing keys and value shapes;
the redesign only changes how they're laid out and which widget renders them.
`presentationOptions`, `services`, `actions`, map/media keys, badge, Live
Activity keys — all unchanged.

## Testing

Node-RED editor UI (the client-side `<script>` in the `.html`) is not exercised
by the Mocha / `node-red-node-test-helper` suite, so most verification is code
review plus a manual pass in the live Node-RED editor (load an existing node,
confirm smart-open, confirm each picker, save and diff the config).

The one piece of genuinely testable logic is the sound-value resolution, whose
backward-compat behavior must be pinned. It is captured as a pure function in
`lib/` and unit-tested:

- `soundFieldValue(customSound, customSoundPreInstalled)` → the string to
  display in the combined field, per the load rule above. Tests cover: custom
  wins over preinstalled; preinstalled used when custom empty; `'default'`
  fallback when both empty; `'none'` preserved; non-string inputs handled.

**Browser constraint (explicit).** The Node-RED editor `<script>` runs in the
browser and cannot `require()` a `lib/` module, so the editor cannot import this
function directly. The function therefore lives in **two** places: the tested
`lib/sound-field.js` (the authoritative contract), and a byte-identical inline
copy in the editor `oneditprepare`. They must stay in sync; the unit test is the
guard on the contract, and the manual save-and-diff check confirms the editor
copy behaves the same. This small, deliberate duplication is accepted because
there is no way to share code across the Node/runtime and browser/editor
boundary in a Node-RED node. The logic is a few lines and stable.

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
- `ha-ios-notification.js` — no changes required (the `/entities` `prefix` param
  and `/callable-services` endpoints already exist and already return the data
  the upgraded pickers need).
- `lib/sound-field.js` (new) — the `soundFieldValue` pure function (the tested
  contract; mirrored inline in the editor per the browser constraint above).
- `test/unit/sound-field.spec.js` (new) — its unit tests.

## Out of scope

- Any change to the node runtime, payload builders, or saved config schema.
- Persisting section open/collapsed state across dialog opens.
- Adding a `targetData` editor input (a separate, previously-noted gap — not
  part of this redesign).
- The bundled-sound catalog contents (already verified in the node's own spec).
