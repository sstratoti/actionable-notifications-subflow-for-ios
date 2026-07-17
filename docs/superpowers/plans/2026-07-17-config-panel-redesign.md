# Config Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `ha-ios-notification` node's Node-RED editor panel for clarity and usability — collapsible bordered sections with smart default-open, uniform label/control alignment, sample-data placeholders, unified searchable pickers (merged sound field, tap-to-perform service/entity with domain filtering, camera + content-type combos), a multi-select segmented foreground control, and action cards — with zero change to the saved config schema or runtime.

**Architecture:** Almost all work is in the single editor file `ha-ios-notification.html` (a Node-RED node HTML with a `registerType` `<script>`, a `data-template-name` config template, and a `data-help-name` help block). The one piece of genuinely testable logic — sound-value resolution — is single-sourced in `resources/sound-field.js` (a Node-RED-served browser resource with a dual export), unit-tested under Mocha and `<script src>`-loaded by the editor. No runtime file changes (all admin endpoints the pickers need already exist).

**Tech Stack:** Node-RED editor (jQuery + jQuery UI autocomplete, both bundled with the editor — no new dependency), Node-RED `--red-ui-*` theme CSS variables, Mocha + should.

## Global Constraints

Copied from the spec (`docs/superpowers/specs/2026-07-17-config-panel-redesign-design.md`). Every task implicitly includes these.

- **Editor-only.** No change to the saved config schema or the node runtime. Every existing flow keeps working with no edits. In-scope non-runtime additions: `resources/sound-field.js` + its test, and a `package.json` `files`-allowlist entry.
- **Backward compatible.** Existing saved nodes open correctly and, when re-saved, migrate cleanly with identical runtime behavior.
- **Use Node-RED theme variables, never hardcoded colors.** All CSS colors use `--red-ui-*` variables (with a literal fallback) so the panel inherits the user's theme (midnight-red, light, etc.). Do not hardcode theme colors. The one exception is the semantic "iOS" chip accent, which is a fixed blue chosen to read on both light and dark grounds.
- **One runtime-adjacent touch only:** the tap-to-perform entity picker requests `/ha-ios-notification/entities?prefix=<domain>.` (the endpoint and `getEntities(ha, prefix)` already apply this). No other behavior change.
- **Config schema unchanged.** Editor load/save adapts to the existing keys. In particular:
  - Sound: on load show `soundFieldValue(customSound, customSoundPreInstalled)`; on save write the value to `customSound` and set `customSoundPreInstalled` to `'default'`.
  - `presentationOptions`: emit in fixed order `['alert','badge','sound']`; all-off is `[]`.
  - Action save invariants preserved: `this.outputs = actions.length`; drop rows with empty title; emit optional keys (`id`, `uri`, `targetService`, `targetEntityId`) only when non-empty; always write `activationMode`, `destructive`, `authenticationRequired`.
- **Combos are free-type.** Every searchable picker (`haCombo`) always accepts arbitrary typed text; suggestions never restrict the value.
- **Existing test suite must stay green** (129 tests). The `.html` is not covered by it; editor UI is verified by code review + structural checks + a manual editor pass (final task).

---

## File structure

- `resources/sound-field.js` **(new)** — `soundFieldValue(customSound, customSoundPreInstalled)`, dual-exported (CommonJS for the test, `window.haIosSoundField` for the editor).
- `test/unit/sound-field.spec.js` **(new)** — unit tests for `soundFieldValue`.
- `package.json` **(modify)** — add `"resources/"` to `files`.
- `ha-ios-notification.html` **(modify, the bulk)** — CSS block; resource `<script src>`; collapsible section shells + `toggle()` + smart-open; the `haCombo` helper; per-section field rework (grid, placeholders, combos, sound merge, segmented foreground, action cards).
- `docs/superpowers/plans/…` / spec status — final task marks the spec implemented.

Task order (per the spec's sequencing note: mechanical/low-risk first, the one saved-value change — sound — isolated and late):

1. `soundFieldValue` resource + test + packaging (TDD)
2. Editor CSS + collapsible-section framework + smart-open + `haCombo` helper
3. Basics + Targets internals (grid, placeholders, camera combo)
4. Map + Media + Live Activity internals (grids, sub-labels, placeholders, content-type combo)
5. Advanced internals (sound merge + segmented foreground + grid)
6. Actions internals (action cards + tap-to-perform domain-filtered combos)
7. Full-suite + lint + packaging check + manual-verification checklist

---

## Task 1: `soundFieldValue` resource, unit test, packaging

**Files:**
- Create: `resources/sound-field.js`
- Test: `test/unit/sound-field.spec.js`
- Modify: `package.json` (the `files` array)

**Interfaces:**
- Produces: `soundFieldValue(customSound, customSoundPreInstalled): string` — CommonJS export `{ soundFieldValue }` for tests, and `window.haIosSoundField.soundFieldValue` in the browser. Consumed by Task 2 (smart-open sound exception) and Task 5 (sound field load).

- [ ] **Step 1: Write the failing test**

```js
// test/unit/sound-field.spec.js
'use strict';

require('should');
const { soundFieldValue } = require('../../resources/sound-field');

describe('sound-field', () => {
  describe('soundFieldValue', () => {
    it('returns customSound when it is a non-empty string (wins over preinstalled)', () => {
      soundFieldValue('my_upload.wav', 'US-EN-Morgan-Freeman-Front-Door-Opened.wav')
        .should.equal('my_upload.wav');
    });

    it('falls back to customSoundPreInstalled when customSound is empty', () => {
      soundFieldValue('', 'US-EN-Morgan-Freeman-Front-Door-Opened.wav')
        .should.equal('US-EN-Morgan-Freeman-Front-Door-Opened.wav');
    });

    it("returns 'default' when both are empty", () => {
      soundFieldValue('', '').should.equal('default');
    });

    it("returns 'default' when both are undefined", () => {
      soundFieldValue(undefined, undefined).should.equal('default');
    });

    it("preserves 'none' from customSound", () => {
      soundFieldValue('none', 'default').should.equal('none');
    });

    it("preserves 'none' from customSoundPreInstalled when customSound empty", () => {
      soundFieldValue('', 'none').should.equal('none');
    });

    it('treats null/non-string inputs as empty', () => {
      soundFieldValue(null, null).should.equal('default');
      soundFieldValue(42, 'US-EN-Alexa-Good-Morning.wav').should.equal('US-EN-Alexa-Good-Morning.wav');
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx mocha test/unit/sound-field.spec.js`
Expected: FAIL — `Cannot find module '../../resources/sound-field'`

- [ ] **Step 3: Write the implementation**

```js
// resources/sound-field.js
// Single-sourced across the runtime/editor boundary: CommonJS for the Mocha
// test, and window.haIosSoundField for the Node-RED editor (which loads this
// file via <script src="resources/node-red-contrib-ha-ios-notification/sound-field.js">).
// EDITOR-ONLY LOGIC — the node runtime never calls this.
(function (root) {
  'use strict';

  // Resolve the single value shown in the merged Sound field from the two
  // legacy config keys. customSound (free text) wins when set; else the
  // formerly-dropdown customSoundPreInstalled; else 'default'.
  function soundFieldValue(customSound, customSoundPreInstalled) {
    if (typeof customSound === 'string' && customSound !== '') return customSound;
    if (typeof customSoundPreInstalled === 'string' && customSoundPreInstalled !== '') {
      return customSoundPreInstalled;
    }
    return 'default';
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { soundFieldValue };
  } else {
    root.haIosSoundField = { soundFieldValue: soundFieldValue };
  }
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx mocha test/unit/sound-field.spec.js`
Expected: PASS — 7 passing

- [ ] **Step 5: Add `resources/` to the package `files` allowlist**

In `package.json`, change the `files` array from:

```json
  "files": [
    "ha-ios-notification.js",
    "ha-ios-notification.html",
    "lib/",
    "examples/",
    "README.md",
    "CHANGELOG.md"
  ],
```

to:

```json
  "files": [
    "ha-ios-notification.js",
    "ha-ios-notification.html",
    "lib/",
    "resources/",
    "examples/",
    "README.md",
    "CHANGELOG.md"
  ],
```

- [ ] **Step 6: Verify packaging includes the resource and the suite is green**

Run: `npm pack --dry-run 2>&1 | grep -E "resources/sound-field.js"`
Expected: the line appears (the resource ships).

Run: `npm test`
Expected: all pass — was 129, now 136 (7 new sound-field tests).

- [ ] **Step 7: Commit**

```bash
git add resources/sound-field.js test/unit/sound-field.spec.js package.json
git commit -m "feat: single-sourced soundFieldValue resource with unit tests"
```

---

## Task 2: Editor CSS, collapsible sections, smart-open, and the `haCombo` helper

This restructures `ha-ios-notification.html`: adds the redesign CSS (theme-variable-based), loads the sound-field resource, wraps the seven existing `<h4>` groups into collapsible bordered section shells, and adds the `toggle()`, smart-open, and `haCombo` logic. Field internals inside each section are left unchanged here — later tasks rework them. After this task the panel is collapsible, bordered, and smart-opens; all fields still work.

**Files:**
- Modify: `ha-ios-notification.html`

**Interfaces:**
- Produces (all in the editor `<script>` scope, used by Tasks 3–6):
  - `haCombo($input, sourceFn)` — attaches a free-type type-to-search dropdown to a text input. `sourceFn(term)` returns an array of `{ label, value }`.
  - `toggle(headEl)` — collapses/expands a section (used by section-head `onclick`).
  - `haDefaults` — the single defaults object shared by `registerType` and smart-open.
  - Section shells with ids `#ha-sec-basics`, `#ha-sec-targets`, `#ha-sec-actions`, `#ha-sec-map`, `#ha-sec-media`, `#ha-sec-advanced`, `#ha-sec-liveactivity`.
- Consumes: `window.haIosSoundField.soundFieldValue` (Task 1) for the Advanced sound exception in smart-open.

- [ ] **Step 1: Add the CSS block and the resource `<script src>` at the top of the file**

Replace the current top of `ha-ios-notification.html`:

```html
<!-- ha-ios-notification.html -->
<style>
  /* Keep the device-picker autocomplete dropdown above the Node-RED edit tray. */
  .ui-autocomplete.ui-menu { z-index: 10000 !important; }
</style>
<script type="text/javascript">
  RED.nodes.registerType('ha-ios-notification', {
```

with (note: colors use `--red-ui-*` theme vars with fallbacks; the resource script loads before the editor definition):

```html
<!-- ha-ios-notification.html -->
<script src="resources/node-red-contrib-ha-ios-notification/sound-field.js"></script>
<style>
  /* Autocomplete dropdown above the Node-RED edit tray. */
  .ui-autocomplete.ui-menu { z-index: 10000 !important; }

  /* ---- collapsible section card ---- */
  .ha-section {
    border: 1px solid var(--red-ui-secondary-border-color, #d5d5da);
    border-radius: 4px;
    margin-bottom: 10px;
    overflow: hidden;
  }
  .ha-section-head {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; cursor: pointer; user-select: none;
    background: var(--red-ui-tertiary-background, #f3f3f3);
    color: var(--red-ui-primary-text-color, #444);
  }
  .ha-section.ha-open > .ha-section-head { border-bottom: 1px solid var(--red-ui-secondary-border-color, #d5d5da); }
  .ha-section-head .ha-chev {
    transition: transform 0.15s ease; font-size: 11px; width: 11px; flex: none;
    color: var(--red-ui-secondary-text-color, #888);
  }
  .ha-section.ha-open > .ha-section-head .ha-chev { transform: rotate(90deg); }
  .ha-section-head .ha-s-title { font-weight: 600; }
  .ha-section-head .ha-s-sub { color: var(--red-ui-secondary-text-color, #888); font-size: 12px; }
  .ha-section-head .ha-s-count {
    margin-left: auto; font-size: 11px; color: var(--red-ui-secondary-text-color, #888);
    background: var(--red-ui-secondary-background, #fff); border-radius: 10px; padding: 0 8px;
    border: 1px solid var(--red-ui-secondary-border-color, #d5d5da);
  }
  .ha-section-body { padding: 10px; display: none; background: var(--red-ui-secondary-background, transparent); }
  .ha-section.ha-open > .ha-section-body { display: block; }
  .ha-note { color: var(--red-ui-secondary-text-color, #888); font-size: 12px; margin: 0 0 9px; }

  /* ---- aligned label/control grid ---- */
  .ha-grid { display: grid; grid-template-columns: 110px 1fr; gap: 8px 10px; align-items: center; }
  .ha-grid.ha-align-start { align-items: start; }
  .ha-grid > label { margin: 0; color: var(--red-ui-primary-text-color, #444); }
  .ha-grid > .ha-control { min-width: 0; }
  .ha-grid input[type="text"], .ha-grid input[type="number"], .ha-grid select, .ha-control input, .ha-control select {
    width: 100%; box-sizing: border-box;
  }

  /* paired / triple sub-grids that align under the control column */
  .ha-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .ha-triple { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .ha-sub { display: flex; flex-direction: column; gap: 2px; }
  .ha-sub small { color: var(--red-ui-secondary-text-color, #888); font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }

  /* tidy 2-col checkbox grid */
  .ha-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
  .ha-check { display: flex; align-items: center; gap: 7px; margin: 0; font-weight: normal; }
  .ha-check input { width: auto !important; margin: 0; flex: none; }
  .ha-hint { color: var(--red-ui-secondary-text-color, #888); font-size: 12px; margin-top: 5px; }
  .ha-divider { height: 1px; background: var(--red-ui-secondary-border-color, #e4e4e9); margin: 11px 0; border: 0; }

  /* combo caret affordance */
  .ha-with-caret { position: relative; }
  .ha-with-caret input { padding-right: 22px; }
  .ha-caret { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 9px; pointer-events: none; color: var(--red-ui-secondary-text-color, #888); }

  /* mono for technical values (device names / entity ids) */
  .ha-mono { font-family: var(--red-ui-monospace-font, monospace); font-size: 12px; }

  /* device picker rows (already present feature, restyled to match) */
  .ha-target-hint { color: var(--red-ui-secondary-text-color, #888); font-size: 12px; }
  .ha-chip { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; flex: none; }
  .ha-chip-ios { color: #1a6dff; background: rgba(74,144,255,0.14); }

  /* segmented foreground control (multi-select) */
  .ha-seg { display: inline-flex; border: 1px solid var(--red-ui-form-input-border-color, #ccc); border-radius: 5px; overflow: hidden; }
  .ha-seg .ha-seg-btn {
    font: inherit; font-size: 13px; padding: 5px 14px; cursor: pointer; border: 0;
    border-right: 1px solid var(--red-ui-form-input-border-color, #ccc);
    background: var(--red-ui-form-input-background, #fff);
    color: var(--red-ui-secondary-text-color, #888);
    display: inline-flex; align-items: center; gap: 6px;
  }
  .ha-seg .ha-seg-btn:last-child { border-right: 0; }
  .ha-seg .ha-seg-btn[aria-pressed="true"] {
    background: var(--red-ui-secondary-background-selected, rgba(120,120,120,0.12));
    color: var(--red-ui-primary-text-color, #333); font-weight: 600;
  }
  .ha-seg .ha-seg-check { width: 11px; text-align: center; }

  /* action cards */
  .ha-action-card { border: 1px solid var(--red-ui-form-input-border-color, #ccc); border-radius: 5px; margin-bottom: 8px; overflow: hidden; }
  .ha-action-head { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: var(--red-ui-tertiary-background, #f3f3f3); }
  .ha-action-num { min-width: 18px; height: 18px; border-radius: 3px; background: var(--red-ui-secondary-background, #fff); border: 1px solid var(--red-ui-secondary-border-color, #d5d5da); font-size: 11px; font-weight: 700; display: grid; place-items: center; flex: none; }
  .ha-action-preview { font-weight: 600; color: var(--red-ui-primary-text-color, #333); }
  .ha-action-body { padding: 9px; display: flex; flex-direction: column; gap: 8px; }
  .ha-tap { border-top: 1px dashed var(--red-ui-secondary-border-color, #e4e4e9); padding-top: 8px; }
  .ha-tap-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--red-ui-secondary-text-color, #888); margin-bottom: 5px; }
</style>
<script type="text/javascript">
  var haDefaults = {
```

Note: the `defaults:` object is being renamed to a named `var haDefaults` so smart-open can reuse it (Step 4). The next step wires it in.

- [ ] **Step 2: Wire `haDefaults` into `registerType` and confirm the defaults object is intact**

The current file has `RED.nodes.registerType('ha-ios-notification', { category: ..., defaults: { name: {...}, ... }, ... })`. After Step 1 the file begins `var haDefaults = {` where the defaults object literal used to open. Now:

1. Ensure `var haDefaults = { … all the existing default entries … };` closes with `};` (it currently reads the inner defaults object; keep every entry exactly as-is).
2. Immediately after it, add the `registerType` call that references it:

```js
  RED.nodes.registerType('ha-ios-notification', {
    category: 'home_assistant',
    color: '#C7E9C0',
    defaults: haDefaults,
```

3. Keep the rest of the `registerType` config (`inputs`, `outputs`, `icon`, `paletteLabel`, `label`, `oneditprepare`, `oneditsave`) unchanged for now.

Read the current file to place these precisely: the split point is the line `defaults: {` (becomes the end of `var haDefaults = {`) and the matching `},` that closed the defaults object (becomes `};` for `haDefaults`), with `RED.nodes.registerType('ha-ios-notification', { category:..., color:..., defaults: haDefaults,` inserted after.

- [ ] **Step 3: Add the `haCombo`, `toggle`, and smart-open helpers inside `oneditprepare`**

At the very top of the existing `oneditprepare: function () {` body (which currently starts `const node = this;`), keep `const node = this;` and add the helpers right after it:

```js
      const node = this;

      // ---- reusable type-to-search combo (free-type always allowed) ----
      function haCombo($input, sourceFn) {
        $input.autocomplete({
          minLength: 0,
          delay: 0,
          source: function (request, response) { response(sourceFn(request.term || '')); },
          select: function (event, ui) { $input.val(ui.item.value); $input.trigger('change'); return false; },
          focus: function () { return false; },
        });
        $input.on('focus', function () { $(this).autocomplete('search', ''); });
      }

      // ---- smart default-open ----
      var HA_SECTION_FIELDS = {
        map: ['firstLatitude','firstLongitude','secondLatitude','secondLongitude','showLineBetweenPoints','showCompass','showPointsOfInterest','showScale','showTraffic','showUserLocation'],
        media: ['imagePath','videoPath','audioPath','contentUrl','contentType','lazyLoading','hideThumbnail'],
        liveactivity: ['liveActivity','progress','progressMax','chronometer','when','whenRelative','notificationIcon','notificationIconColor','color','backgroundColor','textColor'],
      };
      function haFieldIsNonDefault(field) {
        var cur = node[field];
        if (field === 'staggerMs') { return !(cur === undefined || cur === '' || Number(cur) === 1000); }
        if (field === 'presentationOptions') { return Array.isArray(cur) && cur.length > 0; }
        if (Array.isArray(cur)) return cur.length > 0;
        var def = haDefaults[field] ? haDefaults[field].value : undefined;
        return (cur !== undefined && cur !== null && cur !== '' && cur !== def);
      }
      function haSectionHasContent(key) {
        if (key === 'actions') return Array.isArray(node.actions) && node.actions.length > 0;
        if (key === 'advanced') {
          var resolved = window.haIosSoundField.soundFieldValue(node.customSound, node.customSoundPreInstalled);
          if (resolved !== 'default') return true;
          return ['interruptionLevel','userInfo','isClearNotificationsOnAction','staggerMs','debugMode','badge','presentationOptions']
            .some(haFieldIsNonDefault);
        }
        return (HA_SECTION_FIELDS[key] || []).some(haFieldIsNonDefault);
      }
      function haApplySmartOpen() {
        $('#ha-sec-basics, #ha-sec-targets').addClass('ha-open');
        ['actions','map','media','advanced','liveactivity'].forEach(function (key) {
          if (haSectionHasContent(key)) $('#ha-sec-' + key).addClass('ha-open');
        });
      }
```

Then, at the **very end** of the `oneditprepare` body (after all existing loadX / editableList setup), add:

```js
      haApplySmartOpen();
```

And add the `toggle` function at the same scope as `haCombo` (a plain function used by section-head onclick):

```js
      function toggle(head) { $(head).parent().toggleClass('ha-open'); }
      window.__haToggle = toggle; // section headers call window.__haToggle(this)
```

(The template's `onclick` will call `window.__haToggle(this)` — see Step 4. Using a window-scoped reference avoids relying on `oneditprepare`-local scope from inline HTML handlers.)

- [ ] **Step 4: Wrap the seven `<h4>` groups into collapsible section shells in the `data-template-name` template**

For each section, replace its `<h4>Title</h4>` header with the section-open markup and close the section before the next `<h4>` (or at template end for the last). Keep all enclosed field markup **verbatim** — internals are reworked in later tasks. Read the current template to find the exact `<h4>` anchors and the field blocks between them.

Basics — replace `<h4>Basics</h4>` with:

```html
  <div class="ha-section" id="ha-sec-basics">
    <div class="ha-section-head" onclick="window.__haToggle(this)">
      <span class="ha-chev">&#9654;</span><span class="ha-s-title">Basics</span>
      <span class="ha-s-sub">title, message, tag</span>
    </div>
    <div class="ha-section-body">
```

…and insert `</div></div>` immediately before `<h4>Targets</h4>`.

Targets — replace `<h4>Targets</h4>` with:

```html
  <div class="ha-section" id="ha-sec-targets">
    <div class="ha-section-head" onclick="window.__haToggle(this)">
      <span class="ha-chev">&#9654;</span><span class="ha-s-title">Targets</span>
      <span class="ha-s-sub">where it goes</span>
    </div>
    <div class="ha-section-body">
```

…and insert `</div></div>` immediately before `<h4>Actions</h4>`.

Actions — replace `<h4>Actions</h4>` with:

```html
  <div class="ha-section" id="ha-sec-actions">
    <div class="ha-section-head" onclick="window.__haToggle(this)">
      <span class="ha-chev">&#9654;</span><span class="ha-s-title">Actions</span>
      <span class="ha-s-sub">buttons + tap-to-perform</span>
    </div>
    <div class="ha-section-body">
```

…and insert `</div></div>` immediately before `<h4>Map</h4>`.

Map — replace `<h4>Map</h4>` with:

```html
  <div class="ha-section" id="ha-sec-map">
    <div class="ha-section-head" onclick="window.__haToggle(this)">
      <span class="ha-chev">&#9654;</span><span class="ha-s-title">Map</span>
      <span class="ha-s-sub">location pins</span>
    </div>
    <div class="ha-section-body">
```

…and insert `</div></div>` immediately before `<h4>Media</h4>`.

Media — replace `<h4>Media</h4>` with:

```html
  <div class="ha-section" id="ha-sec-media">
    <div class="ha-section-head" onclick="window.__haToggle(this)">
      <span class="ha-chev">&#9654;</span><span class="ha-s-title">Media</span>
      <span class="ha-s-sub">image · video · audio</span>
    </div>
    <div class="ha-section-body">
```

…and insert `</div></div>` immediately before `<h4>Advanced</h4>`.

Advanced — replace `<h4>Advanced</h4>` with:

```html
  <div class="ha-section" id="ha-sec-advanced">
    <div class="ha-section-head" onclick="window.__haToggle(this)">
      <span class="ha-chev">&#9654;</span><span class="ha-s-title">Advanced</span>
      <span class="ha-s-sub">sound, delivery, badge</span>
    </div>
    <div class="ha-section-body">
```

…and insert `</div></div>` immediately before `<h4>Live Activity (iOS 17.2+, HA Core 2026.7+)</h4>`.

Live Activity — replace `<h4>Live Activity (iOS 17.2+, HA Core 2026.7+)</h4>` with:

```html
  <div class="ha-section" id="ha-sec-liveactivity">
    <div class="ha-section-head" onclick="window.__haToggle(this)">
      <span class="ha-chev">&#9654;</span><span class="ha-s-title">Live Activity</span>
      <span class="ha-s-sub">iOS 17.2+ · HA Core 2026.7+</span>
    </div>
    <div class="ha-section-body">
```

…and insert `</div></div>` at the very end of the template (immediately before the closing `</script>` of the `data-template-name` block).

The two top identity rows (Name, HA Server) stay above all sections, ungrouped.

- [ ] **Step 5: Structural sanity check**

```bash
node -e "
const fs=require('fs');const h=fs.readFileSync('ha-ios-notification.html','utf8');
const so=(h.match(/<script/g)||[]).length, sc=(h.match(/<\/script>/g)||[]).length;
if(so!==sc){console.error('script tag imbalance',so,sc);process.exit(1)}
for(const id of ['ha-sec-basics','ha-sec-targets','ha-sec-actions','ha-sec-map','ha-sec-media','ha-sec-advanced','ha-sec-liveactivity']){
  if(!h.includes('id=\"'+id+'\"')){console.error('missing section',id);process.exit(1)}
}
if(!h.includes('resources/node-red-contrib-ha-ios-notification/sound-field.js')){console.error('resource script not loaded');process.exit(1)}
if(h.includes('<h4>')){console.error('stray <h4> remains — a section was not wrapped');process.exit(1)}
console.log('structure OK: 7 sections, resource loaded, no stray <h4>, script tags balanced ('+so+')');
"
```
Expected: `structure OK: …`

- [ ] **Step 6: Regression — existing suite still green**

Run: `npm test`
Expected: 136 passing (unchanged; the `.html` is not covered by the suite, this confirms nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add ha-ios-notification.html
git commit -m "feat: collapsible bordered sections, smart-open, theme CSS, combo helper"
```

---

## Task 3: Basics + Targets internals (grid, placeholders, camera combo)

Rework the Basics and Targets section bodies onto the aligned `.ha-grid`, add placeholders, and upgrade the Camera Entity field from a native `<datalist>` to the `haCombo` widget. The device-picker (notify devices) rows already exist and work — leave that widget's logic intact; only its surrounding markup moves into the new layout.

**Files:**
- Modify: `ha-ios-notification.html`

**Interfaces:**
- Consumes: `haCombo` (Task 2), `/ha-ios-notification/camera-entities` endpoint (existing).
- Produces: no new interfaces.

- [ ] **Step 1: Replace the Basics section body's field markup**

Inside `#ha-sec-basics` → `.ha-section-body`, replace the six Basics `form-row` blocks (Title, Subtitle, Message, Group, Tag, Notification URL) with one aligned grid:

```html
      <div class="ha-grid">
        <label for="node-input-title">Title</label>
        <input type="text" id="node-input-title" placeholder="e.g. Front Door">
        <label for="node-input-subtitle">Subtitle</label>
        <input type="text" id="node-input-subtitle" placeholder="e.g. Ring camera">
        <label for="node-input-message">Message</label>
        <input type="text" id="node-input-message" placeholder="e.g. Someone is at the door">
        <label for="node-input-group">Group</label>
        <input type="text" id="node-input-group" placeholder="e.g. doorbell (stacks like notifications)">
        <label for="node-input-tag">Tag</label>
        <input type="text" id="node-input-tag" placeholder="auto-generated if left blank">
        <label for="node-input-notificationUrl">Notification URL</label>
        <input type="text" id="node-input-notificationUrl" placeholder="/lovelace/cameras or https://…">
      </div>
```

- [ ] **Step 2: Rework the Targets section body**

Inside `#ha-sec-targets` → `.ha-section-body`, keep the notify-devices block (the `<label>Notify Devices</label>`, its hint `<div>`, and `<ol id="node-input-services-container"></ol>`) unchanged. Replace ONLY the Camera Entity `form-row` (the `<input … list="node-input-cameraEntity-list">` + its `<datalist>`) with a `haCombo`-driven field in the grid:

```html
      <div class="ha-divider"></div>
      <div class="ha-grid">
        <label for="node-input-cameraEntity">Camera entity</label>
        <div class="ha-control ha-with-caret">
          <input type="text" id="node-input-cameraEntity" class="ha-mono" placeholder="camera.front_door">
          <span class="ha-caret">&#9660;</span>
        </div>
      </div>
```

- [ ] **Step 3: Wire the camera combo in `oneditprepare`**

Remove the old `loadCameraEntities` datalist code (the function that filled `#node-input-cameraEntity-list`) and its two wiring lines. Replace with a `haCombo` fed from a cached list:

```js
      var haCameraOptions = [];
      function haLoadCameras() {
        var serverId = $('#node-input-server').val();
        if (!serverId) return;
        $.getJSON('ha-ios-notification/camera-entities', { server: serverId }, function (r) {
          haCameraOptions = (r.entities || []).map(function (e) { return { label: e, value: e }; });
        });
      }
      haCombo($('#node-input-cameraEntity'), function (term) {
        var t = term.toLowerCase();
        return haCameraOptions.filter(function (o) { return o.value.toLowerCase().indexOf(t) !== -1; });
      });
      $('#node-input-server').on('change', haLoadCameras);
      setTimeout(haLoadCameras, 100);
```

- [ ] **Step 4: Structural sanity check**

```bash
node -e "
const fs=require('fs');const h=fs.readFileSync('ha-ios-notification.html','utf8');
const so=(h.match(/<script/g)||[]).length, sc=(h.match(/<\/script>/g)||[]).length;
if(so!==sc){console.error('script imbalance');process.exit(1)}
if(h.includes('node-input-cameraEntity-list')){console.error('old camera datalist not removed');process.exit(1)}
for(const id of ['node-input-title','node-input-message','node-input-tag','node-input-cameraEntity','node-input-services-container']){
  if(!h.includes('id=\"'+id+'\"')){console.error('missing field',id);process.exit(1)}
}
console.log('Basics+Targets OK');
"
```
Expected: `Basics+Targets OK`

- [ ] **Step 5: Regression**

Run: `npm test`
Expected: 136 passing.

- [ ] **Step 6: Commit**

```bash
git add ha-ios-notification.html
git commit -m "feat: Basics/Targets aligned grid, placeholders, camera combo"
```

---

## Task 4: Map + Media + Live Activity internals

Rework these three sections onto the aligned grid with paired sub-grids, add placeholders, group the display-flag checkboxes into a tidy grid, and turn Content Type into a `haCombo` combo.

**Files:**
- Modify: `ha-ios-notification.html`

**Interfaces:**
- Consumes: `haCombo` (Task 2).
- Produces: no new interfaces.

- [ ] **Step 1: Replace the Map section body**

Inside `#ha-sec-map` → `.ha-section-body`, replace all Map `form-row`s with:

```html
      <div class="ha-grid ha-align-start">
        <label>Pin 1</label>
        <div class="ha-pair">
          <div class="ha-sub"><small>Latitude</small><input type="text" id="node-input-firstLatitude" placeholder="40.0209"></div>
          <div class="ha-sub"><small>Longitude</small><input type="text" id="node-input-firstLongitude" placeholder="-75.1180"></div>
        </div>
        <label>Pin 2</label>
        <div class="ha-pair">
          <div class="ha-sub"><small>Latitude</small><input type="text" id="node-input-secondLatitude" placeholder="optional"></div>
          <div class="ha-sub"><small>Longitude</small><input type="text" id="node-input-secondLongitude" placeholder="optional"></div>
        </div>
      </div>
      <div class="ha-divider"></div>
      <div class="ha-checks">
        <label class="ha-check"><input type="checkbox" id="node-input-showLineBetweenPoints"> Line between points</label>
        <label class="ha-check"><input type="checkbox" id="node-input-showCompass"> Compass</label>
        <label class="ha-check"><input type="checkbox" id="node-input-showPointsOfInterest"> Points of interest</label>
        <label class="ha-check"><input type="checkbox" id="node-input-showScale"> Scale</label>
        <label class="ha-check"><input type="checkbox" id="node-input-showTraffic"> Traffic</label>
        <label class="ha-check"><input type="checkbox" id="node-input-showUserLocation"> User location</label>
      </div>
```

- [ ] **Step 2: Replace the Media section body**

Inside `#ha-sec-media` → `.ha-section-body`, replace all Media `form-row`s with:

```html
      <p class="ha-note">Attach a camera snapshot, image, video, or audio clip.</p>
      <div class="ha-grid ha-align-start">
        <label for="node-input-imagePath">Image</label>
        <input type="text" id="node-input-imagePath" class="ha-mono" placeholder="/local/front_door.jpg or camera.front_door">
        <label for="node-input-videoPath">Video</label>
        <input type="text" id="node-input-videoPath" class="ha-mono" placeholder="/local/clips/front_door.mp4">
        <label for="node-input-audioPath">Audio</label>
        <input type="text" id="node-input-audioPath" class="ha-mono" placeholder="/local/audio/chime.mp3">
        <label for="node-input-contentUrl">Content URL</label>
        <input type="text" id="node-input-contentUrl" class="ha-mono" placeholder="https://…  (overrides the paths above)">
        <label for="node-input-contentType">Content type</label>
        <div class="ha-control">
          <div class="ha-with-caret">
            <input type="text" id="node-input-contentType" placeholder="auto-detected — jpeg, png, gif, mp4, mpeg, avi, wav, aiff, mp3…">
            <span class="ha-caret">&#9660;</span>
          </div>
          <div class="ha-hint">Usually detected from the file — set only to override.</div>
        </div>
      </div>
      <div class="ha-divider"></div>
      <div class="ha-checks">
        <label class="ha-check"><input type="checkbox" id="node-input-lazyLoading"> Load media lazily</label>
        <label class="ha-check"><input type="checkbox" id="node-input-hideThumbnail"> Hide thumbnail</label>
      </div>
```

- [ ] **Step 3: Replace the Live Activity section body**

Inside `#ha-sec-liveactivity` → `.ha-section-body`, replace all Live Activity `form-row`s with:

```html
      <label class="ha-check" style="margin-bottom:9px"><input type="checkbox" id="node-input-liveActivity"> Send as a Live Activity (live_update)</label>
      <div class="ha-grid ha-align-start">
        <label>Progress</label>
        <div class="ha-pair">
          <div class="ha-sub"><small>Value</small><input type="number" id="node-input-progress" placeholder="40"></div>
          <div class="ha-sub"><small>Max</small><input type="number" id="node-input-progressMax" placeholder="100"></div>
        </div>
        <label>Timer</label>
        <div class="ha-pair" style="grid-template-columns:auto 1fr auto;align-items:center">
          <label class="ha-check"><input type="checkbox" id="node-input-chronometer"> Chronometer</label>
          <input type="number" id="node-input-when" placeholder="when (s)">
          <label class="ha-check"><input type="checkbox" id="node-input-whenRelative"> relative</label>
        </div>
        <label>Icon</label>
        <div class="ha-pair">
          <div class="ha-sub"><small>Name</small><input type="text" id="node-input-notificationIcon" placeholder="mdi:washing-machine"></div>
          <div class="ha-sub"><small>Color</small><input type="text" id="node-input-notificationIconColor" placeholder="#2196F3"></div>
        </div>
        <label>Colors</label>
        <div class="ha-triple">
          <div class="ha-sub"><small>Accent</small><input type="text" id="node-input-color" placeholder="#2196F3"></div>
          <div class="ha-sub"><small>Background</small><input type="text" id="node-input-backgroundColor" placeholder="#111"></div>
          <div class="ha-sub"><small>Text</small><input type="text" id="node-input-textColor" placeholder="#fff"></div>
        </div>
      </div>
```

- [ ] **Step 4: Wire the content-type combo in `oneditprepare`**

Add near the camera combo wiring:

```js
      var haContentTypes = ['jpeg','png','gif','mpeg','mp4','avi','aiff','wav','mp3','m4a']
        .map(function (t) { return { label: t, value: t }; });
      haCombo($('#node-input-contentType'), function (term) {
        var t = term.toLowerCase();
        return haContentTypes.filter(function (o) { return o.value.indexOf(t) !== -1; });
      });
```

- [ ] **Step 5: Structural sanity check**

```bash
node -e "
const fs=require('fs');const h=fs.readFileSync('ha-ios-notification.html','utf8');
const so=(h.match(/<script/g)||[]).length, sc=(h.match(/<\/script>/g)||[]).length;
if(so!==sc){console.error('script imbalance');process.exit(1)}
for(const id of ['node-input-firstLatitude','node-input-showTraffic','node-input-contentType','node-input-hideThumbnail','node-input-progress','node-input-textColor','node-input-liveActivity']){
  if(!h.includes('id=\"'+id+'\"')){console.error('missing field',id);process.exit(1)}
}
// paired fields no longer use inline percentage widths
if(/id=\"node-input-firstLatitude\"[^>]*width:45%/.test(h)){console.error('old inline width remains');process.exit(1)}
console.log('Map+Media+LiveActivity OK');
"
```
Expected: `Map+Media+LiveActivity OK`

- [ ] **Step 6: Regression**

Run: `npm test`
Expected: 136 passing.

- [ ] **Step 7: Commit**

```bash
git add ha-ios-notification.html
git commit -m "feat: Map/Media/Live Activity aligned grids, sub-labels, content-type combo"
```

---

## Task 5: Advanced internals — sound merge + segmented foreground

This is the only task that changes how a saved value is written (the sound merge). Rework the Advanced body: merge the sound `<select>` + custom-sound box into one `haCombo` field, replace the three foreground checkboxes with the multi-select segmented control, and align the remaining fields.

**Files:**
- Modify: `ha-ios-notification.html`

**Interfaces:**
- Consumes: `haCombo` (Task 2), `window.haIosSoundField.soundFieldValue` (Task 1).
- Produces: no new interfaces.

- [ ] **Step 1: Replace the Advanced section body markup**

Inside `#ha-sec-advanced` → `.ha-section-body`, replace everything (the `customSoundPreInstalled` `<select>` with its 127 options, the `customSound` box, interruption select, the userInfo/clear/stagger/debug/badge rows, and the `.presopt` foreground checkboxes). Keep the full 127-option `<select>` markup but move it into a hidden `<datalist id="ha-sound-options">` used only as the combo's suggestion source — reproduce every existing `<option>` as a `<datalist>` option (same values). Replace with:

```html
      <!-- hidden suggestion source for the sound combo: the verified bundled catalog -->
      <datalist id="ha-sound-options">
        <option value="default"></option>
        <option value="none"></option>
        <!-- KEEP: reproduce every existing bundled-sound <option value="…"> from the old
             #node-input-customSoundPreInstalled <select> here, one per line, values verbatim -->
      </datalist>

      <div class="ha-grid ha-align-start">
        <label for="ha-sound-input">Sound</label>
        <div class="ha-control">
          <div class="ha-with-caret">
            <input type="text" id="ha-sound-input" placeholder="Default — type to search, or enter a filename">
            <span class="ha-caret">&#9660;</span>
          </div>
          <div class="ha-hint">Search the bundled sounds, or type any uploaded <code>.wav</code>. <code>none</code> = silent.</div>
        </div>

        <label for="node-input-interruptionLevel">Interruption</label>
        <select id="node-input-interruptionLevel">
          <option value="passive">Passive (iOS 15+)</option>
          <option value="active">Active (default)</option>
          <option value="time-sensitive">Time Sensitive (iOS 15+)</option>
          <option value="critical">Critical</option>
        </select>

        <label for="node-input-staggerMs">Stagger</label>
        <div class="ha-pair" style="grid-template-columns:110px 1fr;align-items:center">
          <input type="number" id="node-input-staggerMs" min="0" step="100">
          <span class="ha-hint" style="margin:0">ms between devices · 0 disables</span>
        </div>

        <label for="node-input-badge">Badge count</label>
        <div class="ha-pair" style="grid-template-columns:110px 1fr;align-items:center">
          <input type="number" id="node-input-badge" min="0" step="1" placeholder="—">
          <span class="ha-hint" style="margin:0">0 clears the badge</span>
        </div>
      </div>

      <div class="ha-divider"></div>

      <label style="display:block;margin-bottom:6px">Foreground presentation</label>
      <div class="ha-seg" id="ha-foreground" role="group" aria-label="Foreground presentation">
        <button type="button" class="ha-seg-btn" data-value="alert" aria-pressed="false" onclick="window.__haSegToggle(this)"><span class="ha-seg-check"></span>Alert</button>
        <button type="button" class="ha-seg-btn" data-value="badge" aria-pressed="false" onclick="window.__haSegToggle(this)"><span class="ha-seg-check"></span>Badge</button>
        <button type="button" class="ha-seg-btn" data-value="sound" aria-pressed="false" onclick="window.__haSegToggle(this)"><span class="ha-seg-check"></span>Sound</button>
      </div>
      <div class="ha-hint">How the notification shows while the app is already open. Tap each to toggle independently.</div>

      <div class="ha-divider"></div>

      <div class="ha-checks">
        <label class="ha-check"><input type="checkbox" id="node-input-userInfo"> Populate user info</label>
        <label class="ha-check"><input type="checkbox" id="node-input-isClearNotificationsOnAction"> Clear on other devices when actioned</label>
        <label class="ha-check"><input type="checkbox" id="node-input-debugMode"> Debug mode</label>
      </div>
```

Note: the `#node-input-customSoundPreInstalled` and `#node-input-customSound` inputs are removed from the template; their config keys are still written by `oneditsave` (Step 3). The 127 `<option>` values must be copied verbatim from the old `<select>` into `#ha-sound-options`.

- [ ] **Step 2: Wire the sound combo and segmented control in `oneditprepare`**

Remove any old sound-related editor code. Add:

```js
      // Sound: single field resolved from the two legacy keys on load.
      $('#ha-sound-input').val(window.haIosSoundField.soundFieldValue(node.customSound, node.customSoundPreInstalled));
      var haSoundOptions = $('#ha-sound-options option').map(function () {
        return { label: this.value, value: this.value };
      }).get();
      haCombo($('#ha-sound-input'), function (term) {
        var t = term.toLowerCase();
        return haSoundOptions.filter(function (o) { return o.value.toLowerCase().indexOf(t) !== -1; });
      });

      // Foreground segmented control: pre-press from saved presentationOptions.
      (node.presentationOptions || []).forEach(function (v) {
        $('#ha-foreground .ha-seg-btn[data-value="' + v + '"]').attr('aria-pressed', 'true').find('.ha-seg-check').html('&#10003;');
      });
      window.__haSegToggle = function (btn) {
        var $b = $(btn);
        var on = $b.attr('aria-pressed') === 'true';
        $b.attr('aria-pressed', on ? 'false' : 'true');
        $b.find('.ha-seg-check').html(on ? '' : '&#10003;');
      };
```

- [ ] **Step 3: Update `oneditsave` for the sound merge and fixed-order foreground**

In `oneditsave`, replace the current `this.presentationOptions = $('.presopt:checked')…` line, and add the sound write. The sound resolution:

```js
      // Sound: single field → customSound; reset the legacy dropdown key.
      this.customSound = ($('#ha-sound-input').val() || '').trim();
      this.customSoundPreInstalled = 'default';

      // Foreground: emit in fixed order so re-saves don't churn the flow file.
      this.presentationOptions = ['alert', 'badge', 'sound'].filter(function (v) {
        return $('#ha-foreground .ha-seg-btn[data-value="' + v + '"]').attr('aria-pressed') === 'true';
      });
```

- [ ] **Step 4: Structural sanity check**

```bash
node -e "
const fs=require('fs');const h=fs.readFileSync('ha-ios-notification.html','utf8');
const so=(h.match(/<script/g)||[]).length, sc=(h.match(/<\/script>/g)||[]).length;
if(so!==sc){console.error('script imbalance');process.exit(1)}
if(h.includes('node-input-customSoundPreInstalled')){console.error('old sound <select> not removed');process.exit(1)}
if(h.includes('class=\"presopt')||h.includes(\"class='presopt\")){console.error('old .presopt checkboxes remain');process.exit(1)}
for(const s of ['ha-sound-input','ha-foreground','ha-sound-options','node-input-badge','node-input-staggerMs']){
  if(!h.includes(s)){console.error('missing',s);process.exit(1)}
}
if(!/customSound\s*=\s*\(\\\$\('#ha-sound-input'\)/.test(h) && !h.includes(\"this.customSound = ($('#ha-sound-input')\")){console.error('sound save not wired');process.exit(1)}
if(!h.includes(\"['alert', 'badge', 'sound'].filter\")){console.error('fixed-order presentationOptions save not wired');process.exit(1)}
console.log('Advanced OK');
"
```
Expected: `Advanced OK`

- [ ] **Step 5: Verify the bundled sound catalog moved intact**

The `#ha-sound-options` datalist must contain the same sound values the old `<select>` had. Confirm the count matches the verified catalog (127 sounds + `default` + `none` = 129 option values):

```bash
node -e "
const fs=require('fs');const h=fs.readFileSync('ha-ios-notification.html','utf8');
const m=h.match(/<datalist id=\"ha-sound-options\">([\s\S]*?)<\/datalist>/);
if(!m){console.error('datalist not found');process.exit(1)}
const n=(m[1].match(/<option /g)||[]).length;
if(n!==129){console.error('expected 129 sound options, found',n);process.exit(1)}
console.log('sound catalog intact: 129 options');
"
```
Expected: `sound catalog intact: 129 options`

- [ ] **Step 6: Regression**

Run: `npm test`
Expected: 136 passing.

- [ ] **Step 7: Commit**

```bash
git add ha-ios-notification.html
git commit -m "feat: merge sound field into one combo; segmented multi-select foreground"
```

---

## Task 6: Actions internals — action cards + tap-to-perform domain-filtered combos

Rework the Actions `editableList` per-row renderer into a bordered card, upgrade the tap-to-perform Service and Target-entity fields from native `<datalist>` to `haCombo` (entity suggestions filtered to the selected service's domain), and preserve every action save invariant.

**Files:**
- Modify: `ha-ios-notification.html`

**Interfaces:**
- Consumes: `haCombo` (Task 2), `/ha-ios-notification/callable-services` and `/ha-ios-notification/entities?prefix=` endpoints (existing).
- Produces: no new interfaces.

- [ ] **Step 1: Replace the actions `editableList` `addItem` renderer**

In `oneditprepare`, replace the current `$('#node-input-actions-container').editableList({ addItem: … })` `addItem` body with the card renderer. Keep `sortable: true, removable: true` and the `(node.actions || []).forEach(...)` population call. The Service and Target-entity inputs carry classes `action-targetService` / `action-targetEntityId` (unchanged from today) so `oneditsave` still reads them; the title input carries `action-title`, etc.

```js
        addItem: function (container, index, data) {
          container.css({ overflow: 'visible', padding: 0, border: 'none', background: 'none' });
          var card = $('<div class="ha-action-card">').appendTo(container);

          var head = $('<div class="ha-action-head">').appendTo(card);
          $('<span class="ha-action-num">').text(index + 1).appendTo(head);
          var preview = $('<span class="ha-action-preview">').text(data.title || 'Untitled').appendTo(head);

          var body = $('<div class="ha-action-body">').appendTo(card);

          var r1 = $('<div class="ha-pair" style="grid-template-columns:2fr 1fr">').appendTo(body);
          var titleInput = $('<input type="text" placeholder="Title">').val(data.title || '').appendTo(
            $('<div class="ha-sub"><small>Title</small></div>').appendTo(r1)).addClass('action-title');
          titleInput.on('input', function () { preview.text($(this).val() || 'Untitled'); });
          $('<input type="text" placeholder="1">').val(data.id || '').appendTo(
            $('<div class="ha-sub"><small>ID · optional</small></div>').appendTo(r1)).addClass('action-id');

          var r2 = $('<div class="ha-pair" style="grid-template-columns:1fr 1.6fr">').appendTo(body);
          var modeWrap = $('<div class="ha-sub"><small>Activation</small></div>').appendTo(r2);
          var modeSelect = $('<select class="action-activationMode">').appendTo(modeWrap);
          ['foreground', 'background'].forEach(function (m) { modeSelect.append('<option value="' + m + '">' + m + '</option>'); });
          modeSelect.val(data.activationMode || 'foreground');
          $('<input type="text" class="ha-mono" placeholder="/lovelace/security">').val(data.uri || '').appendTo(
            $('<div class="ha-sub"><small>URI · optional</small></div>').appendTo(r2)).addClass('action-uri');

          var r3 = $('<div class="ha-checks" style="grid-template-columns:1fr 1fr">').appendTo(body);
          var destr = $('<label class="ha-check"><input type="checkbox" class="action-destructive"> Destructive</label>').appendTo(r3);
          if (data.destructive) destr.find('input').prop('checked', true);
          var auth = $('<label class="ha-check"><input type="checkbox" class="action-authenticationRequired"> Requires auth</label>').appendTo(r3);
          if (data.authenticationRequired) auth.find('input').prop('checked', true);

          var tap = $('<div class="ha-tap">').appendTo(body);
          $('<div class="ha-tap-label">Tap-to-perform · optional</div>').appendTo(tap);
          var tapPair = $('<div class="ha-pair">').appendTo(tap);
          var svcWrap = $('<div class="ha-sub"><small>Service</small></div>').appendTo(tapPair);
          var svcInput = $('<input type="text" class="ha-mono action-targetService" placeholder="e.g. lock.unlock">').val(data.targetService || '').appendTo(
            $('<div class="ha-with-caret">').appendTo(svcWrap));
          $('<span class="ha-caret">&#9660;</span>').appendTo(svcInput.parent());
          var entWrap = $('<div class="ha-sub"><small>Target entity</small></div>').appendTo(tapPair);
          var entInput = $('<input type="text" class="ha-mono action-targetEntityId" placeholder="type to search">').val(data.targetEntityId || '').appendTo(
            $('<div class="ha-with-caret">').appendTo(entWrap));
          $('<span class="ha-caret">&#9660;</span>').appendTo(entInput.parent());

          // service combo (shared source), entity combo (domain-filtered, per row)
          haCombo(svcInput, function (term) {
            var t = term.toLowerCase();
            return haServiceOptions.filter(function (o) { return o.value.toLowerCase().indexOf(t) !== -1; });
          });
          haEntityCombo(entInput, svcInput);
        },
```

- [ ] **Step 2: Add the service source + domain-filtered entity combo helpers in `oneditprepare`**

Replace the old `loadServiceAndEntityLists` datalist code (which filled `#ha-ios-services` / `#ha-ios-entities`) with:

```js
      var haServiceOptions = [];
      function haLoadServices() {
        var serverId = $('#node-input-server').val();
        if (!serverId) return;
        $.getJSON('ha-ios-notification/callable-services', { server: serverId }, function (r) {
          haServiceOptions = (r.services || []).map(function (s) { return { label: s, value: s }; });
        });
      }
      $('#node-input-server').on('change', haLoadServices);
      setTimeout(haLoadServices, 100);

      // entity picker filtered to the row's service domain; cached per domain.
      var haEntityCacheByDomain = {};
      function haEntityCombo($entInput, $svcInput) {
        haCombo($entInput, function (term) {
          var svc = ($svcInput.val() || '');
          var dot = svc.indexOf('.');
          var domain = dot > 0 ? svc.slice(0, dot) : '';
          var key = domain || '*';
          var cached = haEntityCacheByDomain[key];
          if (!cached) {
            var serverId = $('#node-input-server').val();
            if (serverId) {
              haEntityCacheByDomain[key] = []; // mark in-flight to avoid duplicate fetches
              $.getJSON('ha-ios-notification/entities', domain ? { server: serverId, prefix: domain + '.' } : { server: serverId }, function (r) {
                haEntityCacheByDomain[key] = (r.entities || []).map(function (e) { return { label: e, value: e }; });
                $entInput.autocomplete('search', $entInput.val() || '');
              });
            }
            return [];
          }
          var t = term.toLowerCase();
          return cached.filter(function (o) { return o.value.toLowerCase().indexOf(t) !== -1; });
        });
        // invalidate this row's entity suggestions when its service domain changes
        $svcInput.on('change', function () { $entInput.autocomplete('search', $entInput.val() || ''); });
      }
```

Remove the two shared `<datalist id="ha-ios-services">` / `<datalist id="ha-ios-entities">` elements from the template (they're replaced by `haCombo` sources).

- [ ] **Step 3: Confirm `oneditsave`'s action collector is unchanged and preserves invariants**

Do **not** rewrite `oneditsave`'s action loop — it already reads `.action-title`, `.action-id`, `.action-activationMode`, `.action-uri`, `.action-destructive`, `.action-authenticationRequired`, `.action-targetService`, `.action-targetEntityId`, drops empty-title rows, emits optional keys only when non-empty, and sets `this.outputs = actions.length`. Verify these class names match the renderer above (they do). No change needed to this block.

- [ ] **Step 4: Structural sanity check**

```bash
node -e "
const fs=require('fs');const h=fs.readFileSync('ha-ios-notification.html','utf8');
const so=(h.match(/<script/g)||[]).length, sc=(h.match(/<\/script>/g)||[]).length;
if(so!==sc){console.error('script imbalance');process.exit(1)}
if(h.includes('id=\"ha-ios-services\"')||h.includes('id=\"ha-ios-entities\"')){console.error('old shared datalists not removed');process.exit(1)}
for(const c of ['ha-action-card','action-title','action-targetService','action-targetEntityId','haEntityCombo']){
  if(!h.includes(c)){console.error('missing',c);process.exit(1)}
}
if(!h.includes('this.outputs = actions.length')){console.error('outputs invariant lost');process.exit(1)}
console.log('Actions OK');
"
```
Expected: `Actions OK`

- [ ] **Step 5: Regression**

Run: `npm test`
Expected: 136 passing.

- [ ] **Step 6: Commit**

```bash
git add ha-ios-notification.html
git commit -m "feat: action cards with domain-filtered tap-to-perform combos"
```

---

## Task 7: Full verification, lint, packaging, and manual editor checklist

Verification-only task. Confirm the whole suite and lint are green, the package still ships correctly (now including `resources/`), the HTML is well-formed, and produce the manual editor-verification checklist (to be run in a live Node-RED editor at deploy time — editor UI is not machine-testable).

**Files:**
- No source changes (may add a doc note).

- [ ] **Step 1: Full suite + lint**

Run: `npm test`
Expected: 136 passing (129 original + 7 sound-field).

Run: `npm run lint`
Expected: clean (no errors). The `.html` is not linted by `eslint . --ext .js`; `resources/sound-field.js` is. If ESLint flags the `resources/` browser file (it uses a browser global pattern), scope it: confirm it passes as a `script`-sourcetype file, or add `/* eslint-env browser */` at its top — it must stay lint-clean without disabling real rules.

- [ ] **Step 2: Packaging check**

Run: `npm pack --dry-run 2>&1 | grep -E "resources/sound-field.js|ha-ios-notification.html"`
Expected: both listed (the resource ships, the editor ships).

- [ ] **Step 3: HTML well-formedness**

```bash
node -e "
const fs=require('fs');const h=fs.readFileSync('ha-ios-notification.html','utf8');
const so=(h.match(/<script/g)||[]).length, sc=(h.match(/<\/script>/g)||[]).length;
if(so!==sc){console.error('script imbalance',so,sc);process.exit(1)}
const secOpen=(h.match(/class=\"ha-section\"/g)||[]).length;
if(secOpen!==7){console.error('expected 7 sections, found',secOpen);process.exit(1)}
if(h.includes('<h4>')){console.error('stray <h4>');process.exit(1)}
console.log('HTML OK: 7 sections, script tags balanced');
"
```
Expected: `HTML OK: …`

- [ ] **Step 4: Write the manual editor-verification checklist**

Append this checklist to the design spec (`docs/superpowers/specs/2026-07-17-config-panel-redesign-design.md`) under a new `## Manual verification (run at deploy)` heading, so it travels with the design and is run when the node is deployed into Node-RED:

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-17-config-panel-redesign-design.md
git commit -m "docs: add manual editor-verification checklist for the config redesign"
```

---

## Self-Review

**1. Spec coverage** (each spec section → task):
- Collapsible sections + smart-open (mechanical predicate, field→section map, named exceptions) → Task 2.
- Alignment (grid + paired sub-labels) → Tasks 3, 4, 5 (per section).
- Placeholders → Tasks 3, 4, 5.
- Unified pickers governing rule; combos for devices (done), sound (Task 5), camera (Task 3), tap-to-perform service/entity (Task 6), content type (Task 4); plain selects unchanged → covered; `haCombo` helper (Task 2).
- Tap-to-perform domain filtering + fetch/cache strategy → Task 6.
- Foreground segmented multi-select + explicit per-segment check + fixed emit order → Task 5.
- Action cards + save invariants + reorder=renumber (output number shown) → Task 6.
- Sound merge load/save + `soundFieldValue` single-source (resources/) + test → Tasks 1, 5.
- `package.json` `files` += `resources/` → Task 1.
- Backward compat (flow-diff churn expectation, load-display asymmetry) → manual checklist (Task 7) + save logic (Task 5).
- Node-RED theme variables (no hardcoded colors) → Task 2 CSS (Global Constraint).
- Testing approach (one pure function tested; rest = review + structural + manual) → Tasks 1, 7.

**2. Placeholder scan:** No "TBD"/"TODO". The one instruction that isn't literal code — "reproduce every existing bundled-sound `<option>` into `#ha-sound-options`" in Task 5 Step 1 — is a deliberate copy-the-verified-catalog directive with a structural count check (Step 5 asserts exactly 129 options) guarding it; the values live in the current file and must not be retyped by hand.

**3. Type consistency:** `haCombo($input, sourceFn)` with `sourceFn(term) → [{label, value}]` is defined in Task 2 and consumed identically in Tasks 3/4/5/6. `window.haIosSoundField.soundFieldValue(customSound, customSoundPreInstalled)` matches the Task 1 export and its uses in Task 2 (smart-open) and Task 5 (load). `haDefaults` defined in Task 2 Step 1–2 and read by smart-open in Task 2 Step 3. Action field class names (`action-title`, `action-id`, `action-activationMode`, `action-uri`, `action-destructive`, `action-authenticationRequired`, `action-targetService`, `action-targetEntityId`) in Task 6's renderer match the unchanged `oneditsave` collector. Section ids (`ha-sec-<key>`) consistent between Task 2's shells, smart-open, and Task 7's checks.
