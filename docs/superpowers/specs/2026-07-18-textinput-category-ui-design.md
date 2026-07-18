# Text-Input Actions & Category UI — Design Spec

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

These are the last field-parity gaps vs the old `iOS Actionable Notification`
subflow (see the sibling migration spec in the `homeassistant` repo). Closing
them lets the migration convert every in-scope notification through the editor.

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

No `haDefaults` change (action props live in the `actions[]` objects). No payload
change (already handled by `IOS_ACTION_PROPS`).

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

## Testing

- **Unit (`test/unit`, Mocha):**
  - `build-payload`: given `config.categoryName = "parking"`, payload has
    `data.push.category === "parking"`; given empty/undefined, `category` is
    absent; given `msg.notificationOverride.categoryName`, the override wins.
  - action passthrough: an action with `behavior:"textInput"` +
    `textInputButtonTitle` + `textInputPlaceholder` survives `normalizeActions`
    and lands in `data.actions[i]` with those props (guards the wiring the UI
    depends on).
- **Editor UI (manual, `docs/TESTING.md` checklist):** add a checklist item —
  create an action, tick "Text input", set button/placeholder, deploy, read back
  the node JSON, confirm `behavior:"textInput"` + the two fields; and a Category
  field round-trips to `categoryName`. (The config panel has no automated DOM
  test harness — consistent with the existing redesign, which is manual-verified.)

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
