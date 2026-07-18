# Config-Panel Completion & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the remaining config-UI gaps on the `ha-ios-notification` node — text-input actions, `categoryName`, action `icon`, action `targetData` (drill-down JSON) — and fix the reviewed layout bugs, plus a Live Activity "Beta" badge.

**Architecture:** Almost entirely `ha-ios-notification.html` (config-panel CSS + `oneditprepare`/`oneditsave`). The only runtime change is one line in `lib/build-payload.js` to emit `data.push.category`. Action props (`icon`, `behavior`, `textInputButtonTitle`, `textInputPlaceholder`, `targetData`) already flow through `lib/action-list.js` — the work is exposing them in the editor.

**Tech Stack:** Node-RED node HTML/jQuery editor, Mocha + `should` unit tests, `RED.editor.editJSON` for the JSON drill-down.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-18-textinput-category-ui-design.md`.
- **Branch:** work on `feature/textinput-category-ui` (already checked out; spec committed there). No worktree — already an isolated feature branch.
- **File anchors** (current line numbers, `ha-ios-notification.html`): `haDefaults` @91; action `addItem` builder @~345-393; `oneditsave` action read @~435-452; Basics section @478-494 (Group @491, Tag @493); Live Activity section head @781-787; caret CSS @57; `.ha-check`/`.ha-checks` CSS @48-50; services `editableList` populate @282. Verify by context before editing (line numbers may drift as edits land).
- **Payload return shape:** `payloads[i].payload.data.data.push.category` (double `data` is intentional — outer is the notify-service payload, inner is HA `data`).
- **Action props already passed through** by `lib/action-list.js` (`IOS_ACTION_PROPS` = icon/behavior/textInputButtonTitle/textInputPlaceholder/…; `TAP_TARGET_PROPS` = targetService/targetEntityId/targetData). No changes there.
- **Tests:** `npm test` (Mocha). Unit-test the logic that CAN be tested (payload emission, action passthrough). The config panel has **no DOM harness** — UI is verified manually via `docs/TESTING.md` read-back-the-JSON checklist.
- **Do not** open/modify `flows_cred.json` or any Node-RED runtime file during dev.
- **Rollout is a separate final task** — editing source does nothing to the running Node-RED until rebuild → reinstall → `docker restart node-red` (Task 6).
- Commit after each task.

---

### Task 1: `categoryName` — payload emission + Basics field (TDD)

**Files:**
- Modify: `lib/build-payload.js`
- Modify: `ha-ios-notification.html` (haDefaults + Basics input)
- Test: `test/unit/build-payload.spec.js`

- [ ] **Step 1: Write failing tests** (append to `build-payload.spec.js`):
```js
describe('build-payload: category', () => {
  it('emits data.push.category when categoryName is set', () => {
    const { payloads } = buildNotificationPayloads(baseConfig({ categoryName: 'parking' }), {});
    payloads[0].payload.data.data.push.category.should.equal('parking');
  });
  it('omits category when categoryName is empty', () => {
    const { payloads } = buildNotificationPayloads(baseConfig({ categoryName: '' }), {});
    payloads[0].payload.data.data.push.should.not.have.property('category');
  });
  it('lets a notificationBase override win', () => {
    const { payloads } = buildNotificationPayloads(
      baseConfig({ categoryName: 'a' }),
      { notificationBase: { categoryName: 'b' } }
    );
    payloads[0].payload.data.data.push.category.should.equal('b');
  });
});
```

- [ ] **Step 2: Run → fail.** `cd <repo> && npm test` → the three new tests fail (no `category` emitted).

- [ ] **Step 3: Implement.** In `lib/build-payload.js`, inside the `services.map` callback (near the other `pickNullish` lines ~53), add:
```js
    const category = pickNullish(nb.categoryName, ovNb.categoryName, config.categoryName);
```
Then in the `data.push` object literal (alongside `sound` / `interruption-level` / `badge`), add:
```js
        ...(category ? { category } : {}),
```

- [ ] **Step 4: Run → pass.** `npm test` → all green.

- [ ] **Step 5: Add the config field.** In `ha-ios-notification.html`:
  - `haDefaults` (@91): add `categoryName: { value: '' },`.
  - Basics section (after the Tag row @493-494):
```html
        <label for="node-input-categoryName">Category</label>
        <input type="text" id="node-input-categoryName" placeholder="optional · iOS category name">
```

- [ ] **Step 6: Commit.**
```bash
git add lib/build-payload.js ha-ios-notification.html test/unit/build-payload.spec.js
git commit -m "feat: categoryName config field -> data.push.category"
```

---

### Task 2: Action card — `icon` + text-input fields (UI + passthrough tests)

**Files:**
- Modify: `ha-ios-notification.html` (action `addItem` builder + `oneditsave` read)
- Test: `test/unit/action-list.spec.js`

- [ ] **Step 1: Write failing passthrough tests** (append to `action-list.spec.js`, inside `describe('normalizeActions')`):
```js
it('passes through icon and text-input props', () => {
  const [a] = normalizeActions([{
    title: 'Reply', icon: 'sfsymbols:car',
    behavior: 'textInput', textInputButtonTitle: 'Send', textInputPlaceholder: 'Type…',
  }]);
  a.icon.should.equal('sfsymbols:car');
  a.behavior.should.equal('textInput');
  a.textInputButtonTitle.should.equal('Send');
  a.textInputPlaceholder.should.equal('Type…');
});
```
*(This guards the props the UI writes; `normalizeActions` already keeps `ALL_ACTION_PROPS`, so it should pass immediately — run it to confirm the contract before wiring the UI.)*

- [ ] **Step 2: Run → confirm the contract.** `npm test` → the new test passes (props already flow through). If it fails, fix `action-list.js` first.

- [ ] **Step 3: Add UI controls** in the action `addItem` builder (@~345-393). After the URI row, add an **Icon** input:
```js
          $('<input type="text" class="ha-mono action-icon" placeholder="sfsymbols:car">')
            .val(data.icon || '').appendTo(
              $('<div class="ha-sub"><small>Icon · optional</small></div>').appendTo(r2));
```
After the `r3` checkbox row, add the **Text-input** checkbox + revealed fields:
```js
          var tiWrap = $('<div class="ha-textinput">').appendTo(body);
          var tiChk = $('<label class="ha-check"><input type="checkbox" class="action-textInput"> Text input</label>').appendTo(tiWrap);
          var tiFields = $('<div class="ha-pair ha-ti-fields" style="margin-top:6px">').appendTo(tiWrap);
          $('<input type="text" class="action-tiButton" placeholder="Send">').val(data.textInputButtonTitle || '').appendTo(
            $('<div class="ha-sub"><small>Button title</small></div>').appendTo(tiFields));
          $('<input type="text" class="action-tiPlaceholder" placeholder="Type a reply…">').val(data.textInputPlaceholder || '').appendTo(
            $('<div class="ha-sub"><small>Placeholder</small></div>').appendTo(tiFields));
          var tiOn = data.behavior === 'textInput';
          tiChk.find('input').prop('checked', tiOn);
          tiFields.toggle(tiOn);
          tiChk.find('input').on('change', function () { tiFields.toggle($(this).prop('checked')); });
```

- [ ] **Step 4: Read them on save** in `oneditsave` action read (@~435-452), before `actions.push(action)`:
```js
        const icon = $(this).find('.action-icon').val();
        if (icon) action.icon = icon;
        if ($(this).find('.action-textInput').prop('checked')) {
          action.behavior = 'textInput';
          const tb = $(this).find('.action-tiButton').val();
          const tp = $(this).find('.action-tiPlaceholder').val();
          if (tb) action.textInputButtonTitle = tb;
          if (tp) action.textInputPlaceholder = tp;
        }
```

- [ ] **Step 5: Run → pass.** `npm test` green.

- [ ] **Step 6: Manual verify** (record in `docs/TESTING.md`): add an action, set Icon, tick Text input, set button/placeholder, Deploy, read the node JSON → `icon` + `behavior:"textInput"` + the two fields present; untick → those props absent.

- [ ] **Step 7: Commit.**
```bash
git add ha-ios-notification.html test/unit/action-list.spec.js docs/TESTING.md
git commit -m "feat: action icon + text-input fields in the action editor"
```

---

### Task 3: Action card — `targetData` drill-down JSON editor

**Files:**
- Modify: `ha-ios-notification.html` (action `addItem` + `oneditsave` read)
- Test: `test/unit/action-list.spec.js`

- [ ] **Step 1: Write failing passthrough test** (append to `action-list.spec.js`):
```js
it('passes through targetData for tap-to-perform', () => {
  const [a] = normalizeActions([{ title: 'Unlock', targetService: 'lock.unlock', targetData: { code: '1234' } }]);
  a.targetData.should.eql({ code: '1234' });
});
```

- [ ] **Step 2: Run → confirm contract.** `npm test` (passes if `targetData` is in `ALL_ACTION_PROPS`; fix `action-list.js` if not).

- [ ] **Step 3: Add the drill-down control** in the action `addItem` tap-to-perform block (`.ha-tap`, after the targetEntity field):
```js
          var tdRow = $('<div class="ha-sub" style="margin-top:6px"><small>Service data (JSON) · optional</small></div>').appendTo(tap);
          var tdState = { value: (data.targetData !== undefined ? data.targetData : '') };
          var tdBtn = $('<button type="button" class="red-ui-button ha-td-btn" style="width:100%;text-align:left;"></button>').appendTo(tdRow);
          function tdLabel() {
            var has = tdState.value && (typeof tdState.value !== 'object' || Object.keys(tdState.value).length);
            tdBtn.text(has ? '{…} data set — click to edit' : 'empty — click to add JSON');
            tdBtn.toggleClass('ha-td-set', !!has);
          }
          tdLabel();
          tdBtn.on('click', function () {
            RED.editor.editJSON({
              value: typeof tdState.value === 'string' ? tdState.value : JSON.stringify(tdState.value || {}, null, 4),
              complete: function (v) {
                try { tdState.value = v ? JSON.parse(v) : ''; } catch (e) { tdState.value = v; }
                tdLabel();
              },
            });
          });
          $(this).data('tdState', tdState); // retrievable on save
```
Add a small CSS rule near the action-card styles: `.ha-td-btn.ha-td-set { font-weight:600; }`.

- [ ] **Step 4: Read on save** (in the `oneditsave` action `.each`, using the row's stored state):
```js
        const tdState = $(this).data('tdState');
        if (tdState && tdState.value && !(typeof tdState.value === 'object' && Object.keys(tdState.value).length === 0)) {
          action.targetData = tdState.value;
        }
```
*(Note: `$(this)` in the save `.each` is the list item element — store/retrieve `tdState` on the same element used in `addItem`; if the closure element differs, attach `tdState` to a `data-*` on the card root and read it here.)*

- [ ] **Step 5: Run → pass.** `npm test` green.

- [ ] **Step 6: Manual verify** (`docs/TESTING.md`): add an action, click Service-data → editor opens → enter `{"code":"1234"}` → Done → button shows "data set" → Deploy → node JSON has `action.targetData`; clear it → indicator returns to "empty" and prop absent.

- [ ] **Step 7: Commit.**
```bash
git add ha-ios-notification.html test/unit/action-list.spec.js docs/TESTING.md
git commit -m "feat: action targetData drill-down JSON editor with set/empty indicator"
```

---

### Task 4: Config-panel layout fixes (CSS + JS)

**Files:** Modify `ha-ios-notification.html`.

- [ ] **Step 1: Targets always show ≥1 row.** After the services populate loop (@282):
```js
      if (!(node.services || []).length) $targetsList.editableList('addItem', { deviceName: '' });
```

- [ ] **Step 2: "Actionable Buttons" label full-width.** Change its markup (@528) to:
```html
    <label style="display:block;width:auto;margin-bottom:6px;">Actionable Buttons</label>
```

- [ ] **Step 3: Checkbox alignment.** In CSS, change `.ha-checks` (@48) to a wrapping flex row and un-cap the check labels:
```css
  .ha-checks { display: flex; flex-wrap: wrap; gap: 6px 18px; }
  .ha-check { display: flex; align-items: center; gap: 7px; margin: 0; width: auto; font-weight: normal; }
```

- [ ] **Step 4: Caret — close gap + make clickable.** In CSS (@55-57):
```css
  .ha-with-caret { position: relative; }
  .ha-with-caret input { padding-right: 22px; width: 100%; box-sizing: border-box; }
  .ha-caret { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 9px; cursor: pointer; color: var(--red-ui-secondary-text-color, #888); }
```
Then, in the action `addItem` where the two carets are created (@382, @386), wire a click that opens the combo:
```js
          svcInput.parent().find('.ha-caret').on('click', function () { svcInput.focus(); svcInput.autocomplete('search', ''); });
          entInput.parent().find('.ha-caret').on('click', function () { entInput.focus(); entInput.autocomplete('search', ''); });
```
For the static main-form carets (camera @517, service, entity — search `class="ha-caret"`), add in `oneditprepare` after those inputs init:
```js
      $('.ha-with-caret').each(function () {
        var $inp = $(this).find('input'); var $c = $(this).find('.ha-caret');
        $c.on('click', function () { $inp.focus(); if ($inp.autocomplete) $inp.autocomplete('search', ''); });
      });
```

- [ ] **Step 5: Manual verify** (`docs/TESTING.md`): open a fresh node → one empty target row present; "Actionable Buttons" on one line; add an action → Destructive & Requires-auth side-by-side, no wrap; caret flush to input and clicking it opens the dropdown.

- [ ] **Step 6: Commit.**
```bash
git add ha-ios-notification.html docs/TESTING.md
git commit -m "fix: config-panel layout — default target row, label wrap, checkbox align, clickable caret"
```

---

### Task 5: Live Activity "Beta" badge

**Files:** Modify `ha-ios-notification.html`.

- [ ] **Step 1: Add the pill CSS** (near the section-header styles):
```css
  .ha-beta { display:inline-block; margin-left:6px; padding:1px 6px; border-radius:8px; font-size:10px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; background: var(--red-ui-secondary-background-selected, rgba(120,120,120,.15)); color: var(--red-ui-primary-text-color,#666); }
```

- [ ] **Step 2: Badge + note** in the Live Activity section head (@783) and body (@787). Header:
```html
      <span class="ha-chev">&#9654;</span><span class="ha-s-title">Live Activity</span><span class="ha-beta">Beta</span>
      <span class="ha-s-sub">TestFlight app required</span>
```
Add a note just inside the section body, above the liveActivity checkbox:
```html
      <p class="ha-note">⚠️ Live Activities require the <strong>TestFlight</strong> build of the HA iOS Companion App.</p>
```

- [ ] **Step 3: Manual verify:** the Live Activity header shows the "Beta" pill + "TestFlight app required" sub; the note renders above the toggle.

- [ ] **Step 4: Commit.**
```bash
git add ha-ios-notification.html
git commit -m "feat: mark Live Activity section Beta (TestFlight app required)"
```

---

### Task 6: Version bump, CHANGELOG, rollout to Node-RED

**Files:** Modify `package.json`, `CHANGELOG.md`. Then rebuild → reinstall → restart.

- [ ] **Step 1:** Bump `package.json` `version` to `0.2.0`.
- [ ] **Step 2:** Add a CHANGELOG entry under the unreleased section listing: categoryName, action icon, text-input action fields, targetData drill-down, layout fixes, Live Activity Beta note.
- [ ] **Step 3: Full test + lint.** `npm test && npm run lint` → green.
- [ ] **Step 4: Commit.**
```bash
git add package.json CHANGELOG.md && git commit -m "chore: v0.2.0 — config-panel completion & polish"
```
- [ ] **Step 5: Rollout to Node-RED** (this is the step that makes it live — editing source alone does nothing):
```bash
cd /home/steve/Documents/GitHub/actionable-notifications-subflow-for-ios
npm pack   # -> node-red-contrib-ha-ios-notification-0.2.0.tgz
NRUSER=/home/steve/Documents/docker/hosted-external/node-red/volumes/user
cp node-red-contrib-ha-ios-notification-0.2.0.tgz "$NRUSER/"
( cd "$NRUSER" && npm install ./node-red-contrib-ha-ios-notification-0.2.0.tgz )
docker restart node-red
sleep 8 && docker logs --tail 40 node-red 2>&1 | grep -iE 'error|started flows|version'
```
- [ ] **Step 6: Verify in editor.** Open the node in Node-RED → run the manual `docs/TESTING.md` checklist items for all new fields + fixes. **Gate:** confirm before considering the feature done.

---

## Self-Review notes

- **Spec coverage:** categoryName (T1), action icon + text-input (T2), targetData drill-down (T3), layout fixes — default target row / label wrap / checkbox align / caret gap+click (T4), Live Activity Beta (T5), version/CHANGELOG/rollout (T6). All covered.
- **Test reality:** only the payload/passthrough logic is unit-tested (T1–T3); UI is manual-verified via `docs/TESTING.md` — consistent with the existing config panel (no DOM harness). Called out, not a gap.
- **Type/contract consistency:** `categoryName` config key ↔ `data.push.category`; action props (`icon`, `behavior`, `textInputButtonTitle`, `textInputPlaceholder`, `targetData`) match `IOS_ACTION_PROPS`/`TAP_TARGET_PROPS` exactly; test-assertion path `payload.data.data.push.category` matches the builder's return shape.
- **Rollout caveat repeated** (T6 Step 5) so the "edited source but NR didn't change" trap can't recur.
