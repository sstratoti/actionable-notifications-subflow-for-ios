# Config-Panel Completion & Polish — Design Spec

*(text-input actions · categoryName · action icon · action targetData drill-down · layout fixes · Live Activity "Beta" badge)*

**Date:** 2026-07-18
**Status:** Draft — awaiting Steve's review (brainstorming session, 2026-07-18)
**Repo:** `sstratoti/actionable-notifications-subflow-for-ios`
(`node-red-contrib-ha-ios-notification`). Current branch:
`feature/ha-ios-notification-node`.

## Goal

Expose two capabilities as **first-class config-UI fields** on the
`ha-ios-notification` node, instead of requiring them via `msg.notificationOverride`
or hand-authored JSON:

1. **Text-input actions** — an action whose button opens a text field (e.g.
   "Where did you park?" → the user types a reply).
2. **`categoryName`** — a notification-level iOS category name.
3. **Action `icon`** — the SF Symbol shown on an action button (used 16× by the
   old subflow; the payload builder already passes `icon` through, but the action
   card has no control for it).
4. **Action `targetData`** — service-data (JSON) for the tap-to-perform feature,
   authored via a **drill-down JSON editor** (click to expand → edit → save →
   return), with a filled/empty indicator on the parent field.
5. **Config-panel layout fixes** (bugs found in review) — see "Config-panel
   fixes" below.

These are the last field-parity gaps vs the old `iOS Actionable Notification`
subflow (a full UI audit confirmed everything else is exposed — sound via the
combo, presentation options via the segmented control, all map/media/Live-Activity
fields). Closing them lets the migration convert every in-scope notification
through the editor.

## Background (current state)

- **Text input** is **half-built**: the payload builder already passes
  `behavior`, `textInputButtonTitle`, `textInputPlaceholder` through
  (`lib/action-list.js` `IOS_ACTION_PROPS`), and iOS renders a text field when an
  action has `behavior: "textInput"`. Only the **action-editor UI + save logic**
  are missing — there is no control to author these today.
- **Category** is **absent**: the `category: 'home_assistant'` in
  `ha-ios-notification.html` is the *Node-RED palette* category, not an iOS
  notification category. The builder emits **no** `data.push.category`. So this
  is a genuine new field + payload emission, not a hidden setting.

## Design decisions (from brainstorming)

- **Text-input UX:** a **"Text input" checkbox** per action card. When checked it
  sets `behavior:"textInput"` and reveals **"Button title"** + **"Placeholder"**
  inputs; when unchecked those are hidden and `behavior`/text-input props are not
  emitted. Load state: if a saved action has `behavior==="textInput"`, the box is
  pre-checked and the two fields populated.
- **Category:** a **"Category" text field in the Basics section**, config key
  `categoryName`, emitted as **`data.push.category`** when non-empty.

## Components & changes

### 1. `ha-ios-notification.html` — action editor (text input)

In the action-list `addItem` (~l.345–393), after the Destructive/Requires-auth
row and before the tap-to-perform block, add:
- a `.action-textInput` checkbox labelled "Text input";
- a collapsible sub-block with `.action-textInputButtonTitle` and
  `.action-textInputPlaceholder` text inputs, shown only when the checkbox is
  checked (toggle on `change`).
Pre-populate from `data`: `checked = data.behavior === 'textInput'`,
button/placeholder from `data.textInputButtonTitle` / `data.textInputPlaceholder`.

In the action save/read logic (~l.437–449), per action:
- if the checkbox is checked → set `action.behavior = 'textInput'`,
  `action.textInputButtonTitle = <field>`, `action.textInputPlaceholder = <field>`;
- else → leave `behavior` unset and omit the two props.

**Action `icon` field:** add an "Icon · optional" text input (`.action-icon`,
placeholder e.g. `sfsymbols:car`) to the action card — a natural spot is the
URI row or next to Title. Pre-populate from `data.icon`; on save set
`action.icon = <field>` when non-empty. No payload change (`icon` is already in
`IOS_ACTION_PROPS`).

No `haDefaults` change (action props live in the `actions[]` objects). No payload
change for either text-input or icon (both already handled by `IOS_ACTION_PROPS`).

### 2. `ha-ios-notification.html` — Basics field (category)

- Add `categoryName: { value: '' }` to `haDefaults`.
- Add a "Category · optional" `<input id="node-input-categoryName">` in the Basics
  section (near Tag/Group), bound via Node-RED's standard `node-input-<key>`
  mechanism so it loads/saves automatically.

### 3. `lib/build-payload.js` — emit category

- Resolve with the existing precedence helper:
  `const category = pickNullish(nb.categoryName, ovNb.categoryName, config.categoryName);`
  (supports `msg.notificationOverride.categoryName` override, matching other fields).
- In the `data.push` object (alongside `sound` / `interruption-level` / `badge`),
  add: `...(category ? { category } : {})`.

## Config-panel fixes & additions (from review)

All in `ha-ios-notification.html` (CSS + the `oneditprepare` builders).

### Layout bugs
- **Targets: always show ≥1 row.** The services `editableList` only adds rows for
  existing `node.services` (l.282). After populating, if the list is empty, add
  one empty row (`addItem({ deviceName: '' })`) so the first target line always
  exists.
- **"Actionable Buttons" label wraps.** It's a plain `.form-row label`, which
  Node-RED caps at ~100px → the text wraps. Give this label
  `display:block; width:auto` (a small class) so it sits on one line above the
  list.
- **Action checkboxes misaligned** ("Destructive" trailing gap, "Requires auth"
  wraps). Root cause: `.ha-check` is a `<label>` and inherits Node-RED's ~100px
  label width, so it's capped inside its `1fr` grid cell. Fix: `.ha-check { width:auto }`
  and make `.ha-checks` a `display:flex; flex-wrap:wrap; gap:6px 18px` row so the
  two checks sit naturally side-by-side.
- **Combo caret: gap + inert.** Two issues: (1) in action cards the input isn't
  full-width in `.ha-with-caret`, so the caret sits at the container edge (the
  gap) — fix with `.ha-with-caret input { width:100%; box-sizing:border-box }`;
  (2) `.ha-caret { pointer-events:none }` makes it decorative — remove that, add
  `cursor:pointer`, and a click handler that opens the dropdown
  (`input.focus(); input.autocomplete('search','')`). Apply to **all** caret
  instances (action Service/Target-entity + the main-form camera/service/entity
  pickers).

### Action `targetData` — drill-down JSON editor
- In each action card's tap-to-perform block, add a **"Service data (JSON)"**
  control: a read-only summary field + an **Edit** affordance that opens
  `RED.editor.editJSON({ value, complete })` (Node-RED's built-in JSON editor
  overlay — click to drill in, Save/Done returns to the action card).
- Store the result as `action.targetData` (object/JSON). On return, set a
  **filled/empty indicator** on the parent (e.g. the summary shows `{…} set` vs
  `empty`, or a filled dot). Pre-populate from `data.targetData` on load.
- No payload change: `targetData` is already in `TAP_TARGET_PROPS`.

### Live Activity "Beta" badge
- Add a small **"Beta"** pill (`.ha-beta`) next to the Live Activity section's
  `.ha-s-title`, and set its `.ha-s-sub` / a note in the body to: **"Requires the
  TestFlight build of the HA iOS Companion App."** Purely presentational — a
  `.ha-beta` CSS pill + the copy; no behavior change.

## Testing

- **Unit (`test/unit`, Mocha):**
  - `build-payload`: given `config.categoryName = "parking"`, payload has
    `data.push.category === "parking"`; given empty/undefined, `category` is
    absent; given `msg.notificationOverride.categoryName`, the override wins.
  - action passthrough: an action with `behavior:"textInput"` +
    `textInputButtonTitle` + `textInputPlaceholder` (and `icon`) survives
    `normalizeActions` and lands in `data.actions[i]` with those props (guards the
    wiring the UI depends on).
- **Editor UI (manual, `docs/TESTING.md` checklist):** add checklist items and
  read back the node JSON to confirm each round-trips:
  - Action "Text input" checkbox → `behavior:"textInput"` + button/placeholder.
  - Action "Icon" → `action.icon`.
  - Action "Service data" drill-down → `action.targetData` (JSON), with the
    filled/empty indicator updating.
  - "Category" field → `categoryName`.
  - Layout: first target row always present; "Actionable Buttons" on one line;
    Destructive/Requires-auth side-by-side without wrap; caret sits flush to the
    input and **clicking it opens the dropdown**.
  - Live Activity section shows the "Beta" pill + TestFlight note.
  (The config panel has no automated DOM test harness — consistent with the
  existing redesign, which is manual-verified.)

## Rollout to Node-RED (important — this is what bit us)

Editing the source does **nothing** to the running node until it is rebuilt and
reinstalled. After merge:
1. `npm test` green on the feature branch.
2. `npm pack` → produces `node-red-contrib-ha-ios-notification-<v>.tgz`.
3. Copy the tgz into the Node-RED user dir and `npm install ./<tgz>` there.
4. `docker restart node-red`; confirm clean load in `docker logs node-red`.
5. Verify in the editor (the manual checklist).

Version: bump the package `version` (e.g. `0.2.0`) so the reinstall is
unambiguous, and add a CHANGELOG entry under the unreleased section.

## Out of scope

- Android text-input behavior.
- Pre-registered/static iOS categories beyond passing the name through (HA still
  auto-registers inline `actions`; a named category simply rides along on
  `data.push.category`).
- Any change to the notification-migration effort itself (separate repo/spec) —
  though once this ships, the migration's `categoryName` gap is closed and
  text-input actions become editor-authorable.

## Deliverable

A feature branch off `feature/ha-ios-notification-node` (e.g.
`feature/textinput-category-ui`) with the three code changes, unit tests, a
CHANGELOG entry, and the manual-verification checklist item — then the
rebuild→reinstall→restart rollout.
