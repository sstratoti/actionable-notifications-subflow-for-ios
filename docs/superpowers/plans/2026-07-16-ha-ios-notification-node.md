# HA iOS Notification Native Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **PLAN REVISION 2 (2026-07-16):** This plan was revised after a full HA Companion App
> notification-docs review and a design/logic review (see spec Revision 2). Changes to
> the original 28 tasks are marked **[REV2]** inline in the affected tasks; brand-new
> work is in Tasks 29–34 and the decimal-inserted tasks (8.5, 15.5). Read the whole task
> you are on — REV2 notes replace, not merely append to, the surrounding steps they touch.

**Goal:** Convert the `iOS Actionable Notification v2` Node-RED subflow into a publishable native node package, `node-red-contrib-ha-ios-notification`, with HA entity/service pickers, dynamic actionable-button outputs, per-instance state, modern + legacy action-event support, badge / presentation-options / Live Activities coverage, tap-to-perform action targets, a Mocha + node-red-node-test-helper test suite, docs, and a publish-ready package.

**Architecture:** A single self-contained Node-RED node (one input handling send, manual-clear, and clear-badge; dynamic outputs for received actions) built from small pure `lib/` modules (payload building, live-activity payload building, clear-payload building, action-list normalization, tag sanitization, message-store) wired together by the node runtime file. HA connectivity goes through `node-red-contrib-home-assistant-websocket`'s internal `getHomeAssistant()`/`HomeAssistant` client (verified against the installed v0.80.3 source — see Task 11), not a standalone HA client.

**Tech Stack:** Node.js (CommonJS), Mocha + should, node-red-node-test-helper, proxyquire, ESLint, GitHub Actions.

## Global Constraints

- Package name: `node-red-contrib-ha-ios-notification`. Node type (palette name): `ha-ios-notification`, label "HA iOS Notification".
- Depends on `node-red-contrib-home-assistant-websocket` as a `peerDependency` (range `>=0.70.0`, matching the installed `0.80.3` and the API surface verified in Task 11) — never bundled as a regular `dependency`.
- `msg.notificationOverride` 3-tier precedence (`serviceOverride` > global `override` > node config default) is preserved exactly, per the design spec's override-compatibility section. Tag never accepts a service-level override (matches v2). **[REV2]** Precedence uses **nullish** semantics (`??`) for every field except the sound chain (which uses `||`, matching v2) — an explicit empty-string override IS honored and must NOT fall through to a lower tier. See Task 5.
- **[REV2]** An action override supplies the WHOLE action object for its id — full replace, not field-merge (matches v2). See Tasks 3 and 6.
- All dedup/tracking state lives in `node.context()`, keyed by this node instance only — never `flow.*` or `global.*`. **[REV2]** Two node instances in one flow must never collide — verified by a required test in Task 33.
- **[REV2]** iOS-only for v1, but the action listener subscribes to BOTH `mobile_app_notification_action` (current) and `ios.notification_action_fired` (legacy/deprecated), normalizing the action-id field (`action` vs `actionName`) to an internal `actionId`. See Tasks 11 and 15.
- Node engines: `"node": ">=18"`.
- Test runner: Mocha + should for unit tests; `node-red-node-test-helper` + `proxyquire` for integration tests. No live HA connection in any test. **[REV2]** Integration tests await the input handler via its `done` callback / a returned promise — no `setTimeout`-race assertions, no millisecond-precision timing assertions. See Task 34.
- Repo: `sstratoti/actionable-notifications-subflow-for-ios`, restructured in place. Local clone: `/home/steve/Documents/GitHub/actionable-notifications-subflow-for-ios`. All commands below assume this as the working directory unless stated otherwise.
- Design spec of record: `docs/superpowers/specs/2026-07-16-native-node-design.md` (already committed, includes Revision 2).

---

## Task 1: Repo restructuring and package scaffolding

**Files:**
- Create: `package.json`, `.eslintrc.json`, `.mocharc.json`, `.gitignore`
- Move: `actionable-notifications-subflow-for-ios.json` → `legacy-subflow/actionable-notifications-subflow-for-ios.json`
- Create: `lib/`, `test/unit/`, `test/integration/helpers/`, `examples/` (empty dirs, populated in later tasks)

**Interfaces:**
- Produces: `package.json` `node-red.nodes` entry `ha-ios-notification` → `ha-ios-notification.js` (file created in Task 12), consumed by every later task's manual verification steps.

- [ ] **Step 1: Move the legacy subflow export into `legacy-subflow/`**

```bash
mkdir -p legacy-subflow
git mv actionable-notifications-subflow-for-ios.json legacy-subflow/actionable-notifications-subflow-for-ios.json
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "node-red-contrib-ha-ios-notification",
  "version": "0.1.0",
  "description": "Native Node-RED node for sending actionable iOS notifications via the Home Assistant Companion App, with HA entity pickers.",
  "keywords": [
    "node-red",
    "home-assistant",
    "ios",
    "notification",
    "actionable-notification"
  ],
  "license": "MIT",
  "homepage": "https://github.com/sstratoti/actionable-notifications-subflow-for-ios",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/sstratoti/actionable-notifications-subflow-for-ios.git"
  },
  "bugs": {
    "url": "https://github.com/sstratoti/actionable-notifications-subflow-for-ios/issues"
  },
  "engines": {
    "node": ">=18"
  },
  "node-red": {
    "nodes": {
      "ha-ios-notification": "ha-ios-notification.js"
    }
  },
  "peerDependencies": {
    "node-red-contrib-home-assistant-websocket": ">=0.70.0"
  },
  "devDependencies": {
    "eslint": "^8.57.0",
    "mocha": "^10.4.0",
    "node-red": "^3.1.0",
    "node-red-node-test-helper": "^0.3.4",
    "node-red-contrib-home-assistant-websocket": "^0.80.3",
    "proxyquire": "^2.1.3",
    "should": "^13.2.3"
  },
  "scripts": {
    "test": "mocha test/unit/**/*.spec.js test/integration/**/*.spec.js --timeout 5000",
    "test:unit": "mocha test/unit/**/*.spec.js",
    "test:integration": "mocha test/integration/**/*.spec.js --timeout 5000",
    "lint": "eslint . --ext .js"
  }
}
```

- [ ] **Step 3: Create `.eslintrc.json`**

```json
{
  "root": true,
  "env": {
    "node": true,
    "es2021": true,
    "mocha": true
  },
  "parserOptions": {
    "ecmaVersion": 2021,
    "sourceType": "script"
  },
  "extends": "eslint:recommended",
  "rules": {
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

- [ ] **Step 4: Create `.mocharc.json`**

```json
{
  "reporter": "spec",
  "recursive": true
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
*.log
.nyc_output/
coverage/
```

- [ ] **Step 6: Create empty directories with `.gitkeep` so git tracks them before later tasks populate them**

```bash
mkdir -p lib test/unit test/integration/helpers examples
touch lib/.gitkeep test/unit/.gitkeep test/integration/helpers/.gitkeep examples/.gitkeep
```

- [ ] **Step 7: Install dependencies and verify**

```bash
npm install
```

Expected: installs without error; `node_modules/node-red-contrib-home-assistant-websocket` present at `0.80.x`.

- [ ] **Step 8: Commit**

```bash
git add package.json .eslintrc.json .mocharc.json .gitignore legacy-subflow lib test examples
git commit -m "chore: scaffold node-red-contrib-ha-ios-notification package"
```

---

## Task 2: `lib/sanitize-tag.js` — tag sanitization

**Files:**
- Create: `lib/sanitize-tag.js`
- Test: `test/unit/sanitize-tag.spec.js`

**Interfaces:**
- Produces: `safeString(value): string`, `randomSuffix(length = 6): string`, `sanitizeTag(rawTag, fallbackTitle): string` — consumed by Task 5 (`lib/build-payload.js`) and Task 9/10 (`lib/build-clear-payload.js`).

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/sanitize-tag.spec.js
'use strict';

require('should');
const { safeString, randomSuffix, sanitizeTag } = require('../../lib/sanitize-tag');

describe('sanitize-tag', () => {
  describe('safeString', () => {
    it('strips punctuation and collapses whitespace to underscores, uppercased', () => {
      safeString('front door: opened!').should.equal('FRONT_DOOR_OPENED');
    });

    it('returns empty string for undefined', () => {
      safeString(undefined).should.equal('');
    });

    it('returns empty string for null', () => {
      safeString(null).should.equal('');
    });

    it('coerces numbers to strings', () => {
      safeString(42).should.equal('42');
    });
  });

  describe('randomSuffix', () => {
    it('defaults to 6 uppercase alphanumeric characters', () => {
      randomSuffix().should.match(/^[A-Z0-9]{6}$/);
    });

    it('respects a custom length', () => {
      randomSuffix(10).should.match(/^[A-Z0-9]{10}$/);
    });
  });

  describe('sanitizeTag', () => {
    it('returns the sanitized raw tag when provided', () => {
      sanitizeTag('front door', 'Some Title').should.equal('FRONT_DOOR');
    });

    it('falls back to TITLE_<random> when rawTag is empty', () => {
      sanitizeTag('', 'Garage Alert').should.match(/^GARAGE_ALERT_[A-Z0-9]{6}$/);
    });

    it('falls back to NOTIFY_<random> when both rawTag and title are empty', () => {
      sanitizeTag('', '').should.match(/^NOTIFY_[A-Z0-9]{6}$/);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/sanitize-tag.spec.js`
Expected: FAIL — `Cannot find module '../../lib/sanitize-tag'`

- [ ] **Step 3: Write the implementation**

```js
// lib/sanitize-tag.js
'use strict';

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function safeString(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, '_')
    .toUpperCase();
}

function randomSuffix(length = 6) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHANUMERIC[Math.floor(Math.random() * ALPHANUMERIC.length)];
  }
  return out;
}

function sanitizeTag(rawTag, fallbackTitle) {
  const cleaned = safeString(rawTag);
  if (cleaned) return cleaned;
  const titlePart = safeString(fallbackTitle) || 'NOTIFY';
  return `${titlePart}_${randomSuffix()}`;
}

module.exports = { safeString, randomSuffix, sanitizeTag };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/sanitize-tag.spec.js`
Expected: PASS — 7 passing

- [ ] **Step 5: Commit**

```bash
git add lib/sanitize-tag.js test/unit/sanitize-tag.spec.js
git commit -m "feat: add tag sanitization module"
```

---

## Task 3: `lib/action-list.js` — action normalization and override (full-replace)

**[REV2] Two changes from the original task:** (1) `applyActionOverrides` does a
**full replace** of the action's props from the override (not a shallow field-merge) —
matching v2, so a config-only prop like `destructive: true` disappears when an
override for that id omits it. (2) Actions carry **tap-to-perform target props**
(`targetService`, `targetEntityId`, `targetData`) alongside the iOS payload props;
these are node-side only and must NEVER be emitted into the iOS action payload (Task 6
emits only `IOS_ACTION_PROPS`).

**Files:**
- Create: `lib/action-list.js`
- Test: `test/unit/action-list.spec.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `normalizeActions(rawActions): Array<{id, title, outputIndex, ...props}>`, `applyActionOverrides(normalizedActions, overridesById): Array<...>`, `IOS_ACTION_PROPS: string[]` (the 8 props emitted to iOS), `TAP_TARGET_PROPS: string[]` (node-side tap-to-perform props) — consumed by Task 6 (`lib/build-payload.js`, emits `IOS_ACTION_PROPS` only) and Tasks 12/15/15.5 (node runtime — output count, and tap-to-perform via `TAP_TARGET_PROPS`).

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/action-list.spec.js
'use strict';

require('should');
const { normalizeActions, applyActionOverrides } = require('../../lib/action-list');

describe('action-list', () => {
  describe('normalizeActions', () => {
    it('returns an empty array for non-array input', () => {
      normalizeActions(undefined).should.eql([]);
      normalizeActions(null).should.eql([]);
      normalizeActions('nope').should.eql([]);
    });

    it('drops entries without a title', () => {
      normalizeActions([{ uri: '/x' }, { title: 'Open' }]).should.have.length(1);
    });

    it('defaults id to the 1-based index when not provided', () => {
      const result = normalizeActions([{ title: 'A' }, { title: 'B' }]);
      result[0].id.should.equal('1');
      result[1].id.should.equal('2');
    });

    it('keeps a custom id when provided', () => {
      const result = normalizeActions([{ title: 'A', id: 'open-door' }]);
      result[0].id.should.equal('open-door');
    });

    it('assigns outputIndex matching array position', () => {
      const result = normalizeActions([{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
      result.map((a) => a.outputIndex).should.eql([0, 1, 2]);
    });

    it('only includes optional properties that were actually set', () => {
      const result = normalizeActions([{ title: 'A', destructive: true }]);
      result[0].should.have.property('destructive', true);
      result[0].should.not.have.property('uri');
    });

    it('carries through all known optional properties when set', () => {
      const raw = {
        title: 'A',
        activationMode: 'background',
        uri: '/open',
        textInputButtonTitle: 'Send',
        textInputPlaceholder: 'Reply...',
        authenticationRequired: true,
        destructive: false,
        behavior: 'textInput',
        icon: 'sfsymbols:lock.open',
      };
      const result = normalizeActions([raw]);
      result[0].should.match(raw);
    });

    it('carries through tap-to-perform target props', () => {
      const raw = {
        title: 'Unlock',
        targetService: 'lock.unlock',
        targetEntityId: 'lock.front_door',
        targetData: { code: '1234' },
      };
      const result = normalizeActions([raw]);
      result[0].targetService.should.equal('lock.unlock');
      result[0].targetEntityId.should.equal('lock.front_door');
      result[0].targetData.should.eql({ code: '1234' });
    });
  });

  describe('applyActionOverrides', () => {
    it('returns actions unchanged when no override matches', () => {
      const actions = normalizeActions([{ title: 'A' }]);
      applyActionOverrides(actions, { nope: { title: 'X' } }).should.eql(actions);
    });

    it('replaces matching fields but keeps id and outputIndex stable', () => {
      const actions = normalizeActions([{ title: 'A', uri: '/old' }]);
      const result = applyActionOverrides(actions, { 1: { title: 'A overridden', uri: '/new' } });
      result[0].id.should.equal('1');
      result[0].outputIndex.should.equal(0);
      result[0].title.should.equal('A overridden');
      result[0].uri.should.equal('/new');
    });

    it('FULLY replaces the action: a config prop absent from the override is dropped', () => {
      const actions = normalizeActions([{ title: 'A', destructive: true, uri: '/old' }]);
      const result = applyActionOverrides(actions, { 1: { title: 'A', uri: '/new' } });
      result[0].should.not.have.property('destructive'); // full replace, not merge
      result[0].uri.should.equal('/new');
    });

    it('retains the original title when the override omits one (avoids dropping the slot)', () => {
      const actions = normalizeActions([{ title: 'Original', destructive: true }]);
      const result = applyActionOverrides(actions, { 1: { uri: '/new' } });
      result[0].title.should.equal('Original');
      result[0].should.not.have.property('destructive');
      result[0].uri.should.equal('/new');
    });

    it('handles a missing or non-object overridesById gracefully', () => {
      const actions = normalizeActions([{ title: 'A' }]);
      applyActionOverrides(actions, undefined).should.eql(actions);
      applyActionOverrides(actions, null).should.eql(actions);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/action-list.spec.js`
Expected: FAIL — `Cannot find module '../../lib/action-list'`

- [ ] **Step 3: Write the implementation**

```js
// lib/action-list.js
'use strict';

// Props emitted into the iOS notification action payload (data.data.actions[]).
const IOS_ACTION_PROPS = [
  'activationMode',
  'uri',
  'textInputButtonTitle',
  'textInputPlaceholder',
  'authenticationRequired',
  'destructive',
  'behavior',
  'icon',
];

// Node-side-only props for the tap-to-perform feature — NEVER emitted to iOS.
const TAP_TARGET_PROPS = ['targetService', 'targetEntityId', 'targetData'];

const ALL_ACTION_PROPS = [...IOS_ACTION_PROPS, ...TAP_TARGET_PROPS];

function normalizeActions(rawActions) {
  if (!Array.isArray(rawActions)) return [];

  return rawActions
    .map((action, index) => {
      if (!action || typeof action !== 'object' || !action.title) return null;

      const id =
        action.id !== undefined && action.id !== null && action.id !== ''
          ? String(action.id)
          : String(index + 1);

      const normalized = { id, title: action.title, outputIndex: index };

      ALL_ACTION_PROPS.forEach((prop) => {
        if (action[prop] !== undefined) {
          normalized[prop] = action[prop];
        }
      });

      return normalized;
    })
    .filter(Boolean);
}

// Full-replace semantics (matches v2): the override supplies the WHOLE action content
// for its id. Props absent from the override are dropped, not merged from the base.
// id and outputIndex stay stable; title falls back to the base only if the override
// omits it, so a slot is never dropped mid-list (which would shift dynamic outputs).
function applyActionOverrides(normalizedActions, overridesById) {
  if (!overridesById || typeof overridesById !== 'object') return normalizedActions;

  return normalizedActions.map((action) => {
    const override = overridesById[action.id];
    if (!override || typeof override !== 'object') return action;

    const replaced = {
      id: action.id,
      outputIndex: action.outputIndex,
      title: override.title !== undefined && override.title !== null && override.title !== ''
        ? override.title
        : action.title,
    };
    ALL_ACTION_PROPS.forEach((prop) => {
      if (override[prop] !== undefined) replaced[prop] = override[prop];
    });
    return replaced;
  });
}

module.exports = { normalizeActions, applyActionOverrides, IOS_ACTION_PROPS, TAP_TARGET_PROPS };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/action-list.spec.js`
Expected: PASS — 13 passing

- [ ] **Step 5: Commit**

```bash
git add lib/action-list.js test/unit/action-list.spec.js
git commit -m "feat: add action-list normalization module"
```

---

## Task 4: `lib/message-store.js` — per-instance dedup/tracking store

**Files:**
- Create: `lib/message-store.js`
- Test: `test/unit/message-store.spec.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TTL_MS: number`, `pruneStale(entries, now): Array`, `recordSent(entries, entry): Array`, `findMatch(entries, tag, deviceName): object|null`, `removeMatch(entries, tag, deviceName): Array` — consumed by Task 13 (send path), Task 15 (action-ownership matching), Task 17 (auto-clear).

Operates on plain arrays only (no Node-RED context access) so the node runtime wraps it: `node.context().get('sentMessages') || []` in, `node.context().set('sentMessages', result)` out.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/message-store.spec.js
'use strict';

require('should');
const { TTL_MS, pruneStale, recordSent, findMatch, removeMatch } = require('../../lib/message-store');

describe('message-store', () => {
  describe('pruneStale', () => {
    it('keeps entries younger than TTL_MS and drops older ones', () => {
      const now = 1_000_000_000_000;
      const entries = [
        { tag: 'A', deviceName: 'phone', dateCreated: now - TTL_MS + 1000 },
        { tag: 'B', deviceName: 'phone', dateCreated: now - TTL_MS - 1000 },
      ];
      const result = pruneStale(entries, now);
      result.should.have.length(1);
      result[0].tag.should.equal('A');
    });

    it('handles an empty/undefined list', () => {
      pruneStale(undefined, Date.now()).should.eql([]);
    });
  });

  describe('recordSent', () => {
    it('adds a new entry', () => {
      const result = recordSent([], { tag: 'A', deviceName: 'phone', dateCreated: 1000, message: {} });
      result.should.have.length(1);
    });

    it('replaces an existing entry with the same tag+deviceName', () => {
      const existing = [{ tag: 'A', deviceName: 'phone', dateCreated: 1000, message: { v: 1 } }];
      const result = recordSent(existing, { tag: 'A', deviceName: 'phone', dateCreated: 2000, message: { v: 2 } });
      result.should.have.length(1);
      result[0].message.v.should.equal(2);
    });

    it('prunes stale entries while recording a new one', () => {
      const now = 1_000_000_000_000;
      const existing = [{ tag: 'OLD', deviceName: 'phone', dateCreated: now - TTL_MS - 1 }];
      const result = recordSent(existing, { tag: 'NEW', deviceName: 'phone', dateCreated: now });
      result.should.have.length(1);
      result[0].tag.should.equal('NEW');
    });
  });

  describe('findMatch', () => {
    it('finds an entry matching tag and deviceName', () => {
      const entries = [{ tag: 'A', deviceName: 'phone', dateCreated: 1 }];
      findMatch(entries, 'A', 'phone').should.equal(entries[0]);
    });

    it('returns null when nothing matches', () => {
      should(findMatch([], 'A', 'phone')).be.null();
    });
  });

  describe('removeMatch', () => {
    it('removes only the matching entry', () => {
      const entries = [
        { tag: 'A', deviceName: 'phone', dateCreated: 1 },
        { tag: 'A', deviceName: 'tablet', dateCreated: 1 },
      ];
      const result = removeMatch(entries, 'A', 'phone');
      result.should.have.length(1);
      result[0].deviceName.should.equal('tablet');
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/message-store.spec.js`
Expected: FAIL — `Cannot find module '../../lib/message-store'`

- [ ] **Step 3: Write the implementation**

```js
// lib/message-store.js
'use strict';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours, matches v2

function pruneStale(entries, now) {
  return (entries || []).filter((e) => now - e.dateCreated < TTL_MS);
}

function recordSent(entries, entry) {
  const pruned = pruneStale(entries, entry.dateCreated);
  const filtered = pruned.filter((e) => !(e.tag === entry.tag && e.deviceName === entry.deviceName));
  filtered.push(entry);
  return filtered;
}

function findMatch(entries, tag, deviceName) {
  return (entries || []).find((e) => e.tag === tag && e.deviceName === deviceName) || null;
}

function removeMatch(entries, tag, deviceName) {
  return (entries || []).filter((e) => !(e.tag === tag && e.deviceName === deviceName));
}

module.exports = { TTL_MS, pruneStale, recordSent, findMatch, removeMatch };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/message-store.spec.js`
Expected: PASS — 8 passing

- [ ] **Step 5: Commit**

```bash
git add lib/message-store.js test/unit/message-store.spec.js
git commit -m "feat: add per-instance message tracking store"
```

---

## Task 5: `lib/build-payload.js` — base notification fields and multi-device fan-out

**Files:**
- Create: `lib/build-payload.js`
- Test: `test/unit/build-payload.spec.js`

**Interfaces:**
- Consumes: `sanitizeTag` from `lib/sanitize-tag.js` (Task 2).
- Produces: `buildNotificationPayloads(config, override): {error: string|null, payloads: Array<{service, tag, action, payload}>}` — consumed by Task 6 (extends this file with actions), Task 7 (map fields), Task 8 (media fields), and Task 13 (node runtime send path).

This task implements the base-fields + fan-out + tag-precedence slice only. Tasks 6–8 extend the same file and test file with actions/map/media.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/build-payload.spec.js
'use strict';

require('should');
const { buildNotificationPayloads } = require('../../lib/build-payload');

function baseConfig(overrides = {}) {
  return {
    tag: '',
    services: [{ deviceName: 'my_iphone' }],
    group: '',
    title: 'Default Title',
    subtitle: '',
    message: 'Default Message',
    notificationUrl: '',
    cameraEntity: '',
    customSoundPreInstalled: 'default',
    customSound: '',
    interruptionLevel: 'active',
    userInfo: false,
    isClearNotificationsOnAction: false,
    actions: [],
    firstLatitude: '', firstLongitude: '', secondLatitude: '', secondLongitude: '',
    showLineBetweenPoints: false, showCompass: false, showPointsOfInterest: false,
    showScale: false, showTraffic: false, showUserLocation: false,
    contentUrl: '', imagePath: '', videoPath: '', audioPath: '',
    lazyLoading: false, hideThumbnail: false,
    ...overrides,
  };
}

describe('build-payload: base fields and fan-out', () => {
  it('errors when there are no target services', () => {
    const result = buildNotificationPayloads(baseConfig({ services: [] }), {});
    result.error.should.equal('no services defined');
    result.payloads.should.eql([]);
  });

  it('builds one payload per configured service', () => {
    const config = baseConfig({ services: [{ deviceName: 'my_iphone' }, { deviceName: 'my_ipad' }] });
    const result = buildNotificationPayloads(config, {});
    result.error.should.be.null();
    result.payloads.should.have.length(2);
    result.payloads[0].action.should.equal('notify.my_iphone');
    result.payloads[1].action.should.equal('notify.my_ipad');
  });

  it('uses config title/message/subtitle/url/group when no overrides are given', () => {
    const config = baseConfig({ subtitle: 'Sub', notificationUrl: '/lovelace', group: 'alerts' });
    const { payloads } = buildNotificationPayloads(config, {});
    const p = payloads[0].payload;
    p.data.title.should.equal('Default Title');
    p.data.message.should.equal('Default Message');
    p.data.data.subtitle.should.equal('Sub');
    p.data.data.url.should.equal('/lovelace');
    p.data.data.group.should.equal('alerts');
  });

  it('omits subtitle/url/group keys entirely when empty', () => {
    const { payloads } = buildNotificationPayloads(baseConfig(), {});
    payloads[0].payload.data.data.should.not.have.property('subtitle');
    payloads[0].payload.data.data.should.not.have.property('url');
    payloads[0].payload.data.data.should.not.have.property('group');
  });

  it('applies a global override title over the config default', () => {
    const config = baseConfig();
    const override = { notificationBase: { title: 'Override Title' } };
    const { payloads } = buildNotificationPayloads(config, override);
    payloads[0].payload.data.title.should.equal('Override Title');
  });

  it('applies a per-service override over both the global override and config default', () => {
    const config = baseConfig({ services: [{ deviceName: 'my_iphone', serviceOverride: { notificationBase: { title: 'Service Title' } } }] });
    const override = { notificationBase: { title: 'Override Title' } };
    const { payloads } = buildNotificationPayloads(config, override);
    payloads[0].payload.data.title.should.equal('Service Title');
  });

  it('[REV2] honors an explicit empty-string override, suppressing the configured default (nullish precedence, not ||)', () => {
    // config has a subtitle; a global override explicitly clears it with ''.
    const config = baseConfig({ subtitle: 'Configured Subtitle' });
    const override = { notificationBase: { subtitle: '' } };
    const { payloads } = buildNotificationPayloads(config, override);
    // '' is an explicit clear -> the subtitle key is omitted, NOT fallen-through to config.
    payloads[0].payload.data.data.should.not.have.property('subtitle');
  });

  it('[REV2] falls through to the config default only when the override is undefined (not empty)', () => {
    const config = baseConfig({ subtitle: 'Configured Subtitle' });
    const { payloads } = buildNotificationPayloads(config, { notificationBase: {} });
    payloads[0].payload.data.data.subtitle.should.equal('Configured Subtitle');
  });

  it('a msg-level services override fully replaces the configured target list', () => {
    const config = baseConfig({ services: [{ deviceName: 'my_iphone' }] });
    const override = { services: [{ deviceName: 'everyone' }] };
    const { payloads } = buildNotificationPayloads(config, override);
    payloads.should.have.length(1);
    payloads[0].action.should.equal('notify.everyone');
  });

  it('sanitizes and reuses the same tag across all fanned-out services', () => {
    const config = baseConfig({ services: [{ deviceName: 'a' }, { deviceName: 'b' }], tag: 'front door' });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].tag.should.equal('FRONT_DOOR');
    payloads[1].tag.should.equal('FRONT_DOOR');
  });

  it('does not allow a service-level tag override (tag has no per-service override, matching v2)', () => {
    const config = baseConfig({
      tag: 'shared-tag',
      services: [{ deviceName: 'a', serviceOverride: { notificationBase: { tag: 'ignored' } } }],
    });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].tag.should.equal('SHARED_TAG');
  });

  it('sets push.sound.name from customSound, falling back to customSoundPreInstalled', () => {
    const config = baseConfig({ customSoundPreInstalled: 'chime.wav', customSound: '' });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.push.sound.name.should.equal('chime.wav');
  });

  it('a non-empty customSound overrides customSoundPreInstalled', () => {
    const config = baseConfig({ customSoundPreInstalled: 'chime.wav', customSound: 'my_upload.wav' });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.push.sound.name.should.equal('my_upload.wav');
  });

  it('sets critical sound flags when interruptionLevel is critical', () => {
    const config = baseConfig({ interruptionLevel: 'critical' });
    const { payloads } = buildNotificationPayloads(config, {});
    const push = payloads[0].payload.data.data.push;
    push.sound.critical.should.equal(1);
    push.sound.volume.should.equal(1.0);
    push['interruption-level'].should.equal('critical');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: FAIL — `Cannot find module '../../lib/build-payload'`

- [ ] **Step 3: Write the implementation (base-fields slice; actions/map/media added in Tasks 6–8)**

```js
// lib/build-payload.js
'use strict';

const { sanitizeTag } = require('./sanitize-tag');

// [REV2] || semantics — treats '' as absent. Used ONLY for the sound chain (matches v2).
function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// [REV2] Nullish (??) semantics — honors an explicit '' (only undefined/null are "absent").
// Used for every other override chain, so an explicit empty-string override suppresses a
// configured default rather than falling through to it (matches v2's `??` chains).
function pickNullish(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function firstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function buildNotificationPayloads(config, override) {
  const safeOverride = override || {};
  const services =
    safeOverride.services && safeOverride.services.length > 0
      ? safeOverride.services
      : config.services || [];

  if (!services || services.length === 0) {
    return { error: 'no services defined', payloads: [] };
  }

  const tag = sanitizeTag(pickNullish(safeOverride.tag, config.tag), config.title);

  const payloads = services.map((service) => {
    const serviceOverride = service.serviceOverride || {};
    const nb = serviceOverride.notificationBase || {};
    const ovNb = safeOverride.notificationBase || {};

    const title = pickNullish(nb.title, ovNb.title, config.title) || '';
    const subtitle = pickNullish(nb.subtitle, ovNb.subtitle, config.subtitle) || '';
    const message = pickNullish(nb.message, ovNb.message, config.message) || '';
    const url = pickNullish(nb.url, ovNb.url, config.notificationUrl);
    const cameraEntity = pickNullish(nb.cameraEntity, ovNb.cameraEntity, config.cameraEntity);
    const interruptionLevel = pickNullish(nb.interruptionLevel, ovNb.interruptionLevel, config.interruptionLevel) || 'active';
    // sound uses || (pick) — matches v2's `||` sound chain
    const customSound =
      pick(nb.customSound, ovNb.customSound, config.customSound, config.customSoundPreInstalled) || 'default';
    const group = pickNullish(nb.group, ovNb.group, config.group);

    const data = {
      tag,
      ...(url ? { url } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(cameraEntity ? { entity_id: cameraEntity } : {}),
      ...(group ? { group } : {}),
      push: {
        sound: {
          name: customSound,
          ...(interruptionLevel === 'critical' ? { critical: 1, volume: 1.0 } : {}),
        },
        ...(interruptionLevel ? { 'interruption-level': interruptionLevel } : {}),
      },
    };

    return {
      service,
      tag,
      action: `notify.${service.deviceName}`,
      payload: { data: { title, message, data } },
    };
  });

  return { error: null, payloads };
}

module.exports = { buildNotificationPayloads, pick, pickNullish, firstDefined };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: PASS — 14 passing

- [ ] **Step 5: Commit**

```bash
git add lib/build-payload.js test/unit/build-payload.spec.js
git commit -m "feat: add base notification payload builder"
```

---

## Task 6: `lib/build-payload.js` — actions integration

**Files:**
- Modify: `lib/build-payload.js`
- Modify: `test/unit/build-payload.spec.js` (append a new `describe` block)

**Interfaces:**
- Consumes: `normalizeActions`, `applyActionOverrides` from `lib/action-list.js` (Task 3).
- Produces: `payload.data.data.actions` and `payload.data.data.action_data` on the objects returned by `buildNotificationPayloads` — consumed by Task 15 (action-ownership matching relies on `action_data.tag`/`deviceName`/`allServices` being present).

- [ ] **Step 1: Append the failing tests**

```js
// append to test/unit/build-payload.spec.js, inside the same file, after the existing describe block

describe('build-payload: actions', () => {
  it('omits actions and action_data entirely when no actions are configured', () => {
    const { payloads } = buildNotificationPayloads(baseConfig(), {});
    payloads[0].payload.data.data.should.not.have.property('actions');
    payloads[0].payload.data.data.should.not.have.property('action_data');
  });

  it('includes one entry per configured action, in order', () => {
    const config = baseConfig({ actions: [{ title: 'Open' }, { title: 'Ignore' }] });
    const { payloads } = buildNotificationPayloads(config, {});
    const actions = payloads[0].payload.data.data.actions;
    actions.should.have.length(2);
    actions[0].action.should.equal('1');
    actions[0].title.should.equal('Open');
    actions[1].action.should.equal('2');
    actions[1].title.should.equal('Ignore');
  });

  it('carries optional action properties through when set', () => {
    const config = baseConfig({
      actions: [{ title: 'Open', destructive: true, uri: '/open', activationMode: 'background' }],
    });
    const { payloads } = buildNotificationPayloads(config, {});
    const action = payloads[0].payload.data.data.actions[0];
    action.destructive.should.equal(true);
    action.uri.should.equal('/open');
    action.activationMode.should.equal('background');
  });

  it('attaches the sending service to each action', () => {
    const config = baseConfig({
      services: [{ deviceName: 'my_iphone' }],
      actions: [{ title: 'Open' }],
    });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.actions[0].service.deviceName.should.equal('my_iphone');
  });

  it('populates action_data with tag, deviceName, and allServices when actions are present', () => {
    const config = baseConfig({
      tag: 'front-door',
      services: [{ deviceName: 'my_iphone' }, { deviceName: 'my_ipad' }],
      actions: [{ title: 'Open' }],
    });
    const { payloads } = buildNotificationPayloads(config, {});
    const actionData = payloads[0].payload.data.data.action_data;
    actionData.tag.should.equal('FRONT_DOOR');
    actionData.deviceName.should.equal('my_iphone');
    actionData.allServices.should.eql(config.services);
  });

  it('carries populateUserInfo and clearNotificationsOnAction into action_data', () => {
    const config = baseConfig({
      actions: [{ title: 'Open' }],
      userInfo: true,
      isClearNotificationsOnAction: true,
    });
    const { payloads } = buildNotificationPayloads(config, {});
    const actionData = payloads[0].payload.data.data.action_data;
    actionData.populateUserInfo.should.equal(true);
    actionData.clearNotificationsOnAction.should.equal(true);
  });

  it('a global override action (keyed by id) replaces a configured action, service-level override wins over global', () => {
    const config = baseConfig({
      services: [{
        deviceName: 'my_iphone',
        serviceOverride: { actions: { 1: { title: 'Service Wins' } } },
      }],
      actions: [{ title: 'Configured Title' }],
    });
    const override = { actions: { 1: { title: 'Global Override' } } };
    const { payloads } = buildNotificationPayloads(config, override);
    payloads[0].payload.data.data.actions[0].title.should.equal('Service Wins');
  });

  it('[REV2] does NOT emit tap-to-perform target props into the iOS action payload', () => {
    const config = baseConfig({
      actions: [{ title: 'Unlock', targetService: 'lock.unlock', targetEntityId: 'lock.front_door' }],
    });
    const { payloads } = buildNotificationPayloads(config, {});
    const action = payloads[0].payload.data.data.actions[0];
    action.title.should.equal('Unlock');
    action.should.not.have.property('targetService');
    action.should.not.have.property('targetEntityId');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: FAIL — the new assertions fail because `actions`/`action_data` are never set yet.

- [ ] **Step 3: Extend the implementation**

```js
// lib/build-payload.js — replace the full file with this version
'use strict';

const { sanitizeTag } = require('./sanitize-tag');
const { normalizeActions, applyActionOverrides, IOS_ACTION_PROPS } = require('./action-list');

// [REV2] || semantics — '' is absent. Sound chain only (matches v2).
function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// [REV2] Nullish semantics — honors explicit ''. Used for every other override chain.
function pickNullish(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function firstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function buildNotificationPayloads(config, override) {
  const safeOverride = override || {};
  const services =
    safeOverride.services && safeOverride.services.length > 0
      ? safeOverride.services
      : config.services || [];

  if (!services || services.length === 0) {
    return { error: 'no services defined', payloads: [] };
  }

  const tag = sanitizeTag(pickNullish(safeOverride.tag, config.tag), config.title);
  const baseActions = normalizeActions(config.actions);

  const payloads = services.map((service) => {
    const serviceOverride = service.serviceOverride || {};
    const nb = serviceOverride.notificationBase || {};
    const ovNb = safeOverride.notificationBase || {};

    const title = pickNullish(nb.title, ovNb.title, config.title) || '';
    const subtitle = pickNullish(nb.subtitle, ovNb.subtitle, config.subtitle) || '';
    const message = pickNullish(nb.message, ovNb.message, config.message) || '';
    const url = pickNullish(nb.url, ovNb.url, config.notificationUrl);
    const cameraEntity = pickNullish(nb.cameraEntity, ovNb.cameraEntity, config.cameraEntity);
    const interruptionLevel = pickNullish(nb.interruptionLevel, ovNb.interruptionLevel, config.interruptionLevel) || 'active';
    const customSound =
      pick(nb.customSound, ovNb.customSound, config.customSound, config.customSoundPreInstalled) || 'default';
    const group = pickNullish(nb.group, ovNb.group, config.group);
    const populateUserInfo = firstDefined(
      nb.populateUserInformation,
      ovNb.populateUserInformation,
      config.userInfo,
      false
    );
    const clearOnAction = firstDefined(
      nb.clearNotificationsOnAction,
      ovNb.clearNotificationsOnAction,
      config.isClearNotificationsOnAction,
      false
    );

    const actionOverridesById = {
      ...(safeOverride.actions || {}),
      ...(serviceOverride.actions || {}),
    };
    // Emit only IOS_ACTION_PROPS into the payload — tap-to-perform target props
    // (targetService/targetEntityId/targetData) stay node-side and are never sent to iOS.
    const finalActions = applyActionOverrides(baseActions, actionOverridesById).map((a) => {
      const actionObj = { action: a.id, title: a.title };
      IOS_ACTION_PROPS.forEach((prop) => {
        if (a[prop] !== undefined) actionObj[prop] = a[prop];
      });
      actionObj.service = service;
      return actionObj;
    });

    const actionData =
      finalActions.length > 0
        ? {
            tag,
            populateUserInfo,
            clearNotificationsOnAction: clearOnAction,
            deviceName: service.deviceName,
            allServices: services,
          }
        : undefined;

    const data = {
      tag,
      ...(finalActions.length > 0 ? { actions: finalActions } : {}),
      ...(actionData ? { action_data: actionData } : {}),
      ...(url ? { url } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(cameraEntity ? { entity_id: cameraEntity } : {}),
      ...(group ? { group } : {}),
      push: {
        sound: {
          name: customSound,
          ...(interruptionLevel === 'critical' ? { critical: 1, volume: 1.0 } : {}),
        },
        ...(interruptionLevel ? { 'interruption-level': interruptionLevel } : {}),
      },
    };

    return {
      service,
      tag,
      action: `notify.${service.deviceName}`,
      payload: { data: { title, message, data } },
    };
  });

  return { error: null, payloads };
}

module.exports = { buildNotificationPayloads, pick, pickNullish, firstDefined };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: PASS — 22 passing

- [ ] **Step 5: Commit**

```bash
git add lib/build-payload.js test/unit/build-payload.spec.js
git commit -m "feat: integrate actions into notification payload builder"
```

---

## Task 7: `lib/build-payload.js` — map fields

**Files:**
- Modify: `lib/build-payload.js`
- Modify: `test/unit/build-payload.spec.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `payload.data.data.action_data.{latitude,longitude,second_latitude,second_longitude,shows_*}` when lat/long are present.

- [ ] **Step 1: Append the failing tests**

```js
// append to test/unit/build-payload.spec.js

describe('build-payload: map', () => {
  it('does not add map fields when latitude/longitude are absent', () => {
    const { payloads } = buildNotificationPayloads(baseConfig(), {});
    payloads[0].payload.data.data.should.not.have.property('action_data');
  });

  it('adds latitude/longitude to action_data when both are present', () => {
    const config = baseConfig({ firstLatitude: 40.1, firstLongitude: -75.1 });
    const { payloads } = buildNotificationPayloads(config, {});
    const ad = payloads[0].payload.data.data.action_data;
    ad.latitude.should.equal(40.1);
    ad.longitude.should.equal(-75.1);
  });

  it('does not add a second pin when only one pair is present', () => {
    const config = baseConfig({ firstLatitude: 40.1, firstLongitude: -75.1 });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.action_data.should.not.have.property('second_latitude');
  });

  it('adds the second pin and display flags when both pairs are present', () => {
    const config = baseConfig({
      firstLatitude: 40.1, firstLongitude: -75.1,
      secondLatitude: 40.2, secondLongitude: -75.2,
      showCompass: true, showTraffic: true,
    });
    const { payloads } = buildNotificationPayloads(config, {});
    const ad = payloads[0].payload.data.data.action_data;
    ad.second_latitude.should.equal(40.2);
    ad.second_longitude.should.equal(-75.2);
    ad.shows_compass.should.equal(true);
    ad.shows_traffic.should.equal(true);
    ad.shows_line_between_points.should.equal(false);
  });

  it('merges map fields into an existing action_data from a configured action', () => {
    const config = baseConfig({
      actions: [{ title: 'Open' }],
      firstLatitude: 40.1, firstLongitude: -75.1,
    });
    const { payloads } = buildNotificationPayloads(config, {});
    const ad = payloads[0].payload.data.data.action_data;
    ad.latitude.should.equal(40.1);
    ad.deviceName.should.equal(payloads[0].service.deviceName);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: FAIL — map assertions fail, `action_data` never gets lat/long fields.

- [ ] **Step 3: Extend the implementation**

In `lib/build-payload.js`, inside the `services.map((service) => { ... })` callback, add the map-field extraction after the `actionData` block and before building `data`, then merge `action_data` after `data` is constructed:

```js
// add inside the map callback, after computing actionOverridesById/finalActions/actionData:

    const mp = serviceOverride.map || {};
    const ovMp = safeOverride.map || {};
    // [REV2] pickNullish for map value fields (nullish precedence per spec Rev 2)
    const firstLatitude = pickNullish(mp.firstLatitude, ovMp.firstLatitude, config.firstLatitude);
    const firstLongitude = pickNullish(mp.firstLongitude, ovMp.firstLongitude, config.firstLongitude);
    const secondLatitude = pickNullish(mp.secondLatitude, ovMp.secondLatitude, config.secondLatitude);
    const secondLongitude = pickNullish(mp.secondLongitude, ovMp.secondLongitude, config.secondLongitude);
    const showLineBetweenPoints = firstDefined(mp.showLineBetweenPoints, ovMp.showLineBetweenPoints, config.showLineBetweenPoints, false);
    const showCompass = firstDefined(mp.showCompass, ovMp.showCompass, config.showCompass, false);
    const showPointsOfInterest = firstDefined(mp.showPointsOfInterest, ovMp.showPointsOfInterest, config.showPointsOfInterest, false);
    const showScale = firstDefined(mp.showScale, ovMp.showScale, config.showScale, false);
    const showTraffic = firstDefined(mp.showTraffic, ovMp.showTraffic, config.showTraffic, false);
    const showUserLocation = firstDefined(mp.showUserLocation, ovMp.showUserLocation, config.showUserLocation, false);
```

Then, immediately after the `data` object is constructed (after `const data = {...}`), add:

```js
    if (firstLatitude && firstLongitude) {
      data.action_data = {
        ...(actionData || {}),
        latitude: firstLatitude,
        longitude: firstLongitude,
        ...(secondLatitude && secondLongitude
          ? {
              second_latitude: secondLatitude,
              second_longitude: secondLongitude,
              shows_line_between_points: showLineBetweenPoints,
              shows_compass: showCompass,
              shows_points_of_interest: showPointsOfInterest,
              shows_scale: showScale,
              shows_traffic: showTraffic,
              shows_user_location: showUserLocation,
            }
          : {}),
      };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: PASS — 27 passing

- [ ] **Step 5: Commit**

```bash
git add lib/build-payload.js test/unit/build-payload.spec.js
git commit -m "feat: add map fields to notification payload builder"
```

---

## Task 8: `lib/build-payload.js` — media fields (attachment-structured)

**[REV2] Corrected key placement.** Per the current HA attachments doc, `image`/
`video`/`audio` sit directly under the inner data block (`data.data.image`, etc.), but
the override URL, content-type, lazy flag, and hide-thumbnail flag all live under a
single `data.data.attachment` object: `attachment.{url, content-type, lazy,
hide-thumbnail}`. v2 wrongly emitted top-level `data.data.contentUrl` and
`data.data.lazy`; this task emits the documented structure instead. A new
`contentType` config field maps to `attachment.content-type`. (Migration note lives in
Task 26.)

**Files:**
- Modify: `lib/build-payload.js`
- Modify: `test/unit/build-payload.spec.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `payload.data.data.{image,video,audio}` directly, and
  `payload.data.data.attachment.{url, content-type, lazy, hide-thumbnail}` when any of
  those are set. Task 8.5 adds badge + presentation_options to the same file; Live
  Activities gets its own separate builder in Task 31.

- [ ] **Step 1: Append the failing tests**

```js
// append to test/unit/build-payload.spec.js

describe('build-payload: media', () => {
  it('adds no media fields when none are configured', () => {
    const { payloads } = buildNotificationPayloads(baseConfig(), {});
    const d = payloads[0].payload.data.data;
    d.should.not.have.property('image');
    d.should.not.have.property('video');
    d.should.not.have.property('audio');
    d.should.not.have.property('attachment');
  });

  it('adds the image path directly under data', () => {
    const config = baseConfig({ imagePath: '/local/camera.jpg' });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.image.should.equal('/local/camera.jpg');
  });

  it('adds video and audio directly under data', () => {
    const config = baseConfig({ videoPath: '/v.mp4', audioPath: '/a.mp3' });
    const { payloads } = buildNotificationPayloads(config, {});
    const d = payloads[0].payload.data.data;
    d.video.should.equal('/v.mp4');
    d.audio.should.equal('/a.mp3');
  });

  it('[REV2] puts the override URL under attachment.url (not top-level contentUrl)', () => {
    const config = baseConfig({ contentUrl: 'https://x/y.mp4' });
    const { payloads } = buildNotificationPayloads(config, {});
    const d = payloads[0].payload.data.data;
    d.should.not.have.property('contentUrl');
    d.attachment.url.should.equal('https://x/y.mp4');
  });

  it('[REV2] puts content-type under attachment', () => {
    const config = baseConfig({ imagePath: '/x', contentType: 'jpeg' });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.attachment['content-type'].should.equal('jpeg');
  });

  it('[REV2] puts lazy and hide-thumbnail under attachment (not top-level lazy)', () => {
    const config = baseConfig({ imagePath: '/x.jpg', lazyLoading: true, hideThumbnail: true });
    const { payloads } = buildNotificationPayloads(config, {});
    const d = payloads[0].payload.data.data;
    d.should.not.have.property('lazy');
    d.attachment.lazy.should.equal(true);
    d.attachment['hide-thumbnail'].should.equal(true);
  });

  it('omits the attachment object entirely when no attachment sub-field is set', () => {
    const config = baseConfig({ imagePath: '/x.jpg', hideThumbnail: false, lazyLoading: false });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.should.not.have.property('attachment');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: FAIL — media assertions fail, no media fields are set yet.

- [ ] **Step 3: Extend the implementation**

In `lib/build-payload.js`, inside the map callback, add media-field extraction alongside the map-field extraction (after it, before `const data = {...}`):

```js
    const md = serviceOverride.media || {};
    const ovMd = safeOverride.media || {};
    // [REV2] pickNullish so an explicit '' override clears a configured media field
    const contentUrl = pickNullish(md.contentUrl, ovMd.contentUrl, config.contentUrl);
    const contentType = pickNullish(md.contentType, ovMd.contentType, config.contentType);
    const imagePath = pickNullish(md.imagePath, ovMd.imagePath, config.imagePath);
    const videoPath = pickNullish(md.videoPath, ovMd.videoPath, config.videoPath);
    const audioPath = pickNullish(md.audioPath, ovMd.audioPath, config.audioPath);
    const lazyLoading = firstDefined(md.lazyLoading, ovMd.lazyLoading, config.lazyLoading, false);
    const hideThumbnail = firstDefined(md.hideThumbnail, ovMd.hideThumbnail, config.hideThumbnail, false);
```

Then, after the map-fields `if (firstLatitude && firstLongitude) { ... }` block (from
Task 7), add. **[REV2]** `image`/`video`/`audio` go directly under `data`; `url`,
`content-type`, `lazy`, and `hide-thumbnail` all go under a single `attachment` object,
matching the current HA attachments doc:

```js
    // image/video/audio: directly under the inner data block
    if (imagePath) data.image = imagePath;
    if (videoPath) data.video = videoPath;
    if (audioPath) data.audio = audioPath;

    // attachment object: url / content-type / lazy / hide-thumbnail
    const attachment = {};
    if (contentUrl) attachment.url = contentUrl;
    if (contentType) attachment['content-type'] = contentType;
    if (lazyLoading) attachment.lazy = lazyLoading;
    if (hideThumbnail) attachment['hide-thumbnail'] = hideThumbnail;
    if (Object.keys(attachment).length > 0) data.attachment = attachment;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: PASS — 34 passing

- [ ] **Step 5: Commit**

```bash
git add lib/build-payload.js test/unit/build-payload.spec.js
git commit -m "feat: add media fields to notification payload builder"
```

---

## Task 8.5: `lib/build-payload.js` — badge and presentation_options [REV2 — NEW]

**[REV2] New v1 feature.** Adds two iOS notification fields: `data.push.badge` (integer
app-icon badge count) and `data.presentation_options` (array controlling foreground
display — any of `"alert"`, `"badge"`, `"sound"`). Both are standard notification
fields, so they extend `lib/build-payload.js`.

**Files:**
- Modify: `lib/build-payload.js`
- Modify: `test/unit/build-payload.spec.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `payload.data.data.push.badge` (integer) and
  `payload.data.data.presentation_options` (array) when set. `badge` follows the same
  3-tier override chain (`notificationBase.badge`); `presentation_options` too.

- [ ] **Step 1: Append the failing tests**

```js
// append to test/unit/build-payload.spec.js

describe('build-payload: badge and presentation_options', () => {
  it('adds no badge or presentation_options when unset', () => {
    const { payloads } = buildNotificationPayloads(baseConfig(), {});
    payloads[0].payload.data.data.push.should.not.have.property('badge');
    payloads[0].payload.data.data.should.not.have.property('presentation_options');
  });

  it('sets push.badge from config (integer)', () => {
    const config = baseConfig({ badge: 5 });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.push.badge.should.equal(5);
  });

  it('honors an explicit badge of 0 (clear-badge count) via nullish precedence', () => {
    const config = baseConfig({ badge: 3 });
    const override = { notificationBase: { badge: 0 } };
    const { payloads } = buildNotificationPayloads(config, override);
    payloads[0].payload.data.data.push.badge.should.equal(0);
  });

  it('sets presentation_options array when configured', () => {
    const config = baseConfig({ presentationOptions: ['alert', 'sound'] });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.presentation_options.should.eql(['alert', 'sound']);
  });

  it('a per-service override replaces presentation_options', () => {
    const config = baseConfig({
      presentationOptions: ['alert'],
      services: [{ deviceName: 'a', serviceOverride: { notificationBase: { presentationOptions: ['badge'] } } }],
    });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.presentation_options.should.eql(['badge']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: FAIL — `badge`/`presentation_options` are never set.

- [ ] **Step 3: Extend the implementation**

In `lib/build-payload.js`, inside the map callback, compute the two values alongside the
other base fields (badge uses nullish precedence so an explicit `0` is honored;
`presentation_options` uses `firstDefined` so an explicit `[]` is honored):

```js
    const badge = pickNullish(nb.badge, ovNb.badge, config.badge);
    const presentationOptions = firstDefined(nb.presentationOptions, ovNb.presentationOptions, config.presentationOptions);
```

Add `badge` into the `push` object (only when it is a number, so `0` is included but
`undefined`/`''` is not):

```js
      push: {
        sound: {
          name: customSound,
          ...(interruptionLevel === 'critical' ? { critical: 1, volume: 1.0 } : {}),
        },
        ...(interruptionLevel ? { 'interruption-level': interruptionLevel } : {}),
        ...(typeof badge === 'number' ? { badge } : {}),
      },
```

And add `presentation_options` into `data` (spread near the other top-level keys), only
when it's a non-empty array:

```js
      ...(Array.isArray(presentationOptions) && presentationOptions.length > 0
        ? { presentation_options: presentationOptions }
        : {}),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: PASS — 39 passing

- [ ] **Step 5: Commit**

```bash
git add lib/build-payload.js test/unit/build-payload.spec.js
git commit -m "feat: add badge and presentation_options to payload builder"
```

---

## Task 9: `lib/build-clear-payload.js` — manual clear path

**Files:**
- Create: `lib/build-clear-payload.js`
- Test: `test/unit/build-clear-payload.spec.js`

**Interfaces:**
- Consumes: `sanitizeTag` from `lib/sanitize-tag.js` (Task 2).
- Produces: `buildManualClearPayloads(config, override): {error: string|null, payloads: Array<{service, tag, action, payload}>}` — consumed by Task 14 (manual clear input handling).

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/build-clear-payload.spec.js
'use strict';

require('should');
const { buildManualClearPayloads } = require('../../lib/build-clear-payload');

function baseConfig(overrides = {}) {
  return {
    tag: '',
    services: [{ deviceName: 'my_iphone' }],
    title: 'Default Title',
    ...overrides,
  };
}

describe('build-clear-payload: manual clear', () => {
  it('errors when there are no services to clear', () => {
    const result = buildManualClearPayloads(baseConfig({ services: [] }), {});
    result.error.should.equal('no services defined');
    result.payloads.should.eql([]);
  });

  it('builds one clear_notification payload per service', () => {
    const config = baseConfig({ services: [{ deviceName: 'a' }, { deviceName: 'b' }], tag: 'front-door' });
    const { payloads } = buildManualClearPayloads(config, {});
    payloads.should.have.length(2);
    payloads[0].action.should.equal('notify.a');
    payloads[0].payload.data.message.should.equal('clear_notification');
    payloads[0].payload.data.data.tag.should.equal('FRONT_DOOR');
  });

  it('a msg-level services override replaces the configured target list', () => {
    const config = baseConfig({ services: [{ deviceName: 'a' }] });
    const override = { services: [{ deviceName: 'everyone' }], tag: 'x' };
    const { payloads } = buildManualClearPayloads(config, override);
    payloads.should.have.length(1);
    payloads[0].action.should.equal('notify.everyone');
  });

  it('a msg-level tag override replaces the configured tag', () => {
    const config = baseConfig({ tag: 'configured' });
    const { payloads } = buildManualClearPayloads(config, { tag: 'from-override' });
    payloads[0].payload.data.data.tag.should.equal('FROM_OVERRIDE');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/build-clear-payload.spec.js`
Expected: FAIL — `Cannot find module '../../lib/build-clear-payload'`

- [ ] **Step 3: Write the implementation**

```js
// lib/build-clear-payload.js
'use strict';

const { sanitizeTag } = require('./sanitize-tag');

function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function buildManualClearPayloads(config, override) {
  const safeOverride = override || {};
  const services =
    safeOverride.services && safeOverride.services.length > 0
      ? safeOverride.services
      : config.services || [];

  if (!services || services.length === 0) {
    return { error: 'no services defined', payloads: [] };
  }

  const tag = sanitizeTag(pick(safeOverride.tag, config.tag), config.title);

  const payloads = services.map((service) => ({
    service,
    tag,
    action: `notify.${service.deviceName}`,
    payload: { data: { message: 'clear_notification', data: { tag } } },
  }));

  return { error: null, payloads };
}

module.exports = { buildManualClearPayloads };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-clear-payload.spec.js`
Expected: PASS — 4 passing

- [ ] **Step 5: Commit**

```bash
git add lib/build-clear-payload.js test/unit/build-clear-payload.spec.js
git commit -m "feat: add manual clear-notification payload builder"
```

---

## Task 10: `lib/build-clear-payload.js` — auto-clear-on-action path

**Files:**
- Modify: `lib/build-clear-payload.js`
- Modify: `test/unit/build-clear-payload.spec.js`

**Interfaces:**
- Produces: `buildAutoClearPayloads(actionData): {error: string|null, payloads: Array<{service, tag, action, payload}>}` where `actionData` is the `action_data` object from a received `ios.notification_action_fired` event (`{tag, deviceName, allServices, ...}`). Consumed by Task 17 (auto-clear-on-action).

This is deliberately a **separate function** from `buildManualClearPayloads`, not a shared code path — v2's two clear-trigger branches use different data sources (config/override for manual clear vs. the fired event's `action_data` for auto-clear) and merging them would need to fake one shape into the other for no benefit.

- [ ] **Step 1: Append the failing tests**

```js
// append to test/unit/build-clear-payload.spec.js

describe('build-clear-payload: auto-clear on action', () => {
  it('errors when action_data has no allServices', () => {
    const result = buildAutoClearPayloads({ tag: 'x', deviceName: 'a', allServices: [] });
    result.error.should.equal('no services defined');
    result.payloads.should.eql([]);
  });

  it('clears the tag on every OTHER device, excluding the device that fired the action', () => {
    const actionData = {
      tag: 'FRONT_DOOR',
      deviceName: 'my_iphone',
      allServices: [{ deviceName: 'my_iphone' }, { deviceName: 'my_ipad' }],
    };
    const { payloads } = buildAutoClearPayloads(actionData);
    payloads.should.have.length(1);
    payloads[0].action.should.equal('notify.my_ipad');
    payloads[0].payload.data.data.tag.should.equal('FRONT_DOOR');
  });

  it('produces no payloads when the firing device is the only target', () => {
    const actionData = {
      tag: 'FRONT_DOOR',
      deviceName: 'my_iphone',
      allServices: [{ deviceName: 'my_iphone' }],
    };
    const { payloads } = buildAutoClearPayloads(actionData);
    payloads.should.have.length(0);
  });

  it('does not re-sanitize the tag (it is already sanitized on the fired event)', () => {
    const actionData = {
      tag: 'ALREADY_SANITIZED',
      deviceName: 'a',
      allServices: [{ deviceName: 'a' }, { deviceName: 'b' }],
    };
    const { payloads } = buildAutoClearPayloads(actionData);
    payloads[0].payload.data.data.tag.should.equal('ALREADY_SANITIZED');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/build-clear-payload.spec.js`
Expected: FAIL — `buildAutoClearPayloads is not a function`

- [ ] **Step 3: Extend the implementation**

```js
// lib/build-clear-payload.js — add below buildManualClearPayloads, update exports

function buildAutoClearPayloads(actionData) {
  const services = (actionData && actionData.allServices) || [];

  if (!services || services.length === 0) {
    return { error: 'no services defined', payloads: [] };
  }

  const tag = actionData.tag;
  const firingDevice = actionData.deviceName;

  const payloads = services
    .filter((service) => service && service.deviceName !== firingDevice)
    .map((service) => ({
      service,
      tag,
      action: `notify.${service.deviceName}`,
      payload: { data: { message: 'clear_notification', data: { tag } } },
    }));

  return { error: null, payloads };
}

module.exports = { buildManualClearPayloads, buildAutoClearPayloads };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-clear-payload.spec.js`
Expected: PASS — 8 passing

- [ ] **Step 5: Commit**

```bash
git add lib/build-clear-payload.js test/unit/build-clear-payload.spec.js
git commit -m "feat: add auto-clear-on-action payload builder"
```

---

## Task 11: `lib/ha-client.js` — Home Assistant integration wrapper

**Files:**
- Create: `lib/ha-client.js`

**Interfaces:**
- Consumes: `node-red-contrib-home-assistant-websocket/dist/homeAssistant` (`getHomeAssistant`) — verified against the installed `0.80.3` source at `/home/steve/Documents/docker/hosted-external/node-red/volumes/user/node_modules/node-red-contrib-home-assistant-websocket/dist/homeAssistant/index.js` and `HomeAssistant.js`.
- Produces: `connect(serverConfigNode)`, `subscribeToActionEvents(homeAssistant, subscriberId, handler)`, `unsubscribeFromActionEvents(homeAssistant, subscriberId, handler)`, `sendNotification(homeAssistant, deviceName, serviceData)`, `callAction(homeAssistant, domain, service, data, target)`, `fetchUsers(homeAssistant)`, `getNotifyTargets(homeAssistant)`, `getEntities(homeAssistant, prefix)`, `getCameraEntities(homeAssistant)`, `getCallableServices(homeAssistant)`, `ACTION_EVENT_TYPES`, `actionBusName(eventType)` — consumed by Task 12 (node registration) and Tasks 13–17, 15.5 (all runtime behaviors), and by Tasks 21/22/30 (picker admin endpoints).

Not unit-tested directly (it's a thin wrapper over a live external client with no pure logic of its own) — exercised by the integration tests in Tasks 12–17 via a `proxyquire`-injected fake.

**[REV2] Dual-event subscription.** The node listens for BOTH the current
`mobile_app_notification_action` event and the legacy/deprecated
`ios.notification_action_fired` event, so it works on old and new HA/app versions. The
palette's `eventsList` maps one subscriber key to one event type, so this task uses two
synthetic keys per node (`${subscriberId}::0`, `::1`) and adds the same handler on both
bus names. The action-id field differs (`action` on the modern event, `actionName` on
the legacy one) — normalization happens in the node handler (Task 15), not here.

**Verified facts this task's code depends on (do not re-derive — confirmed by reading the installed package source):**
- `getHomeAssistant(serverConfigNode)` — exported from `dist/homeAssistant/index.js`, returns/creates a cached `HomeAssistant` client keyed by the server config node's `id`.
- The client exposes: `eventsList` (a plain object, `{[subscriberKey]: eventType}`, driving what the underlying websocket subscribes to), `isConnected` (getter), `subscribeEvents()` (re-subscribes over websocket using the current `eventsList`), `addListener(name, handler, {once})` / `removeListener(name, handler)` (delegate to an internal `EventEmitter`), `callService(domain, service, data, target)`, `send(rawMessage)`, `getServices()` (returns `{domain: {service: meta}}`), `getStates()` (returns `{entity_id: stateObj}`).
- Specific event-type subscriptions arrive on the bus under the name `` `ha_events:${eventType}` `` (confirmed via `dist/nodes/events-all/events.js`'s `startListeners` and the `HA_EVENTS` constant `"ha_events"` in `dist/const.js`).
- The legacy `ha_events:ios.notification_action_fired` handler receives the shape the original subflow's `server-events` node exposed as `msg.payload` — `event.event.actionName`, `event.event.action_data.{tag,deviceName,allServices,populateUserInfo,clearNotificationsOnAction}`, `event.context.user_id` (ground truth from the extracted subflow code + the palette's `eventData` resolver in `TypedInputService.js`, which passes the raw bus object through unmodified). **[REV2]** The modern `mobile_app_notification_action` handler receives the same wrapper shape but with the action id at `event.event.action` (not `actionName`); `action_data` is at `event.event.action_data` on both. This modern-shape mapping is derived from the companion-app docs (action / reply_text / action_data fields), NOT verified against a live event — flagged for confirmation during the Task 27 npm-link smoke test. The normalizer in Task 15 reads `event.event.action ?? event.event.actionName`, so a wrong guess degrades gracefully to the legacy field.
- The config node type for "which HA server" is `"server"` (confirmed in `dist/index.html`'s `RED.nodes.registerType` calls).

**[REV2] Resolved (was flagged unverified):** `homeAssistant.send({type:'config/auth/list'})` resolves to a **bare array** — `home-assistant-js-websocket`'s `sendMessagePromise` resolves `message.result`, so the envelope is already unwrapped. `fetchUsers` returns the array directly; no `{result}` branch needed.

- [ ] **Step 1: Write the implementation**

```js
// lib/ha-client.js
'use strict';

const { getHomeAssistant } = require('node-red-contrib-home-assistant-websocket/dist/homeAssistant');

// [REV2] Modern event first, legacy second — the node listens for both.
const ACTION_EVENT_TYPES = ['mobile_app_notification_action', 'ios.notification_action_fired'];

function actionBusName(eventType) {
  return `ha_events:${eventType}`;
}

function connect(serverConfigNode) {
  return getHomeAssistant(serverConfigNode);
}

function subscribeToActionEvents(homeAssistant, subscriberId, handler) {
  ACTION_EVENT_TYPES.forEach((eventType, i) => {
    homeAssistant.eventsList[`${subscriberId}::${i}`] = eventType;
    homeAssistant.addListener(actionBusName(eventType), handler);
  });
  if (homeAssistant.isConnected) {
    homeAssistant.subscribeEvents();
  }
}

function unsubscribeFromActionEvents(homeAssistant, subscriberId, handler) {
  ACTION_EVENT_TYPES.forEach((eventType, i) => {
    homeAssistant.removeListener(actionBusName(eventType), handler);
    delete homeAssistant.eventsList[`${subscriberId}::${i}`];
  });
  if (homeAssistant.isConnected) {
    homeAssistant.subscribeEvents();
  }
}

async function sendNotification(homeAssistant, deviceName, serviceData) {
  return homeAssistant.callService('notify', deviceName, serviceData, undefined);
}

// [REV2] Generic service call for the tap-to-perform feature.
async function callAction(homeAssistant, domain, service, data, target) {
  return homeAssistant.callService(domain, service, data, target);
}

async function fetchUsers(homeAssistant) {
  const result = await homeAssistant.send({ type: 'config/auth/list' });
  return Array.isArray(result) ? result : [];
}

function getNotifyTargets(homeAssistant) {
  const services = homeAssistant.getServices() || {};
  return Object.keys(services.notify || {});
}

function getEntities(homeAssistant, prefix) {
  const ids = Object.keys(homeAssistant.getStates() || {});
  return (prefix ? ids.filter((id) => id.startsWith(prefix)) : ids).sort();
}

function getCameraEntities(homeAssistant) {
  return getEntities(homeAssistant, 'camera.');
}

// [REV2] "domain.service" strings for the tap-to-perform service picker.
function getCallableServices(homeAssistant) {
  const services = homeAssistant.getServices() || {};
  const out = [];
  Object.keys(services).forEach((domain) => {
    Object.keys(services[domain] || {}).forEach((service) => out.push(`${domain}.${service}`));
  });
  return out.sort();
}

module.exports = {
  ACTION_EVENT_TYPES,
  actionBusName,
  connect,
  subscribeToActionEvents,
  unsubscribeFromActionEvents,
  sendNotification,
  callAction,
  fetchUsers,
  getNotifyTargets,
  getEntities,
  getCameraEntities,
  getCallableServices,
};
```

- [ ] **Step 2: Verify the module loads and the peer dependency resolves**

Run: `node -e "require('./lib/ha-client'); console.log('ha-client loads OK')"`
Expected: `ha-client loads OK` (this only proves the `require` chain resolves — it does not open a live connection, since `connect()` is not called).

- [ ] **Step 3: Commit**

```bash
git add lib/ha-client.js
git commit -m "feat: add Home Assistant integration wrapper"
```

---

## Task 12: Test double for the HA client, and node registration skeleton

**Files:**
- Create: `test/integration/helpers/mock-home-assistant.js`
- Create: `test/integration/helpers/test-flow.js`
- Create: `ha-ios-notification.js`
- Create: `ha-ios-notification.html` (minimal — full editor UI in Tasks 21–24)
- Test: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Produces: `createMockHomeAssistant(overrides): {client, states, services}` — a fake matching the `lib/ha-client.js` consumption surface (`eventsList`, `isConnected`, `subscribeEvents`, `addListener`, `removeListener`, `callService`, `send`, `getServices`, `getStates`) built on a real Node `EventEmitter` so `addListener`/emit work exactly like the live client. Consumed by every integration test task (13–17).
- Produces: node type `ha-ios-notification` registered with `RED.nodes.registerType`, config fields parsed onto `node.nodeConfig` / `node.actions` — consumed by Tasks 13–20 (they extend the same `ha-ios-notification.js` file).

- [ ] **Step 1: Write the mock HA client helper**

```js
// test/integration/helpers/mock-home-assistant.js
'use strict';

const EventEmitter = require('events');

function createMockHomeAssistant(overrides = {}) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  const client = {
    eventsList: {},
    isConnected: overrides.isConnected !== undefined ? overrides.isConnected : true,
    subscribeEvents() {
      // no-op in tests: real subscription happens over a live websocket
    },
    addListener(name, handler, opts = {}) {
      if (opts.once) emitter.once(name, handler);
      else emitter.on(name, handler);
    },
    removeListener(name, handler) {
      emitter.removeListener(name, handler);
    },
    callService: overrides.callService || (async () => ({ success: true })),
    send: overrides.send || (async () => []),
    getServices: overrides.getServices || (() => ({ notify: { my_iphone: {}, my_ipad: {} } })),
    getStates: overrides.getStates || (() => ({ 'camera.front_door': {}, 'light.kitchen': {} })),
  };

  return {
    client,
    // [REV2] default to the modern event; pass eventType to test the legacy path.
    emitFakeActionEvent(payload, eventType = 'mobile_app_notification_action') {
      emitter.emit(`ha_events:${eventType}`, payload);
    },
  };
}

module.exports = { createMockHomeAssistant };
```

- [ ] **Step 2: Write the test-flow helper (fake `server` config node + proxyquire wiring)**

```js
// test/integration/helpers/test-flow.js
'use strict';

const proxyquire = require('proxyquire');
const { createMockHomeAssistant } = require('./mock-home-assistant');

function loadNodeWithMockHomeAssistant(mockOverrides = {}) {
  const mock = createMockHomeAssistant(mockOverrides);

  const haClient = proxyquire('../../../lib/ha-client', {
    'node-red-contrib-home-assistant-websocket/dist/homeAssistant': {
      getHomeAssistant: () => mock.client,
    },
  });

  const nodeUnderTest = proxyquire('../../../ha-ios-notification.js', {
    './lib/ha-client': haClient,
  });

  return { nodeUnderTest, mock };
}

// A minimal stand-in for the real "server" config node — just enough
// identity (an id) for RED.nodes.getNode(config.server) to resolve.
const fakeServerFlowNode = {
  id: 'server1',
  type: 'server',
  name: 'Fake HA Server',
};

module.exports = { loadNodeWithMockHomeAssistant, fakeServerFlowNode };
```

- [ ] **Step 3: Write the failing integration test (node loads and registers)**

```js
// test/integration/ha-ios-notification.spec.js
'use strict';

require('should');
const helper = require('node-red-node-test-helper');
const { loadNodeWithMockHomeAssistant, fakeServerFlowNode } = require('./helpers/test-flow');

helper.init(require.resolve('node-red'));

describe('ha-ios-notification node', () => {
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

  it('loads with no config and reports no errors', function (done) {
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      { id: 'n1', type: 'ha-ios-notification', server: 'server1', actions: [], name: 'notify' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.should.have.property('id', 'n1');
      done();
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — `Cannot find module '../../../ha-ios-notification.js'`

- [ ] **Step 5: Write the node registration skeleton**

```js
// ha-ios-notification.js
'use strict';

const haClient = require('./lib/ha-client');

module.exports = function (RED) {
  function normalizeNodeConfig(config) {
    return {
      tag: config.tag || '',
      services: config.services || [],
      group: config.group || '',
      title: config.title || '',
      subtitle: config.subtitle || '',
      message: config.message || '',
      notificationUrl: config.notificationUrl || '',
      cameraEntity: config.cameraEntity || '',
      customSoundPreInstalled: config.customSoundPreInstalled || 'default',
      customSound: config.customSound || '',
      interruptionLevel: config.interruptionLevel || 'active',
      userInfo: !!config.userInfo,
      isClearNotificationsOnAction: !!config.isClearNotificationsOnAction,
      actions: config.actions || [],
      firstLatitude: config.firstLatitude || '',
      firstLongitude: config.firstLongitude || '',
      secondLatitude: config.secondLatitude || '',
      secondLongitude: config.secondLongitude || '',
      showLineBetweenPoints: !!config.showLineBetweenPoints,
      showCompass: !!config.showCompass,
      showPointsOfInterest: !!config.showPointsOfInterest,
      showScale: !!config.showScale,
      showTraffic: !!config.showTraffic,
      showUserLocation: !!config.showUserLocation,
      contentUrl: config.contentUrl || '',
      contentType: config.contentType || '',
      imagePath: config.imagePath || '',
      videoPath: config.videoPath || '',
      audioPath: config.audioPath || '',
      lazyLoading: !!config.lazyLoading,
      hideThumbnail: !!config.hideThumbnail,
      // [REV2] badge + presentation_options
      badge: config.badge === undefined || config.badge === '' ? undefined : Number(config.badge),
      presentationOptions: Array.isArray(config.presentationOptions) ? config.presentationOptions : [],
      // [REV2] stagger between per-device sends; default non-zero (protects APNs, see Task 18)
      staggerMs: config.staggerMs === undefined || config.staggerMs === '' ? 1000 : Number(config.staggerMs),
      // [REV2] Live Activity mode + its fields (see Task 31)
      liveActivity: !!config.liveActivity,
      progress: config.progress === undefined || config.progress === '' ? undefined : Number(config.progress),
      progressMax: config.progressMax === undefined || config.progressMax === '' ? undefined : Number(config.progressMax),
      chronometer: !!config.chronometer,
      when: config.when === undefined || config.when === '' ? undefined : Number(config.when),
      whenRelative: !!config.whenRelative,
      notificationIcon: config.notificationIcon || '',
      notificationIconColor: config.notificationIconColor || '',
      color: config.color || '',
      backgroundColor: config.backgroundColor || '',
      textColor: config.textColor || '',
      debugMode: !!config.debugMode,
    };
  }

  function HaIosNotificationNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.serverConfig = RED.nodes.getNode(config.server);
    node.actions = config.actions || [];
    node.nodeConfig = normalizeNodeConfig(config);
    node.outputCount = node.actions.length;

    node.homeAssistant = node.serverConfig ? haClient.connect(node.serverConfig) : null;
  }

  RED.nodes.registerType('ha-ios-notification', HaIosNotificationNode);
};
```

- [ ] **Step 6: Write a minimal editor HTML file so `helper.load` doesn't warn about a missing definition**

```html
<!-- ha-ios-notification.html -->
<script type="text/javascript">
  RED.nodes.registerType('ha-ios-notification', {
    category: 'home_assistant',
    color: '#C7E9C0',
    defaults: {
      name: { value: '' },
      server: { value: '', type: 'server' },
      tag: { value: '' },
      services: { value: [] },
      group: { value: '' },
      title: { value: '' },
      subtitle: { value: '' },
      message: { value: '' },
      notificationUrl: { value: '' },
      cameraEntity: { value: '' },
      customSoundPreInstalled: { value: 'default' },
      customSound: { value: '' },
      interruptionLevel: { value: 'active' },
      userInfo: { value: false },
      isClearNotificationsOnAction: { value: false },
      actions: { value: [] },
      firstLatitude: { value: '' },
      firstLongitude: { value: '' },
      secondLatitude: { value: '' },
      secondLongitude: { value: '' },
      showLineBetweenPoints: { value: false },
      showCompass: { value: false },
      showPointsOfInterest: { value: false },
      showScale: { value: false },
      showTraffic: { value: false },
      showUserLocation: { value: false },
      contentUrl: { value: '' },
      imagePath: { value: '' },
      videoPath: { value: '' },
      audioPath: { value: '' },
      lazyLoading: { value: false },
      hideThumbnail: { value: false },
      debugMode: { value: false },
    },
    inputs: 1,
    outputs: 0,
    icon: 'font-awesome/fa-mobile-phone',
    label: function () {
      return this.name || 'HA iOS Notification';
    },
    oneditsave: function () {
      this.outputs = (this.actions || []).length;
    },
  });
</script>
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 1 passing

- [ ] **Step 8: Commit**

```bash
git add test/integration/helpers ha-ios-notification.js ha-ios-notification.html test/integration/ha-ios-notification.spec.js
git commit -m "feat: node registration skeleton and integration test harness"
```

---

## Task 13: Send path (input handler, non-clear)

**Files:**
- Modify: `ha-ios-notification.js`
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Consumes: `buildNotificationPayloads` (Task 6/7/8), `haClient.sendNotification` (Task 11), `lib/message-store.js` (Task 4).
- Produces: on `msg` input without `msg.clear`, calls `haClient.sendNotification` once per target service and records each send via `message-store`, keyed in `node.context()` under `sentMessages`.

- [ ] **Step 1: Append the failing test**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('send path', () => {
  it('calls sendNotification once per configured service', function (done) {
    const calls = [];
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant({
      callService: async (domain, service, data) => {
        calls.push({ domain, service, data });
        return { success: true };
      },
    });
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }, { deviceName: 'my_ipad' }],
        title: 'Test', message: 'Hello', actions: [],
        wires: [],
      },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        calls.should.have.length(2);
        calls[0].domain.should.equal('notify');
        calls[0].service.should.equal('my_iphone');
        calls[0].data.title.should.equal('Test');
        done();
      }, 20);
    });
  });

  it('sets an error status and does not call sendNotification when no services are configured', function (done) {
    const calls = [];
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant({
      callService: async (...args) => { calls.push(args); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      { id: 'n1', type: 'ha-ios-notification', server: 'server1', services: [], actions: [], wires: [] },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        calls.should.have.length(0);
        done();
      }, 20);
    });
  });

  it('records each sent notification in node.context() under sentMessages', function (done) {
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door', actions: [], wires: [],
      },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        const stored = n1.context().get('sentMessages') || [];
        stored.should.have.length(1);
        stored[0].tag.should.equal('FRONT_DOOR');
        stored[0].deviceName.should.equal('my_iphone');
        done();
      }, 20);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — `n1.receive is not a function` triggers nothing since there's no `input` handler yet; `calls` stays empty and the first new test times out/fails its length assertion.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

```js
// ha-ios-notification.js — add these requires at the top, below `const haClient = require('./lib/ha-client');`
const { buildNotificationPayloads } = require('./lib/build-payload');
const messageStore = require('./lib/message-store');
```

Add inside `HaIosNotificationNode`, after `node.homeAssistant = ...`:

```js
    node.on('input', function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err) { if (err) node.error(err, msg); };

      if (msg.clear) {
        done(); // manual clear path implemented in Task 14
        return;
      }

      handleSend(node, msg, send, done);
    });
```

Add these functions at module scope (below `HaIosNotificationNode`, above `RED.nodes.registerType`):

```js
  async function handleSend(node, msg, send, done) {
    const { error, payloads } = buildNotificationPayloads(node.nodeConfig, msg.notificationOverride);

    if (error) {
      node.status({ text: error, shape: 'ring', fill: 'red' });
      done();
      return;
    }

    try {
      const now = Date.now();
      let stored = node.context().get('sentMessages') || [];

      for (const item of payloads) {
        await haClient.sendNotification(node.homeAssistant, item.service.deviceName, item.payload.data);
        stored = messageStore.recordSent(stored, {
          tag: item.tag,
          deviceName: item.service.deviceName,
          dateCreated: now,
          message: msg,
        });
        // [REV2] persist after EACH successful send, so a mid-fan-out failure never
        // silently drops an already-delivered device from the tracking store.
        node.context().set('sentMessages', stored);
      }

      node.status({ text: `sent to ${payloads.length} service(s)`, shape: 'dot', fill: 'green' });
      done();
    } catch (err) {
      node.error(err, msg);
      done(err);
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 4 passing

- [ ] **Step 5: Commit**

```bash
git add ha-ios-notification.js test/integration/ha-ios-notification.spec.js
git commit -m "feat: implement notification send path"
```

---

## Task 14: Manual clear path

**Files:**
- Modify: `ha-ios-notification.js`
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Consumes: `buildManualClearPayloads` (Task 9), `haClient.sendNotification`, `lib/message-store.js` `removeMatch`.
- Produces: on `msg.clear === true`, sends `clear_notification` to targets and removes matching entries from `sentMessages`.

- [ ] **Step 1: Append the failing tests**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('manual clear path', () => {
  it('sends clear_notification to every configured service when msg.clear is true', function (done) {
    const calls = [];
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant({
      callService: async (domain, service, data) => { calls.push({ service, data }); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'a' }, { deviceName: 'b' }], tag: 'front-door', actions: [], wires: [],
      },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ clear: true });
      setTimeout(() => {
        calls.should.have.length(2);
        calls[0].data.message.should.equal('clear_notification');
        calls[0].data.data.tag.should.equal('FRONT_DOOR');
        done();
      }, 20);
    });
  });

  it('removes the matching tracked entry from sentMessages on manual clear', function (done) {
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'a' }], tag: 'front-door', actions: [], wires: [],
      },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} }); // send first, so there's something to clear
      setTimeout(() => {
        n1.receive({ clear: true });
        setTimeout(() => {
          const stored = n1.context().get('sentMessages') || [];
          stored.should.have.length(0);
          done();
        }, 20);
      }, 20);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — the manual-clear branch currently just calls `done()` with no side effects, so `calls` stays empty.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

Add to the requires:

```js
const { buildManualClearPayloads } = require('./lib/build-clear-payload');
```

Replace the `if (msg.clear) { done(); return; }` block inside `node.on('input', ...)` with:

```js
      if (msg.clear) {
        handleManualClear(node, msg, send, done);
        return;
      }
```

Add the function at module scope, near `handleSend`:

```js
  async function handleManualClear(node, msg, send, done) {
    const { error, payloads } = buildManualClearPayloads(node.nodeConfig, msg.notificationOverride);

    if (error) {
      node.status({ text: error, shape: 'ring', fill: 'red' });
      done();
      return;
    }

    try {
      let stored = node.context().get('sentMessages') || [];

      for (const item of payloads) {
        await haClient.sendNotification(node.homeAssistant, item.service.deviceName, item.payload.data);
        stored = messageStore.removeMatch(stored, item.tag, item.service.deviceName);
      }

      node.context().set('sentMessages', stored);
      node.status({ text: `cleared ${payloads.length} notification(s)`, shape: 'dot', fill: 'blue' });
      done();
    } catch (err) {
      node.error(err, msg);
      done(err);
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 6 passing

- [ ] **Step 5: Commit**

```bash
git add ha-ios-notification.js test/integration/ha-ios-notification.spec.js
git commit -m "feat: implement manual clear-notification path"
```

---

## Task 15: Action-received handling — ownership matching and dynamic output routing

**Files:**
- Modify: `ha-ios-notification.js`
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Consumes: `haClient.subscribeToActionEvents`/`unsubscribeFromActionEvents` (Task 11), `lib/message-store.js` `findMatch` (Task 4), `node.actions` (Task 12, for output-index lookup by action id).
- Produces: `normalizeActionId(eventPayload)` (module scope) and the action-received handler. **[REV2]** When EITHER `mobile_app_notification_action` OR `ios.notification_action_fired` fires and its `action_data.tag`+`deviceName` matches this node's own `sentMessages`, sends on the output whose configured action id equals the normalized action id (`event.event.action ?? event.event.actionName`), and sets `msg.actionId` to that normalized id. Non-matching events (a different node instance's, or another platform's) are silently ignored — the multi-instance safety mechanism. Consumed by Task 15.5 (tap-to-perform), 16 (user-info), 17 (auto-clear), 19 (debug).

- [ ] **Step 1: Append the failing tests**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('action-received handling', () => {
  it('routes a received action to the output matching its configured id', function (done) {
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door',
        actions: [{ title: 'Open' }, { title: 'Ignore' }],
        wires: [['n2'], ['n3']],
      },
      { id: 'n2', type: 'helper' },
      { id: 'n3', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.receive({ payload: {} }); // send, so the tracked entry exists to match against

      setTimeout(() => {
        n2.on('input', (msg) => {
          msg.payload.event.actionName.should.equal('1');
          done();
        });

        mock.emitFakeActionEvent({
          event: {
            actionName: '1',
            action_data: { tag: 'FRONT_DOOR', deviceName: 'my_iphone', allServices: [{ deviceName: 'my_iphone' }] },
          },
          context: { user_id: 'user-123' },
        });
      }, 20);
    });
  });

  it('ignores an action event whose tag/device does not belong to this node instance', function (done) {
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door',
        actions: [{ title: 'Open' }],
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.receive({ payload: {} });

      setTimeout(() => {
        let received = false;
        n2.on('input', () => { received = true; });

        mock.emitFakeActionEvent({
          event: {
            actionName: '1',
            action_data: { tag: 'SOME_OTHER_TAG', deviceName: 'someone_elses_device', allServices: [] },
          },
          context: { user_id: 'user-123' },
        });

        setTimeout(() => {
          received.should.equal(false);
          done();
        }, 20);
      }, 20);
    });
  });

  it('[REV2] routes via the modern `action` field on mobile_app_notification_action', function (done) {
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door',
        actions: [{ title: 'Open' }], wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.receive({ payload: {} });
      setTimeout(() => {
        n2.on('input', (msg) => {
          msg.actionId.should.equal('1');
          done();
        });
        mock.emitFakeActionEvent(
          {
            event: {
              action: '1', // modern field name
              action_data: { tag: 'FRONT_DOOR', deviceName: 'my_iphone', allServices: [{ deviceName: 'my_iphone' }] },
            },
            context: { user_id: 'user-123' },
          },
          'mobile_app_notification_action'
        );
      }, 20);
    });
  });

  it('[REV2] routes via the legacy `actionName` field on ios.notification_action_fired', function (done) {
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door',
        actions: [{ title: 'Open' }], wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.receive({ payload: {} });
      setTimeout(() => {
        n2.on('input', (msg) => {
          msg.actionId.should.equal('1');
          done();
        });
        mock.emitFakeActionEvent(
          {
            event: {
              actionName: '1', // legacy field name
              action_data: { tag: 'FRONT_DOOR', deviceName: 'my_iphone', allServices: [{ deviceName: 'my_iphone' }] },
            },
            context: { user_id: 'user-123' },
          },
          'ios.notification_action_fired'
        );
      }, 20);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — nothing subscribes to action events yet, so `n2` never receives a message and the first test times out via Mocha's default timeout.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

Add to the requires:

```js
const { findMatch } = require('./lib/message-store');
```

In `HaIosNotificationNode`, after setting `node.outputCount = node.actions.length;`, add:

```js
    node.actionHandler = function (event) {
      handleActionReceived(node, event);
    };

    if (node.homeAssistant) {
      haClient.subscribeToActionEvents(node.homeAssistant, node.id, node.actionHandler);
    }

    node.on('close', function (removed, done) {
      if (node.homeAssistant) {
        haClient.unsubscribeFromActionEvents(node.homeAssistant, node.id, node.actionHandler);
      }
      done();
    });
```

Add the handler function at module scope:

```js
  // [REV2] Normalize the action id across both event shapes: the modern
  // mobile_app_notification_action carries `action`; the legacy
  // ios.notification_action_fired carries `actionName`.
  function normalizeActionId(eventPayload) {
    const raw = eventPayload.action !== undefined && eventPayload.action !== null
      ? eventPayload.action
      : eventPayload.actionName;
    return raw === undefined || raw === null ? undefined : String(raw);
  }

  function handleActionReceived(node, event) {
    const eventPayload = event && event.event;
    if (!eventPayload || !eventPayload.action_data) return;

    const { tag, deviceName } = eventPayload.action_data;
    if (!tag || !deviceName) return;

    const stored = node.context().get('sentMessages') || [];
    const owned = findMatch(stored, tag, deviceName);
    if (!owned) return; // belongs to a different node instance — ignore

    const actionId = normalizeActionId(eventPayload);
    if (actionId === undefined) return;

    const actionIndex = node.actions.findIndex((a, i) => {
      const id = a.id !== undefined && a.id !== null && a.id !== '' ? String(a.id) : String(i + 1);
      return id === actionId;
    });
    if (actionIndex === -1) return;

    const outputs = new Array(node.outputCount).fill(null);
    outputs[actionIndex] = { payload: event, actionId, matchedMessage: owned.message };
    node.status({ text: `action ${actionId} received`, shape: 'dot', fill: 'green' });
    node.send(outputs);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 10 passing

- [ ] **Step 5: Commit**

```bash
git add ha-ios-notification.js test/integration/ha-ios-notification.spec.js
git commit -m "feat: implement action-received routing with ownership matching"
```

---

## Task 16: User-info enrichment on action received

**Files:**
- Modify: `ha-ios-notification.js`
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Consumes: `haClient.fetchUsers` (Task 11).
- Produces: when the notification that was actioned had `populateUserInfo: true`, the output message's `msg.userData` is set to the HA user record matching `event.context.user_id`.

**[REV2] Resolved:** `homeAssistant.send({type:'config/auth/list'})` returns a bare
array (`sendMessagePromise` resolves `message.result`), so `haClient.fetchUsers` returns
it directly — no envelope handling needed. The earlier "verify live" caveat is closed.

- [ ] **Step 1: Append the failing tests**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('user-info enrichment', () => {
  it('attaches the matching user record when the sent notification had populateUserInfo set', function (done) {
    const users = [{ id: 'user-123', name: 'Steve' }, { id: 'user-456', name: 'Someone Else' }];
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant({ send: async () => users });
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door',
        actions: [{ title: 'Open' }], userInfo: true,
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.receive({ payload: {} });

      setTimeout(() => {
        n2.on('input', (msg) => {
          msg.userData.should.eql({ id: 'user-123', name: 'Steve' });
          done();
        });

        mock.emitFakeActionEvent({
          event: {
            actionName: '1',
            action_data: {
              tag: 'FRONT_DOOR', deviceName: 'my_iphone',
              allServices: [{ deviceName: 'my_iphone' }], populateUserInfo: true,
            },
          },
          context: { user_id: 'user-123' },
        });
      }, 20);
    });
  });

  it('does not fetch users when populateUserInfo was not set', function (done) {
    let sendCalled = false;
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant({ send: async () => { sendCalled = true; return []; } });
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door',
        actions: [{ title: 'Open' }], userInfo: false,
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.receive({ payload: {} });

      setTimeout(() => {
        n2.on('input', (msg) => {
          sendCalled.should.equal(false);
          (msg.userData === undefined).should.equal(true);
          done();
        });

        mock.emitFakeActionEvent({
          event: {
            actionName: '1',
            action_data: { tag: 'FRONT_DOOR', deviceName: 'my_iphone', allServices: [{ deviceName: 'my_iphone' }], populateUserInfo: false },
          },
          context: { user_id: 'user-123' },
        });
      }, 20);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — `msg.userData` is never set, so the first new test's assertion fails.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

Change `handleActionReceived` from a sync function to async, and fetch users when needed:

**[REV2]** This rewrite is the canonical `handleActionReceived` — it keeps the Task 15
`normalizeActionId` logic and `msg.actionId`, and Task 17 appends the auto-clear + state
cleanup after `node.send(outputs)`.

```js
  async function handleActionReceived(node, event) {
    const eventPayload = event && event.event;
    if (!eventPayload || !eventPayload.action_data) return;

    const { tag, deviceName, populateUserInfo } = eventPayload.action_data;
    if (!tag || !deviceName) return;

    const stored = node.context().get('sentMessages') || [];
    const owned = findMatch(stored, tag, deviceName);
    if (!owned) return;

    const actionId = normalizeActionId(eventPayload); // event.action ?? event.actionName
    if (actionId === undefined) return;

    const actionIndex = node.actions.findIndex((a, i) => {
      const id = a.id !== undefined && a.id !== null && a.id !== '' ? String(a.id) : String(i + 1);
      return id === actionId;
    });
    if (actionIndex === -1) return;

    const outMsg = { payload: event, actionId, matchedMessage: owned.message };

    if (populateUserInfo && event.context && event.context.user_id) {
      try {
        const users = await haClient.fetchUsers(node.homeAssistant);
        outMsg.userData = users.find((u) => u.id === event.context.user_id);
      } catch (err) {
        node.error(err, outMsg);
      }
    }

    const outputs = new Array(node.outputCount).fill(null);
    outputs[actionIndex] = outMsg;
    node.status({ text: `action ${actionId} received`, shape: 'dot', fill: 'green' });
    node.send(outputs);
  }
```

Since `handleActionReceived` is now `async`, update its call site so it isn't awaited synchronously (the event handler itself is fire-and-forget from the emitter's perspective, matching how Node-RED event-driven nodes normally behave):

```js
    node.actionHandler = function (event) {
      handleActionReceived(node, event).catch((err) => node.error(err));
    };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 12 passing

- [ ] **Step 5: Commit**

```bash
git add ha-ios-notification.js test/integration/ha-ios-notification.spec.js
git commit -m "feat: add user-info enrichment for received actions"
```

---

## Task 17: Auto-clear-on-action

**Files:**
- Modify: `ha-ios-notification.js`
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Consumes: `buildAutoClearPayloads` (Task 10), `haClient.sendNotification`.
- Produces: when the actioned notification had `clearNotificationsOnAction: true`, sends `clear_notification` to every *other* target device (not the one that fired the action).

- [ ] **Step 1: Append the failing test**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('auto-clear on action', () => {
  it('clears the notification on every other device when clearNotificationsOnAction is set', function (done) {
    const calls = [];
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant({
      callService: async (domain, service, data) => { calls.push({ service, data }); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }, { deviceName: 'my_ipad' }], tag: 'front-door',
        actions: [{ title: 'Open' }], isClearNotificationsOnAction: true,
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });

      setTimeout(() => {
        calls.length = 0; // discard the initial send calls, only interested in the clear call
        mock.emitFakeActionEvent({
          event: {
            actionName: '1',
            action_data: {
              tag: 'FRONT_DOOR', deviceName: 'my_iphone',
              allServices: [{ deviceName: 'my_iphone' }, { deviceName: 'my_ipad' }],
              clearNotificationsOnAction: true,
            },
          },
          context: { user_id: 'user-123' },
        });

        setTimeout(() => {
          calls.should.have.length(1);
          calls[0].service.should.equal('my_ipad');
          calls[0].data.message.should.equal('clear_notification');
          done();
        }, 20);
      }, 20);
    });
  });

  it('[REV2] purges the tracking store for the tag after an action is handled', function (done) {
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }, { deviceName: 'my_ipad' }], tag: 'front-door',
        actions: [{ title: 'Open' }], isClearNotificationsOnAction: true,
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        mock.emitFakeActionEvent({
          event: {
            action: '1',
            action_data: {
              tag: 'FRONT_DOOR', deviceName: 'my_iphone',
              allServices: [{ deviceName: 'my_iphone' }, { deviceName: 'my_ipad' }],
              clearNotificationsOnAction: true,
            },
          },
          context: { user_id: 'user-123' },
        });
        setTimeout(() => {
          (n1.context().get('sentMessages') || []).should.have.length(0);
          done();
        }, 30);
      }, 20);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — no clear call is made, `calls` stays empty; and the tracking store is not purged.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

Add to the requires:

```js
const { buildAutoClearPayloads } = require('./lib/build-clear-payload');
```

In `handleActionReceived`, after sending the output message (after `node.send(outputs);`), add. **[REV2]** After the clear calls, purge the tracking-store entries for this tag on **every** device in `allServices` (including the firing device) — mirroring v2's `cleanUpMessages`, so a duplicate/late action event for the same tag+device can't re-fire routing or a second auto-clear:

```js
    if (eventPayload.action_data.clearNotificationsOnAction) {
      try {
        const { payloads: clearPayloads } = buildAutoClearPayloads(eventPayload.action_data);
        for (const item of clearPayloads) {
          await haClient.sendNotification(node.homeAssistant, item.service.deviceName, item.payload.data);
        }
      } catch (err) {
        node.error(err);
      }
    }

    // [REV2] State cleanup on any received action: remove this tag's tracking entries
    // for every device in allServices (matches v2's cleanUpMessages), so duplicate/late
    // events for the same notification can't re-trigger routing or auto-clear.
    let after = node.context().get('sentMessages') || [];
    (eventPayload.action_data.allServices || [{ deviceName }]).forEach((svc) => {
      if (svc && svc.deviceName) after = messageStore.removeMatch(after, tag, svc.deviceName);
    });
    node.context().set('sentMessages', after);
```

**[REV2] Consciously dropped:** v2 inserted a ~10s+jitter *sequencing delay* before
routing the action output when `clearNotificationsOnAction` was set (subflow node
`4e7303e30463dcac`). We drop it — delaying the user's action output by 10s is poor UX,
and in this node the output and the clear calls are independent. This is a behavior
change from v2; it goes in the migration notes (Task 26).

Also ensure `messageStore` is required at the top of the file (added in Task 13); no new
require is needed beyond `buildAutoClearPayloads`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 14 passing

- [ ] **Step 5: Commit**

```bash
git add ha-ios-notification.js test/integration/ha-ios-notification.spec.js
git commit -m "feat: implement auto-clear-on-action"
```

---

## Task 18: Rate limiting (stagger between per-device sends)

**Files:**
- Modify: `ha-ios-notification.js`
- Modify: `ha-ios-notification.html`
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Produces: `staggerMs` behavior in `handleSend` — waits `staggerMs` between each per-device `sendNotification` call. **[REV2]** Default is **1000 ms, not 0** (already wired into `normalizeNodeConfig` in Task 12), so multi-device fan-out is throttled out of the box — v2 always rate-limited fan-out (~5s), and shipping with it fully off would risk slamming APNs/HA for exactly the multi-device flows this node targets. Set `staggerMs: 0` to disable.

**[REV2] Scope:** stagger applies to the send fan-out only. The manual-clear and
auto-clear fan-outs are intentionally NOT staggered — clears are idempotent and far less
bursty than sends. This is a conscious simplification of v2's throttle-everything wiring;
noted in the migration docs (Task 26).

This replaces v2's ad-hoc delay/rate-limit canvas nodes with an explicit, documented
config option.

- [ ] **Step 1: Append the failing test**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('rate limiting', () => {
  it('waits staggerMs between each per-device send when configured', function (done) {
    const timestamps = [];
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant({
      callService: async () => { timestamps.push(Date.now()); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'a' }, { deviceName: 'b' }], staggerMs: 100, actions: [], wires: [],
      },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        timestamps.should.have.length(2);
        // generous lower bound — asserts "staggered", not an exact interval
        (timestamps[1] - timestamps[0]).should.be.aboveOrEqual(70);
        done();
      }, 300);
    });
  });

  it('[REV2] does not wait between sends when staggerMs is explicitly 0', function (done) {
    const timestamps = [];
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant({
      callService: async () => { timestamps.push(Date.now()); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      { id: 'n1', type: 'ha-ios-notification', server: 'server1', services: [{ deviceName: 'a' }, { deviceName: 'b' }], staggerMs: 0, actions: [], wires: [] },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        timestamps.should.have.length(2);
        (timestamps[1] - timestamps[0]).should.be.below(50);
        done();
      }, 100);
    });
  });

  it('[REV2] staggers by default (staggerMs unset -> 1000ms) — asserts config default, not timing', function (done) {
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      { id: 'n1', type: 'ha-ios-notification', server: 'server1', services: [{ deviceName: 'a' }], actions: [], wires: [] },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.nodeConfig.staggerMs.should.equal(1000);
      done();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — sends happen back-to-back regardless of `staggerMs`, so the "waits" test's timing assertion fails.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

**[REV2]** `staggerMs` is already in `normalizeNodeConfig` (Task 12) with a default of
`1000`. Do NOT re-add it. Only add the delay helper and the staggered loop here.

Add a small delay helper at module scope:

```js
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
```

In `handleSend`, change the `for (const item of payloads) { ... }` loop to stagger
between iterations, keeping the [REV2] per-iteration persistence from Task 13:

```js
      const now = Date.now();
      let stored = node.context().get('sentMessages') || [];

      for (let i = 0; i < payloads.length; i += 1) {
        const item = payloads[i];
        await haClient.sendNotification(node.homeAssistant, item.service.deviceName, item.payload.data);
        stored = messageStore.recordSent(stored, {
          tag: item.tag,
          deviceName: item.service.deviceName,
          dateCreated: now,
          message: msg,
        });
        node.context().set('sentMessages', stored); // persist after each send
        if (node.nodeConfig.staggerMs > 0 && i < payloads.length - 1) {
          await delay(node.nodeConfig.staggerMs);
        }
      }
```

- [ ] **Step 4: Add the `staggerMs` field to the editor defaults in `ha-ios-notification.html`**

In the `defaults` object, add (**[REV2]** default 1000, matching `normalizeNodeConfig`):

```js
      staggerMs: { value: 1000 },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 17 passing

- [ ] **Step 6: Commit**

```bash
git add ha-ios-notification.js ha-ios-notification.html test/integration/ha-ios-notification.spec.js
git commit -m "feat: add configurable stagger delay between per-device sends"
```

---

## Task 19: Debug mode — conditional logging and `msg._debug`

**Files:**
- Modify: `ha-ios-notification.js`
- Modify: `ha-ios-notification.html`
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Produces: when `debugMode: true`, `node.trace()` logs the constructed payload before each send, and the output message (in both the send path's fire-and-forget nature — there's nothing to attach `_debug` to on send, since send has no output — and the action-received path, which does have an output) gets `msg._debug` populated with the matched tracked entry and raw event.

- [ ] **Step 1: Append the failing test**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('debug mode', () => {
  it('attaches msg._debug to the action-received output when debugMode is true', function (done) {
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door',
        actions: [{ title: 'Open' }], debugMode: true,
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.receive({ payload: {} });

      setTimeout(() => {
        n2.on('input', (msg) => {
          msg.should.have.property('_debug');
          msg._debug.should.have.property('matchedTag', 'FRONT_DOOR');
          done();
        });

        mock.emitFakeActionEvent({
          event: {
            actionName: '1',
            action_data: { tag: 'FRONT_DOOR', deviceName: 'my_iphone', allServices: [{ deviceName: 'my_iphone' }] },
          },
          context: { user_id: 'user-123' },
        });
      }, 20);
    });
  });

  it('does not attach msg._debug when debugMode is false', function (done) {
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door',
        actions: [{ title: 'Open' }], debugMode: false,
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.receive({ payload: {} });

      setTimeout(() => {
        n2.on('input', (msg) => {
          (msg._debug === undefined).should.equal(true);
          done();
        });

        mock.emitFakeActionEvent({
          event: {
            actionName: '1',
            action_data: { tag: 'FRONT_DOOR', deviceName: 'my_iphone', allServices: [{ deviceName: 'my_iphone' }] },
          },
          context: { user_id: 'user-123' },
        });
      }, 20);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — `msg._debug` is never set, so the first test's `.should.have.property('_debug')` fails.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

In `handleSend`, before the `for` loop, add trace logging:

```js
      if (node.nodeConfig.debugMode) {
        node.trace(`ha-ios-notification: sending to ${payloads.length} service(s): ${JSON.stringify(payloads.map((p) => p.action))}`);
      }
```

In `handleActionReceived`, in the `outMsg` construction, add debug info conditionally.
**[REV2]** The `outMsg` line now includes `actionId` (from Task 16). Change:

```js
    const outMsg = { payload: event, actionId, matchedMessage: owned.message };
```

to:

```js
    const outMsg = { payload: event, actionId, matchedMessage: owned.message };

    if (node.nodeConfig.debugMode) {
      outMsg._debug = {
        matchedTag: tag,
        matchedDeviceName: deviceName,
        rawEvent: event,
      };
      node.trace(`ha-ios-notification: action ${actionId} matched tag ${tag}`);
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 19 passing

- [ ] **Step 5: Commit**

```bash
git add ha-ios-notification.js test/integration/ha-ios-notification.spec.js
git commit -m "feat: add debug mode logging and msg._debug"
```

---

## Task 19.1: `clear_badge` command [REV2 — NEW]

**[REV2]** Adds a second input command alongside `msg.clear`: `msg.clearBadge = true`
sends the `clear_badge` command (silently zero the app-icon badge) to the configured/
overridden services, without showing a notification.

**Files:**
- Modify: `ha-ios-notification.js`
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Consumes: `haClient.sendNotification` (a `clear_badge` is just a notify call with
  `message: "clear_badge"`).
- Produces: on `msg.clearBadge === true` (and not `msg.clear`), sends
  `{ data: { message: 'clear_badge' } }` to each target service.

- [ ] **Step 1: Append the failing test**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('clear_badge command', () => {
  it('sends clear_badge to each service when msg.clearBadge is true', function (done) {
    const calls = [];
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant({
      callService: async (domain, service, data) => { calls.push({ service, data }); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      { id: 'n1', type: 'ha-ios-notification', server: 'server1', services: [{ deviceName: 'a' }, { deviceName: 'b' }], actions: [], wires: [] },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ clearBadge: true });
      setTimeout(() => {
        calls.should.have.length(2);
        calls[0].data.message.should.equal('clear_badge');
        done();
      }, 30);
    });
  });

  it('does not send a notification for a clearBadge message (no title/actions)', function (done) {
    const calls = [];
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant({
      callService: async (domain, service, data) => { calls.push(data); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      { id: 'n1', type: 'ha-ios-notification', server: 'server1', services: [{ deviceName: 'a' }], title: 'Should Not Send', actions: [], wires: [] },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ clearBadge: true });
      setTimeout(() => {
        calls.should.have.length(1);
        calls[0].message.should.equal('clear_badge');
        (calls[0].title === undefined).should.equal(true);
        done();
      }, 30);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — `clearBadge` is unhandled, so no `clear_badge` call is made.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

In the `node.on('input', ...)` handler, add a `clearBadge` branch before the `msg.clear`
branch:

```js
      if (msg.clearBadge) {
        handleClearBadge(node, msg, send, done);
        return;
      }
```

Add the handler at module scope:

```js
  async function handleClearBadge(node, msg, send, done) {
    const override = msg.notificationOverride || {};
    const services = (override.services && override.services.length > 0)
      ? override.services
      : node.nodeConfig.services;
    if (!services || services.length === 0) {
      node.status({ text: 'no services defined', shape: 'ring', fill: 'red' });
      done();
      return;
    }
    try {
      for (const service of services) {
        await haClient.sendNotification(node.homeAssistant, service.deviceName, { message: 'clear_badge' });
      }
      node.status({ text: `badge cleared on ${services.length} service(s)`, shape: 'dot', fill: 'blue' });
      done();
    } catch (err) {
      node.error(err, msg);
      done(err);
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 21 passing

- [ ] **Step 5: Commit**

```bash
git add ha-ios-notification.js test/integration/ha-ios-notification.spec.js
git commit -m "feat: add clear_badge command"
```

---

## Task 19.2: Tap-to-perform — service call on action receipt + picker endpoints [REV2 — NEW]

**[REV2]** When a received action's configured entry carries a `targetService`
(`"domain.service"`) — optionally with `targetEntityId` and `targetData` — the node
calls that HA service directly, in addition to emitting on the action's output. Also adds
the two admin endpoints the editor's tap-to-perform pickers use (Task 24.5).

**Files:**
- Modify: `ha-ios-notification.js`
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Consumes: `haClient.callAction`, `haClient.getCallableServices`, `haClient.getEntities`
  (Task 11); the matched action config from `node.actions[actionIndex]` (raw config
  carries `targetService`/`targetEntityId`/`targetData`, per Task 3).
- Produces: a `callService` on action receipt when a target is configured; and
  `GET /ha-ios-notification/callable-services` and `GET /ha-ios-notification/entities`
  admin endpoints.

- [ ] **Step 1: Append the failing test**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('tap-to-perform', () => {
  it('calls the configured HA service when the matched action has a targetService', function (done) {
    const calls = [];
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant({
      callService: async (domain, service, data, target) => { calls.push({ domain, service, data, target }); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door',
        actions: [{ title: 'Unlock', targetService: 'lock.unlock', targetEntityId: 'lock.front_door' }],
        wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        mock.emitFakeActionEvent({
          event: {
            action: '1',
            action_data: { tag: 'FRONT_DOOR', deviceName: 'my_iphone', allServices: [{ deviceName: 'my_iphone' }] },
          },
          context: { user_id: 'user-123' },
        });
        setTimeout(() => {
          const lockCall = calls.find((c) => c.domain === 'lock' && c.service === 'unlock');
          lockCall.should.be.ok();
          lockCall.target.should.eql({ entity_id: 'lock.front_door' });
          done();
        }, 30);
      }, 20);
    });
  });

  it('does not call any service when the matched action has no targetService', function (done) {
    const calls = [];
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant({
      callService: async (domain, service) => { calls.push(`${domain}.${service}`); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'front-door',
        actions: [{ title: 'Open' }], wires: [['n2']],
      },
      { id: 'n2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        calls.length = 0; // ignore the initial notify send
        mock.emitFakeActionEvent({
          event: { action: '1', action_data: { tag: 'FRONT_DOOR', deviceName: 'my_iphone', allServices: [{ deviceName: 'my_iphone' }] } },
          context: { user_id: 'u' },
        });
        setTimeout(() => {
          calls.should.have.length(0);
          done();
        }, 30);
      }, 20);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — no `lock.unlock` call is made.

- [ ] **Step 3: Extend `handleActionReceived`**

In `handleActionReceived`, after `node.send(outputs);` and before the Task 17 auto-clear
block, add the tap-to-perform call:

```js
    const matchedAction = node.actions[actionIndex];
    if (matchedAction && matchedAction.targetService) {
      const dot = String(matchedAction.targetService).indexOf('.');
      const domain = dot > 0 ? matchedAction.targetService.slice(0, dot) : '';
      const service = dot > 0 ? matchedAction.targetService.slice(dot + 1) : '';
      if (domain && service) {
        try {
          const target = matchedAction.targetEntityId ? { entity_id: matchedAction.targetEntityId } : undefined;
          await haClient.callAction(node.homeAssistant, domain, service, matchedAction.targetData || {}, target);
        } catch (err) {
          node.error(err);
        }
      }
    }
```

- [ ] **Step 4: Add the picker admin endpoints**

Near the other `RED.httpAdmin.get` registrations (added in Tasks 21–22), add:

```js
  RED.httpAdmin.get('/ha-ios-notification/callable-services', RED.auth.needsPermission('flows.write'), function (req, res) {
    const serverNode = RED.nodes.getNode(req.query.server);
    if (!serverNode) { res.json({ services: [] }); return; }
    try {
      res.json({ services: haClient.getCallableServices(haClient.connect(serverNode)) });
    } catch (err) {
      res.json({ services: [] });
    }
  });

  RED.httpAdmin.get('/ha-ios-notification/entities', RED.auth.needsPermission('flows.write'), function (req, res) {
    const serverNode = RED.nodes.getNode(req.query.server);
    if (!serverNode) { res.json({ entities: [] }); return; }
    try {
      res.json({ entities: haClient.getEntities(haClient.connect(serverNode), req.query.prefix) });
    } catch (err) {
      res.json({ entities: [] });
    }
  });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 23 passing

- [ ] **Step 6: Commit**

```bash
git add ha-ios-notification.js test/integration/ha-ios-notification.spec.js
git commit -m "feat: tap-to-perform service call on action receipt + picker endpoints"
```

---

## Task 19.3: `lib/build-live-activity.js` — Live Activity payload builder [REV2 — NEW]

**[REV2]** Live Activities are standard notify calls with `data.data.live_update: true`
+ a required `tag` and optional progress/chronometer/color fields. This pure builder
mirrors `buildNotificationPayloads`'s return shape so the runtime can reuse the send
loop. Ending an activity reuses the existing clear path (same tag), so no new clear code
is needed.

**Files:**
- Create: `lib/build-live-activity.js`
- Test: `test/unit/build-live-activity.spec.js`

**Interfaces:**
- Consumes: `sanitizeTag` (Task 2).
- Produces: `buildLiveActivityPayloads(config, override): {error, payloads: Array<{service, tag, action, payload}>}` — consumed by Task 19.4.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/build-live-activity.spec.js
'use strict';

require('should');
const { buildLiveActivityPayloads } = require('../../lib/build-live-activity');

function baseConfig(overrides = {}) {
  return {
    tag: 'laundry', services: [{ deviceName: 'my_iphone' }],
    title: 'Laundry', message: 'Washing', progress: 0, progressMax: 100,
    chronometer: false, when: undefined, whenRelative: false,
    notificationIcon: '', notificationIconColor: '', color: '',
    backgroundColor: '', textColor: '', ...overrides,
  };
}

describe('build-live-activity', () => {
  it('errors when no services are defined', () => {
    const result = buildLiveActivityPayloads(baseConfig({ services: [] }), {});
    result.error.should.equal('no services defined');
  });

  it('sets live_update true and the tag under data.data', () => {
    const { payloads } = buildLiveActivityPayloads(baseConfig({ tag: 'laundry' }), {});
    const inner = payloads[0].payload.data.data;
    inner.live_update.should.equal(true);
    inner.tag.should.equal('LAUNDRY');
  });

  it('puts title and message at data level', () => {
    const { payloads } = buildLiveActivityPayloads(baseConfig(), {});
    payloads[0].payload.data.title.should.equal('Laundry');
    payloads[0].payload.data.message.should.equal('Washing');
  });

  it('includes progress and progress_max when set (including 0)', () => {
    const { payloads } = buildLiveActivityPayloads(baseConfig({ progress: 0, progressMax: 100 }), {});
    const inner = payloads[0].payload.data.data;
    inner.progress.should.equal(0);
    inner.progress_max.should.equal(100);
  });

  it('includes chronometer/when/when_relative when chronometer is on', () => {
    const { payloads } = buildLiveActivityPayloads(baseConfig({ chronometer: true, when: 3600, whenRelative: true }), {});
    const inner = payloads[0].payload.data.data;
    inner.chronometer.should.equal(true);
    inner.when.should.equal(3600);
    inner.when_relative.should.equal(true);
  });

  it('maps color fields to snake_case keys when set', () => {
    const { payloads } = buildLiveActivityPayloads(baseConfig({
      color: '#111', backgroundColor: '#222', textColor: '#333',
      notificationIcon: 'mdi:washing-machine', notificationIconColor: '#444',
    }), {});
    const inner = payloads[0].payload.data.data;
    inner.color.should.equal('#111');
    inner.background_color.should.equal('#222');
    inner.text_color.should.equal('#333');
    inner.notification_icon.should.equal('mdi:washing-machine');
    inner.notification_icon_color.should.equal('#444');
  });

  it('omits unset optional fields', () => {
    const { payloads } = buildLiveActivityPayloads(baseConfig({ color: '', backgroundColor: '' }), {});
    const inner = payloads[0].payload.data.data;
    inner.should.not.have.property('color');
    inner.should.not.have.property('background_color');
  });

  it('fans out one payload per service and reuses the tag', () => {
    const { payloads } = buildLiveActivityPayloads(baseConfig({ services: [{ deviceName: 'a' }, { deviceName: 'b' }] }), {});
    payloads.should.have.length(2);
    payloads[0].action.should.equal('notify.a');
    payloads[1].tag.should.equal(payloads[0].tag);
  });

  it('a msg-level services override replaces the target list', () => {
    const { payloads } = buildLiveActivityPayloads(baseConfig(), { services: [{ deviceName: 'z' }] });
    payloads.should.have.length(1);
    payloads[0].action.should.equal('notify.z');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/unit/build-live-activity.spec.js`
Expected: FAIL — `Cannot find module '../../lib/build-live-activity'`

- [ ] **Step 3: Write the implementation**

```js
// lib/build-live-activity.js
'use strict';

const { sanitizeTag } = require('./sanitize-tag');

function pickNullish(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function buildLiveActivityPayloads(config, override) {
  const safeOverride = override || {};
  const la = safeOverride.liveActivity || {};
  const services =
    safeOverride.services && safeOverride.services.length > 0
      ? safeOverride.services
      : config.services || [];

  if (!services || services.length === 0) {
    return { error: 'no services defined', payloads: [] };
  }

  const tag = sanitizeTag(pickNullish(safeOverride.tag, config.tag), config.title);
  const title = pickNullish(la.title, config.title) || '';
  const message = pickNullish(la.message, config.message) || '';

  const progress = pickNullish(la.progress, config.progress);
  const progressMax = pickNullish(la.progressMax, config.progressMax);
  const chronometer = pickNullish(la.chronometer, config.chronometer) || false;
  const when = pickNullish(la.when, config.when);
  const whenRelative = pickNullish(la.whenRelative, config.whenRelative) || false;
  const notificationIcon = pickNullish(la.notificationIcon, config.notificationIcon);
  const notificationIconColor = pickNullish(la.notificationIconColor, config.notificationIconColor);
  const color = pickNullish(la.color, config.color);
  const backgroundColor = pickNullish(la.backgroundColor, config.backgroundColor);
  const textColor = pickNullish(la.textColor, config.textColor);
  const url = pickNullish(la.url, config.notificationUrl);

  const payloads = services.map((service) => {
    const inner = { tag, live_update: true };
    if (typeof progress === 'number') inner.progress = progress;
    if (typeof progressMax === 'number') inner.progress_max = progressMax;
    if (chronometer) {
      inner.chronometer = true;
      if (typeof when === 'number') inner.when = when;
      inner.when_relative = !!whenRelative;
    }
    if (notificationIcon) inner.notification_icon = notificationIcon;
    if (notificationIconColor) inner.notification_icon_color = notificationIconColor;
    if (color) inner.color = color;
    if (backgroundColor) inner.background_color = backgroundColor;
    if (textColor) inner.text_color = textColor;
    if (url) inner.url = url;

    return {
      service,
      tag,
      action: `notify.${service.deviceName}`,
      payload: { data: { title, message, data: inner } },
    };
  });

  return { error: null, payloads };
}

module.exports = { buildLiveActivityPayloads };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-live-activity.spec.js`
Expected: PASS — 9 passing

- [ ] **Step 5: Commit**

```bash
git add lib/build-live-activity.js test/unit/build-live-activity.spec.js
git commit -m "feat: add Live Activity payload builder"
```

---

## Task 19.4: Live Activity send-path branch [REV2 — NEW]

**[REV2]** When the node is in Live Activity mode (`config.liveActivity` true, or
`msg.liveActivity === true` on the incoming message), the send path builds live-activity
payloads instead of standard-notification payloads. Everything else about the send loop
(fan-out, stagger, tracking, error handling) is shared.

**Files:**
- Modify: `ha-ios-notification.js`
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Consumes: `buildLiveActivityPayloads` (Task 19.3).
- Produces: `handleSend` chooses the builder based on live-activity mode.

- [ ] **Step 1: Append the failing test**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('live activity send', () => {
  it('sends a live_update payload when the node is in Live Activity mode', function (done) {
    const calls = [];
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant({
      callService: async (domain, service, data) => { calls.push(data); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'laundry',
        liveActivity: true, progress: 40, progressMax: 100, actions: [], wires: [],
      },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        calls.should.have.length(1);
        calls[0].data.live_update.should.equal(true);
        calls[0].data.progress.should.equal(40);
        done();
      }, 30);
    });
  });

  it('sends a standard notification (no live_update) when not in Live Activity mode', function (done) {
    const calls = [];
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant({
      callService: async (domain, service, data) => { calls.push(data); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      { id: 'n1', type: 'ha-ios-notification', server: 'server1', services: [{ deviceName: 'my_iphone' }], title: 'Hi', actions: [], wires: [] },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        calls[0].data.should.not.have.property('live_update');
        done();
      }, 30);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — `live_update` is never set; the standard builder always runs.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

Add the require:

```js
const { buildLiveActivityPayloads } = require('./lib/build-live-activity');
```

At the top of `handleSend`, choose the builder based on mode (msg override wins over
config):

```js
    const liveMode = msg.liveActivity !== undefined ? !!msg.liveActivity : node.nodeConfig.liveActivity;
    const { error, payloads } = liveMode
      ? buildLiveActivityPayloads(node.nodeConfig, msg.notificationOverride)
      : buildNotificationPayloads(node.nodeConfig, msg.notificationOverride);
```

(Replace the existing single `buildNotificationPayloads(...)` destructuring at the top of
`handleSend` with this conditional.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 25 passing

- [ ] **Step 5: Commit**

```bash
git add ha-ios-notification.js test/integration/ha-ios-notification.spec.js
git commit -m "feat: Live Activity send-path branch"
```

---

## Task 19.5: Two-instance isolation test [REV2 — NEW, REQUIRED]

**[REV2]** The rewrite's central promise is that per-instance `node.context()` tracking
never collides across multiple node instances in one flow (v2's global flow-context did).
Rev-1 never tested this. This task adds the missing proof.

**Files:**
- Modify: `test/integration/ha-ios-notification.spec.js`

**Interfaces:**
- Consumes: two `ha-ios-notification` instances loaded in one test flow.

- [ ] **Step 1: Append the failing/verifying test**

```js
// append to test/integration/ha-ios-notification.spec.js

describe('multi-instance isolation', () => {
  it('two node instances with the SAME tag do not react to each other\'s actions', function (done) {
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      // both instances use the same tag + same device, but only n1 actually sent.
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'shared',
        actions: [{ title: 'Open' }], wires: [['h1']],
      },
      {
        id: 'n2', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }], tag: 'shared',
        actions: [{ title: 'Open' }], wires: [['h2']],
      },
      { id: 'h1', type: 'helper' },
      { id: 'h2', type: 'helper' },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      const h1 = helper.getNode('h1');
      const h2 = helper.getNode('h2');

      // Only n1 sends — so only n1's context should own the SHARED tag.
      n1.receive({ payload: {} });

      setTimeout(() => {
        let h1Got = false;
        let h2Got = false;
        h1.on('input', () => { h1Got = true; });
        h2.on('input', () => { h2Got = true; });

        // Both instances receive the same global action event (both are subscribed),
        // but only n1 has a matching sentMessages entry, so only h1 should fire.
        mock.emitFakeActionEvent({
          event: { action: '1', action_data: { tag: 'SHARED', deviceName: 'my_iphone', allServices: [{ deviceName: 'my_iphone' }] } },
          context: { user_id: 'u' },
        });

        setTimeout(() => {
          h1Got.should.equal(true);
          h2Got.should.equal(false); // n2 never sent -> must not react
          done();
        }, 40);
      }, 30);
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 26 passing. (If it FAILS with `h2Got === true`, the tracking store is
leaking across instances — a Task 4 / Task 13 regression — fix before proceeding.)

- [ ] **Step 3: Commit**

```bash
git add test/integration/ha-ios-notification.spec.js
git commit -m "test: verify per-instance tracking isolation across two node instances"
```

---

## Task 20: Full test suite and lint pass

**Files:**
- No new files — verification-only task.

**Interfaces:**
- Consumes: everything from Tasks 1–19.5.
- Produces: a green `npm test` and clean `npm run lint`, confirming the whole runtime + lib layer is internally consistent before editor UI work begins.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all unit + integration tests pass. **[REV2] Target totals:** unit ≈ 84
(sanitize-tag 7, action-list 13, message-store 8, build-payload 39, build-clear-payload
8, build-live-activity 9); integration = 26. Grand total ≈ 110. Reconcile the exact
count against what actually accumulated and fix any test that regressed from a later
task's refactor. **[REV2] Timing note:** the two `staggerMs` timing tests (Task 18) use
generous margins by design; all other integration tests assert on delivered messages via
the `helper` nodes, not on timers. If any non-timing test proves flaky under CI load,
convert its `setTimeout(..., 20)` wait into an `on('input')`/`done()` completion hook
rather than lengthening the timeout.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: no errors. If ESLint flags unused variables from intermediate refactors (e.g. `pick`/`firstDefined` exported but only used internally), either use them or remove the unused export.

- [ ] **Step 3: Fix anything the previous two steps surfaced, then commit**

```bash
git add -A
git commit -m "chore: fix lint/test issues found in full-suite pass" --allow-empty
```

(Use `--allow-empty` only if steps 1–2 were already clean and there's nothing to commit — otherwise omit it and commit the real fixes.)

---

## Task 21: Editor UI — Basics and Targets sections, notify-target picker endpoint

**Files:**
- Modify: `ha-ios-notification.js` (add admin HTTP endpoint)
- Modify: `ha-ios-notification.html` (replace minimal skeleton with real form)

**Interfaces:**
- Produces: `GET /ha-ios-notification/notify-targets?server=<id>` admin endpoint returning `{"targets": ["my_iphone", "my_ipad"]}`, consumed by the editor's Targets picker widget.

- [ ] **Step 1: Add the admin endpoint to `ha-ios-notification.js`**

Add near the top of the `module.exports = function (RED) { ... }` body (after the `normalizeNodeConfig` function, before `HaIosNotificationNode`):

```js
  RED.httpAdmin.get('/ha-ios-notification/notify-targets', RED.auth.needsPermission('flows.write'), function (req, res) {
    const serverNode = RED.nodes.getNode(req.query.server);
    if (!serverNode) {
      res.json({ targets: [] });
      return;
    }
    try {
      const homeAssistant = haClient.connect(serverNode);
      res.json({ targets: haClient.getNotifyTargets(homeAssistant) });
    } catch (err) {
      res.json({ targets: [] });
    }
  });
```

- [ ] **Step 2: Verify the endpoint is reachable (manual check against a running dev instance)**

This step is a manual smoke test, not automated — it requires a real Node-RED runtime with the palette loaded, which is exactly what Task 27's `npm link` dev workflow sets up. Note it here for now; run it for real once Task 27 is done:

```
curl "http://localhost:1880/ha-ios-notification/notify-targets?server=<real-server-config-id>"
```
Expected once run: `{"targets": ["my_iphone", "my_ipad", ...]}` matching Steve's real configured `notify.mobile_app_*` services.

- [ ] **Step 3: Replace `ha-ios-notification.html` with the full Basics + Targets editor UI**

```html
<!-- ha-ios-notification.html -->
<script type="text/javascript">
  RED.nodes.registerType('ha-ios-notification', {
    category: 'home_assistant',
    color: '#C7E9C0',
    defaults: {
      name: { value: '' },
      server: { value: '', type: 'server', required: true },
      tag: { value: '' },
      services: { value: [] },
      group: { value: '' },
      title: { value: '' },
      subtitle: { value: '' },
      message: { value: '' },
      notificationUrl: { value: '' },
      cameraEntity: { value: '' },
      customSoundPreInstalled: { value: 'default' },
      customSound: { value: '' },
      interruptionLevel: { value: 'active' },
      userInfo: { value: false },
      isClearNotificationsOnAction: { value: false },
      actions: { value: [] },
      firstLatitude: { value: '' },
      firstLongitude: { value: '' },
      secondLatitude: { value: '' },
      secondLongitude: { value: '' },
      showLineBetweenPoints: { value: false },
      showCompass: { value: false },
      showPointsOfInterest: { value: false },
      showScale: { value: false },
      showTraffic: { value: false },
      showUserLocation: { value: false },
      contentUrl: { value: '' },
      imagePath: { value: '' },
      videoPath: { value: '' },
      audioPath: { value: '' },
      lazyLoading: { value: false },
      hideThumbnail: { value: false },
      staggerMs: { value: 0 },
      debugMode: { value: false },
    },
    inputs: 1,
    outputs: 0,
    icon: 'font-awesome/fa-mobile-phone',
    paletteLabel: 'HA iOS Notification',
    label: function () {
      return this.name || 'HA iOS Notification';
    },
    oneditprepare: function () {
      const node = this;
      const $targetsList = $('#node-input-services-container').editableList({
        addItem: function (container, index, data) {
          const row = $('<div style="display:flex; align-items:center;">').appendTo(container);
          const checkbox = $('<input type="checkbox" style="margin-right:8px;">').appendTo(row);
          const label = $('<span>').text(data.deviceName || '').appendTo(row);
          checkbox.data('deviceName', data.deviceName);
          if (data.selected) checkbox.prop('checked', true);
        },
        sortable: false,
        removable: false,
      });

      function loadTargets() {
        const serverId = $('#node-input-server').val();
        if (!serverId) return;
        $.getJSON('ha-ios-notification/notify-targets', { server: serverId }, function (result) {
          $targetsList.editableList('empty');
          const selected = (node.services || []).map((s) => s.deviceName);
          (result.targets || []).forEach((deviceName) => {
            $targetsList.editableList('addItem', { deviceName, selected: selected.includes(deviceName) });
          });
        });
      }

      $('#node-input-server').on('change', loadTargets);
      setTimeout(loadTargets, 100); // wait for the server typedInput to initialize
    },
    oneditsave: function () {
      const services = [];
      $('#node-input-services-container').editableList('items').each(function () {
        const checkbox = $(this).find('input[type=checkbox]');
        if (checkbox.prop('checked')) {
          services.push({ deviceName: checkbox.data('deviceName') });
        }
      });
      this.services = services;
      this.outputs = (this.actions || []).length;
    },
  });
</script>

<script type="text/html" data-template-name="ha-ios-notification">
  <div class="form-row">
    <label for="node-input-name"><i class="fa fa-tag"></i> Name</label>
    <input type="text" id="node-input-name" placeholder="Name">
  </div>
  <div class="form-row">
    <label for="node-input-server"><i class="fa fa-server"></i> HA Server</label>
    <input type="text" id="node-input-server">
  </div>

  <h4>Basics</h4>
  <div class="form-row">
    <label for="node-input-title">Title</label>
    <input type="text" id="node-input-title">
  </div>
  <div class="form-row">
    <label for="node-input-subtitle">Subtitle</label>
    <input type="text" id="node-input-subtitle">
  </div>
  <div class="form-row">
    <label for="node-input-message">Message</label>
    <input type="text" id="node-input-message">
  </div>
  <div class="form-row">
    <label for="node-input-group">Group</label>
    <input type="text" id="node-input-group">
  </div>
  <div class="form-row">
    <label for="node-input-tag">Tag (optional)</label>
    <input type="text" id="node-input-tag">
  </div>
  <div class="form-row">
    <label for="node-input-notificationUrl">Notification URL (optional)</label>
    <input type="text" id="node-input-notificationUrl">
  </div>

  <h4>Targets</h4>
  <div class="form-row">
    <label>Notify Devices</label>
    <ol id="node-input-services-container"></ol>
  </div>

  <!-- Actions / Camera / Map / Media / Advanced sections added in Tasks 22-24 -->
</script>

<script type="text/html" data-help-name="ha-ios-notification">
  <p>Sends actionable iOS notifications via the Home Assistant Companion App, and routes tapped actions back to per-action outputs. Full reference in the README.</p>
</script>
```

- [ ] **Step 4: Commit**

```bash
git add ha-ios-notification.js ha-ios-notification.html
git commit -m "feat: editor UI basics/targets sections and notify-target picker endpoint"
```

---

## Task 22: Editor UI — Camera entity picker

**Files:**
- Modify: `ha-ios-notification.js` (add admin HTTP endpoint)
- Modify: `ha-ios-notification.html`

**Interfaces:**
- Produces: `GET /ha-ios-notification/camera-entities?server=<id>` admin endpoint, consumed by a `typedInput`-style dropdown for `cameraEntity`.

- [ ] **Step 1: Add the admin endpoint to `ha-ios-notification.js`**, next to the notify-targets endpoint:

```js
  RED.httpAdmin.get('/ha-ios-notification/camera-entities', RED.auth.needsPermission('flows.write'), function (req, res) {
    const serverNode = RED.nodes.getNode(req.query.server);
    if (!serverNode) {
      res.json({ entities: [] });
      return;
    }
    try {
      const homeAssistant = haClient.connect(serverNode);
      res.json({ entities: haClient.getCameraEntities(homeAssistant) });
    } catch (err) {
      res.json({ entities: [] });
    }
  });
```

- [ ] **Step 2: Add the Camera Entity field to the template, in the Targets section of `ha-ios-notification.html`**

After the `services-container` `<ol>`, add:

```html
  <div class="form-row">
    <label for="node-input-cameraEntity">Camera Entity (optional)</label>
    <input type="text" id="node-input-cameraEntity" list="node-input-cameraEntity-list" placeholder="camera.front_door">
    <datalist id="node-input-cameraEntity-list"></datalist>
  </div>
```

- [ ] **Step 3: Populate the datalist in `oneditprepare`**, add alongside `loadTargets`:

```js
      function loadCameraEntities() {
        const serverId = $('#node-input-server').val();
        if (!serverId) return;
        $.getJSON('ha-ios-notification/camera-entities', { server: serverId }, function (result) {
          const $list = $('#node-input-cameraEntity-list').empty();
          (result.entities || []).forEach((id) => $list.append(`<option value="${id}">`));
        });
      }
      $('#node-input-server').on('change', loadCameraEntities);
      setTimeout(loadCameraEntities, 100);
```

Falls back to free-text entry automatically — a `<datalist>`-backed `<input>` always accepts arbitrary typed text, so no HA server connection at editor-open time just means an empty suggestion list, not a blocked field.

- [ ] **Step 4: Commit**

```bash
git add ha-ios-notification.js ha-ios-notification.html
git commit -m "feat: add camera entity picker"
```

---

## Task 23: Editor UI — Actions dynamic list

**Files:**
- Modify: `ha-ios-notification.html`

**Interfaces:**
- Produces: an editable list UI for `node.actions`, each row backed by the fields `lib/action-list.js`'s `normalizeActions` expects (`title`, `id`, `activationMode`, `uri`, `textInputButtonTitle`, `textInputPlaceholder`, `authenticationRequired`, `destructive`, `behavior`, `icon`).

- [ ] **Step 1: Add the Actions section to the template**, after the Targets section:

```html
  <h4>Actions</h4>
  <div class="form-row">
    <label>Actionable Buttons</label>
    <ol id="node-input-actions-container"></ol>
  </div>
```

- [ ] **Step 2: Wire the editable list in `oneditprepare`**, add alongside the existing list setup:

```js
      const $actionsList = $('#node-input-actions-container').editableList({
        addItem: function (container, index, data) {
          container.css({ overflow: 'hidden' });
          const row1 = $('<div style="display:flex; gap:8px; margin-bottom:4px;">').appendTo(container);
          $('<input type="text" placeholder="Title" style="flex:2;">').val(data.title || '').appendTo(row1).addClass('action-title');
          $('<input type="text" placeholder="id (optional)" style="flex:1;">').val(data.id || '').appendTo(row1).addClass('action-id');

          const row2 = $('<div style="display:flex; gap:8px; margin-bottom:4px;">').appendTo(container);
          const modeSelect = $('<select class="action-activationMode" style="flex:1;">').appendTo(row2);
          ['foreground', 'background'].forEach((m) => modeSelect.append(`<option value="${m}">${m}</option>`));
          modeSelect.val(data.activationMode || 'foreground');
          $('<input type="text" placeholder="URI (optional)" style="flex:2;">').val(data.uri || '').appendTo(row2).addClass('action-uri');

          const row3 = $('<div style="display:flex; gap:12px;">').appendTo(container);
          const destructive = $('<label style="font-weight:normal;"><input type="checkbox" class="action-destructive"> Destructive</label>').appendTo(row3);
          if (data.destructive) destructive.find('input').prop('checked', true);
          const authRequired = $('<label style="font-weight:normal;"><input type="checkbox" class="action-authenticationRequired"> Requires auth</label>').appendTo(row3);
          if (data.authenticationRequired) authRequired.find('input').prop('checked', true);
        },
        sortable: true,
        removable: true,
      });
      (node.actions || []).forEach((a) => $actionsList.editableList('addItem', a));
```

- [ ] **Step 3: Read the actions list back out in `oneditsave`**, replace the existing `oneditsave` body with:

```js
    oneditsave: function () {
      const services = [];
      $('#node-input-services-container').editableList('items').each(function () {
        const checkbox = $(this).find('input[type=checkbox]');
        if (checkbox.prop('checked')) {
          services.push({ deviceName: checkbox.data('deviceName') });
        }
      });
      this.services = services;

      const actions = [];
      $('#node-input-actions-container').editableList('items').each(function () {
        const title = $(this).find('.action-title').val();
        if (!title) return;
        const action = { title };
        const id = $(this).find('.action-id').val();
        if (id) action.id = id;
        action.activationMode = $(this).find('.action-activationMode').val();
        const uri = $(this).find('.action-uri').val();
        if (uri) action.uri = uri;
        action.destructive = $(this).find('.action-destructive').prop('checked');
        action.authenticationRequired = $(this).find('.action-authenticationRequired').prop('checked');
        actions.push(action);
      });
      this.actions = actions;
      this.outputs = actions.length;
    },
```

- [ ] **Step 4: Commit**

```bash
git add ha-ios-notification.html
git commit -m "feat: add dynamic actions editor list"
```

---

## Task 24: Editor UI — Map, Media, Advanced sections and help text

**Files:**
- Modify: `ha-ios-notification.html`

**Interfaces:**
- Produces: the remaining config fields (map, media, sound, interruption level, user info, clear-on-action, stagger, debug) exposed in the editor, and a complete in-editor help/reference block.

- [ ] **Step 1: Add the Map, Media, and Advanced sections to the template**, after the Actions section:

```html
  <h4>Map</h4>
  <div class="form-row">
    <label for="node-input-firstLatitude">Latitude / Longitude (Pin 1)</label>
    <input type="text" id="node-input-firstLatitude" style="width:45%" placeholder="lat">
    <input type="text" id="node-input-firstLongitude" style="width:45%" placeholder="long">
  </div>
  <div class="form-row">
    <label for="node-input-secondLatitude">Latitude / Longitude (Pin 2)</label>
    <input type="text" id="node-input-secondLatitude" style="width:45%" placeholder="lat">
    <input type="text" id="node-input-secondLongitude" style="width:45%" placeholder="long">
  </div>
  <div class="form-row">
    <input type="checkbox" id="node-input-showLineBetweenPoints" style="width:auto">
    <label for="node-input-showLineBetweenPoints" style="width:auto">Line between points</label>
    <input type="checkbox" id="node-input-showCompass" style="width:auto; margin-left:12px;">
    <label for="node-input-showCompass" style="width:auto">Compass</label>
  </div>
  <div class="form-row">
    <input type="checkbox" id="node-input-showPointsOfInterest" style="width:auto">
    <label for="node-input-showPointsOfInterest" style="width:auto">Points of interest</label>
    <input type="checkbox" id="node-input-showScale" style="width:auto; margin-left:12px;">
    <label for="node-input-showScale" style="width:auto">Scale</label>
  </div>
  <div class="form-row">
    <input type="checkbox" id="node-input-showTraffic" style="width:auto">
    <label for="node-input-showTraffic" style="width:auto">Traffic</label>
    <input type="checkbox" id="node-input-showUserLocation" style="width:auto; margin-left:12px;">
    <label for="node-input-showUserLocation" style="width:auto">User location</label>
  </div>

  <h4>Media</h4>
  <div class="form-row">
    <label for="node-input-imagePath">Image Path (10MB limit)</label>
    <input type="text" id="node-input-imagePath">
  </div>
  <div class="form-row">
    <label for="node-input-videoPath">Video Path (50MB limit)</label>
    <input type="text" id="node-input-videoPath">
  </div>
  <div class="form-row">
    <label for="node-input-audioPath">Audio Path (5MB limit)</label>
    <input type="text" id="node-input-audioPath">
  </div>
  <div class="form-row">
    <label for="node-input-contentUrl">Content URL (overrides image/video/audio)</label>
    <input type="text" id="node-input-contentUrl">
  </div>
  <div class="form-row">
    <input type="checkbox" id="node-input-lazyLoading" style="width:auto">
    <label for="node-input-lazyLoading" style="width:auto">Load media lazily</label>
    <input type="checkbox" id="node-input-hideThumbnail" style="width:auto; margin-left:12px;">
    <label for="node-input-hideThumbnail" style="width:auto">Hide thumbnail</label>
  </div>

  <h4>Advanced</h4>
  <div class="form-row">
    <label for="node-input-customSoundPreInstalled">Sound (bundled)</label>
    <select id="node-input-customSoundPreInstalled">
      <option value="default">default</option>
      <option value="none">No Sound</option>
    </select>
  </div>
  <div class="form-row">
    <label for="node-input-customSound">Custom Sound (uploaded, overrides bundled)</label>
    <input type="text" id="node-input-customSound" placeholder="my_upload.wav">
  </div>
  <div class="form-row">
    <label for="node-input-interruptionLevel">Interruption Level</label>
    <select id="node-input-interruptionLevel">
      <option value="passive">Passive (iOS 15+)</option>
      <option value="active">Active (Default)</option>
      <option value="time-sensitive">Time Sensitive (iOS 15+)</option>
      <option value="critical">Critical</option>
    </select>
  </div>
  <div class="form-row">
    <input type="checkbox" id="node-input-userInfo" style="width:auto">
    <label for="node-input-userInfo" style="width:auto">Populate user information</label>
  </div>
  <div class="form-row">
    <input type="checkbox" id="node-input-isClearNotificationsOnAction" style="width:auto">
    <label for="node-input-isClearNotificationsOnAction" style="width:auto">Clear on other devices when actioned</label>
  </div>
  <div class="form-row">
    <label for="node-input-staggerMs">Stagger between sends (ms, 0 = disabled)</label>
    <input type="number" id="node-input-staggerMs" min="0" step="100">
  </div>
  <div class="form-row">
    <input type="checkbox" id="node-input-debugMode" style="width:auto">
    <label for="node-input-debugMode" style="width:auto">Debug mode</label>
  </div>
```

- [ ] **Step 2: Note on the bundled sound dropdown** — the two placeholder options (`default`, `none`) in Step 1 are intentionally minimal here; replace `<option>` list with the full verified-current HA iOS Companion App bundled sound catalog in Task 26 alongside the README rewrite, where the verification-against-current-docs step (per the design spec's decision on this field) naturally belongs.

- [ ] **Step 3: Replace the help text block with a fuller reference**

```html
<script type="text/html" data-help-name="ha-ios-notification">
  <p>Sends actionable iOS notifications through the Home Assistant iOS Companion App, and routes any tapped action back to the output matching that action.</p>

  <h3>Inputs</h3>
  <dl class="message-properties">
    <dt>payload <span class="property-type">object</span></dt>
    <dd>Triggers a send using this node's configured Basics/Targets/Actions/Map/Media fields.</dd>
    <dt class="optional">notificationOverride <span class="property-type">object</span></dt>
    <dd>Per-call override, three-tier precedence: per-service override &gt; this override &gt; node config default. Shape: <code>{services, tag, notificationBase, map, media, actions}</code>.</dd>
    <dt class="optional">clear <span class="property-type">boolean</span></dt>
    <dd>When true, sends a clear-notification instead of a send, using the configured/overridden tag and services.</dd>
  </dl>

  <h3>Outputs</h3>
  <p>One output per configured action, in editor order. Fires only when a received <code>ios.notification_action_fired</code> event's tag+device matches something this node instance itself sent.</p>

  <h3>Details</h3>
  <p>Full configuration reference and migration notes from the v2 subflow are in the <a href="https://github.com/sstratoti/actionable-notifications-subflow-for-ios#readme">README</a>.</p>
</script>
```

- [ ] **Step 4: Commit**

```bash
git add ha-ios-notification.html
git commit -m "feat: add map/media/advanced editor sections and help text"
```

---

## Task 24.5: Editor UI — REV2 fields (badge, presentation_options, tap-to-perform, Live Activity) [REV2 — NEW]

**[REV2]** Adds editor fields/sections for the capabilities added in Tasks 8.5, 19.2,
19.3/19.4. All the runtime already reads these config keys (Task 12 `normalizeNodeConfig`);
this task only surfaces them in the editor. Every `<datalist>`-backed input degrades to
free-text when HA is unreachable at edit time.

**Files:**
- Modify: `ha-ios-notification.html`

**Interfaces:**
- Consumes: admin endpoints `/ha-ios-notification/callable-services` and
  `/ha-ios-notification/entities` (Task 19.2).
- Produces: editor inputs writing config keys `badge`, `presentationOptions`,
  per-action `targetService`/`targetEntityId`/`targetData`, `liveActivity` + its fields.

- [ ] **Step 1: Add the new `defaults` entries**

In the `RED.nodes.registerType('ha-ios-notification', { defaults: {...} })` object, add:

```js
      badge: { value: '' },
      presentationOptions: { value: [] },
      liveActivity: { value: false },
      progress: { value: '' },
      progressMax: { value: '' },
      chronometer: { value: false },
      when: { value: '' },
      whenRelative: { value: false },
      notificationIcon: { value: '' },
      notificationIconColor: { value: '' },
      color: { value: '' },
      backgroundColor: { value: '' },
      textColor: { value: '' },
```

- [ ] **Step 2: Add Badge + presentation_options to the Advanced template section**

```html
  <div class="form-row">
    <label for="node-input-badge">Badge count (optional)</label>
    <input type="number" id="node-input-badge" min="0" step="1">
  </div>
  <div class="form-row">
    <label>Foreground presentation</label>
    <label style="font-weight:normal"><input type="checkbox" class="presopt" value="alert"> Alert</label>
    <label style="font-weight:normal"><input type="checkbox" class="presopt" value="badge"> Badge</label>
    <label style="font-weight:normal"><input type="checkbox" class="presopt" value="sound"> Sound</label>
  </div>
```

In `oneditprepare`, check the boxes from the saved array; in `oneditsave`, collect them:

```js
      // oneditprepare
      (node.presentationOptions || []).forEach((v) => {
        $(`.presopt[value="${v}"]`).prop('checked', true);
      });
```
```js
      // oneditsave
      this.presentationOptions = $('.presopt:checked').map(function () { return this.value; }).get();
```

- [ ] **Step 3: Add per-action tap-to-perform fields to the Actions editable list (extends Task 23)**

In the Task 23 `addItem` callback, append a fourth row per action with a service picker
and an entity input:

```js
          const row4 = $('<div style="display:flex; gap:8px; margin-top:4px;">').appendTo(container);
          const svc = $('<input type="text" placeholder="Tap-to-perform service (optional, e.g. lock.unlock)" style="flex:2;" list="ha-ios-services">')
            .val(data.targetService || '').appendTo(row4).addClass('action-targetService');
          $('<input type="text" placeholder="Target entity (optional)" style="flex:2;" list="ha-ios-entities">')
            .val(data.targetEntityId || '').appendTo(row4).addClass('action-targetEntityId');
```

Add two shared `<datalist>`s once in the template (outside the list), and populate them
in `oneditprepare` from the endpoints:

```html
  <datalist id="ha-ios-services"></datalist>
  <datalist id="ha-ios-entities"></datalist>
```
```js
      function loadServiceAndEntityLists() {
        const serverId = $('#node-input-server').val();
        if (!serverId) return;
        $.getJSON('ha-ios-notification/callable-services', { server: serverId }, function (r) {
          const $l = $('#ha-ios-services').empty();
          (r.services || []).forEach((s) => $l.append(`<option value="${s}">`));
        });
        $.getJSON('ha-ios-notification/entities', { server: serverId }, function (r) {
          const $l = $('#ha-ios-entities').empty();
          (r.entities || []).forEach((e) => $l.append(`<option value="${e}">`));
        });
      }
      $('#node-input-server').on('change', loadServiceAndEntityLists);
      setTimeout(loadServiceAndEntityLists, 100);
```

In the Task 23 `oneditsave` action collector, also read the tap-to-perform fields:

```js
        const targetService = $(this).find('.action-targetService').val();
        if (targetService) action.targetService = targetService;
        const targetEntityId = $(this).find('.action-targetEntityId').val();
        if (targetEntityId) action.targetEntityId = targetEntityId;
```

- [ ] **Step 4: Add a Live Activity template section**

```html
  <h4>Live Activity (iOS 17.2+, HA Core 2026.7+)</h4>
  <div class="form-row">
    <input type="checkbox" id="node-input-liveActivity" style="width:auto">
    <label for="node-input-liveActivity" style="width:auto">Send as a Live Activity (live_update)</label>
  </div>
  <div class="form-row">
    <label for="node-input-progress">Progress / Max</label>
    <input type="number" id="node-input-progress" style="width:45%" placeholder="progress">
    <input type="number" id="node-input-progressMax" style="width:45%" placeholder="max">
  </div>
  <div class="form-row">
    <input type="checkbox" id="node-input-chronometer" style="width:auto">
    <label for="node-input-chronometer" style="width:auto">Chronometer</label>
    <input type="number" id="node-input-when" placeholder="when (s)" style="width:30%; margin-left:8px;">
    <input type="checkbox" id="node-input-whenRelative" style="width:auto; margin-left:8px;">
    <label for="node-input-whenRelative" style="width:auto">relative</label>
  </div>
  <div class="form-row">
    <label for="node-input-notificationIcon">Icon / Icon color</label>
    <input type="text" id="node-input-notificationIcon" style="width:45%" placeholder="mdi:washing-machine">
    <input type="text" id="node-input-notificationIconColor" style="width:45%" placeholder="#2196F3">
  </div>
  <div class="form-row">
    <label for="node-input-color">Accent / BG / Text color</label>
    <input type="text" id="node-input-color" style="width:30%" placeholder="accent">
    <input type="text" id="node-input-backgroundColor" style="width:30%" placeholder="bg">
    <input type="text" id="node-input-textColor" style="width:30%" placeholder="text">
  </div>
```

(`badge`, `progress`, `progressMax`, `when` are numeric text inputs; `normalizeNodeConfig`
already coerces `''` → `undefined` and numeric strings → numbers, so no extra
`oneditsave` handling is needed for them beyond Node-RED's automatic binding.)

- [ ] **Step 5: Commit**

```bash
git add ha-ios-notification.html
git commit -m "feat: editor UI for badge, presentation_options, tap-to-perform, Live Activity"
```

---

## Task 25: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** none — verification-only automation.

- [ ] **Step 1: Create the workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test

  validate-manifest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.x
      - name: Validate package.json node-red manifest
        run: |
          node -e "
            const pkg = require('./package.json');
            if (!pkg['node-red'] || !pkg['node-red'].nodes) {
              console.error('Missing node-red.nodes manifest section');
              process.exit(1);
            }
            const fs = require('fs');
            for (const [name, file] of Object.entries(pkg['node-red'].nodes)) {
              if (!fs.existsSync(file)) {
                console.error('node-red.nodes[' + name + '] points at missing file: ' + file);
                process.exit(1);
              }
            }
            console.log('node-red manifest OK');
          "
```

- [ ] **Step 2: Verify locally that the same commands the workflow runs succeed**

```bash
npm ci
npm run lint
npm test
```

Expected: all three succeed (matches Task 20's verification, re-run here since `npm ci` uses the lockfile rather than `npm install`).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for tests, lint, and manifest validation"
```

---

## Task 26: README rewrite, CHANGELOG, and bundled sound list verification

**Files:**
- Modify: `README.md`
- Create: `CHANGELOG.md`
- Modify: `ha-ios-notification.html` (bundled sound `<option>` list)

**Interfaces:** none — documentation and one data-verification step.

- [ ] **Step 1: Verify the current HA iOS Companion App bundled sound catalog**

**[REV2] Confirmed:** these ARE the Companion App's bundled sounds (Morgan Freeman /
Alexa / Daisy voice packs, 140+ `.wav` files) — verified against
`https://companion.home-assistant.io/docs/notifications/notification-sounds`, which
lists them as pre-installed. The legacy subflow's `customSoundPreInstalled` dropdown
(in `legacy-subflow/...json`, the env var's `opts.opts` array) is a valid, shippable
baseline. Cross-reference against that live docs page for any sounds added since the
2025-02-07 capture, then finalize. Also document (in the README sound section): custom
uploaded sounds must be **32-bit float 48000 Hz `.wav`**, and users may additionally
reference imported iOS **system** sounds (`.caf`) — both are entered via the free-text
`customSound` override, not the dropdown.

- [ ] **Step 2: Replace the two-option placeholder in `ha-ios-notification.html`'s `customSoundPreInstalled` `<select>` with the verified full list**

Extract the verified list into the `<select>` as one `<option value="...">...</option>` per sound, keeping `default` and `none` (`No Sound`) as the first two options exactly as in the legacy subflow.

- [ ] **Step 3: Write `README.md`**

```markdown
# node-red-contrib-ha-ios-notification

Native Node-RED node for sending actionable iOS notifications through the Home
Assistant iOS Companion App, with entity/service pickers instead of hand-typed
HA identifiers. Successor to the `iOS Actionable Notification v2` subflow
(kept for reference in `legacy-subflow/`).

## Requirements

- Node-RED 3.x, Node.js >= 18
- [`node-red-contrib-home-assistant-websocket`](https://flows.nodered.org/node/node-red-contrib-home-assistant-websocket)
  >= 0.70.0, with a configured `server` connection to your Home Assistant instance
- Home Assistant iOS Companion App on each target device, with actionable
  notifications configured

## Install

```
npm install node-red-contrib-ha-ios-notification
```

Or via the Node-RED editor: Menu → Manage palette → Install → search
`ha-ios-notification`.

## Quick start

1. Drag the **HA iOS Notification** node onto the canvas, connect it to your
   HA server config.
2. In **Targets**, check the devices to notify (populated from your HA
   `notify.*` services — no manual typing).
3. Set **Title**/**Message** under Basics.
4. Wire an inject node into the input and deploy — a plain `msg.payload = {}`
   triggers a send using the node's configured fields.

## Sending with overrides

Send `msg.notificationOverride` to override any configured field per-call,
without redeploying the node:

```js
msg.notificationOverride = {
  notificationBase: { title: "Front Door", message: "Someone's here" },
  services: [{ deviceName: "my_iphone" }],
};
return msg;
```

Precedence: per-service override (inside a `services[].serviceOverride`) >
`msg.notificationOverride` > the node's configured defaults.

## Clearing notifications

- **Manually:** send `msg.clear = true` (optionally with
  `msg.notificationOverride.tag`/`services`) into the same input.
- **Automatically on action:** enable "Clear on other devices when actioned"
  in Advanced — when one device's action is tapped, the same tagged
  notification is cleared from every other configured device.

## Actionable buttons

Configure buttons under **Actions** — each gets its own output, in the order
shown in the editor. When a button is tapped, the matching output fires with
the raw HA event as `msg.payload` and (if the original send matched by tag +
device) the original sent message as `msg.matchedMessage`.

## Migrating from the v2 subflow

Config field names and `msg.notificationOverride` shape are unchanged from
the v2 subflow, with one adjustment: actions are now identified by a stable
`id` (defaults to `"1"`, `"2"`, `"3"`... in the order you define them in the
editor, matching the old `actionOutput` numbers if you migrate actions in the
same order) instead of an `actionOutput` number. To swap an existing subflow
instance:

1. Add this node to the flow, pointed at the same HA server.
2. Recreate the subflow instance's env values as this node's config fields
   (same names) — check the Targets/Camera Entity pickers instead of
   retyping the old JSON.
3. Recreate the old `actionNjson` blobs as entries in the Actions list.
4. Re-wire the outputs (order-preserving if actions were migrated in order).
5. Delete the old subflow instance.

No changes are needed to anything sending `msg.notificationOverride` into the
old subflow, unless it overrides `actions` by `actionOutput` number — update
those keys to match the new action `id`s.

### Behavior changes from v2 to note

- **Action event:** the node now listens for both `mobile_app_notification_action`
  (current) and the legacy `ios.notification_action_fired` — no action needed, but
  new setups are future-proof.
- **Media keys:** the override URL and lazy flag now emit under
  `data.attachment.url` / `data.attachment.lazy` (the documented structure) instead
  of v2's top-level `data.contentUrl` / `data.lazy`. If you built payloads by hand
  expecting the old keys, update them; via this node's config, it's automatic.
- **Send stagger** defaults to **1000 ms** between per-device sends (v2 effectively
  throttled ~5 s). Set "Stagger between sends" to `0` to disable, or raise it.
- **Auto-clear sequencing delay:** v2 waited ~10 s before routing an action when
  clear-on-action was set; this node routes immediately (no delay).

### New capabilities beyond v2

Badge (`push.badge`) + `clear_badge` command, `presentation_options`, tap-to-perform
action targets (call an HA service on tap), and **Live Activities** (`live_update`
mode) — see the in-editor help and the sections above.

## Configuration reference

See the in-editor help panel (info tab) for the full field-by-field
reference, or `docs/superpowers/specs/2026-07-16-native-node-design.md` for
the complete design rationale.

## Development

```
git clone https://github.com/sstratoti/actionable-notifications-subflow-for-ios
cd actionable-notifications-subflow-for-ios
npm install
npm test
```

See `CHANGELOG.md` for release history.

## License

MIT
```

- [ ] **Step 4: Write `CHANGELOG.md`**

```markdown
# Changelog

## 1.0.0 (unreleased)

Initial release of `node-red-contrib-ha-ios-notification`, replacing the
`iOS Actionable Notification v2` Node-RED subflow.

### Added
- Native Node-RED node (was a subflow) — installable via npm / palette manager.
- HA entity/service pickers for notify targets, camera entity, and
  tap-to-perform action targets — no more hand-typed HA identifiers.
- Dynamic action outputs (one per configured action, 0-10) replacing the
  fixed 10-output/10-JSON-field layout.
- Per-node-instance state (`node.context()`) replacing global flow-context
  tracking — safe with multiple node instances in one flow.
- Dual action-event support: `mobile_app_notification_action` (current) +
  legacy `ios.notification_action_fired`, normalized to `msg.actionId`.
- Badge control: `data.push.badge` field and the `clear_badge` command
  (`msg.clearBadge = true`).
- `presentation_options` (foreground alert/badge/sound control).
- Tap-to-perform: an action can call an HA service directly on tap
  (`targetService` / `targetEntityId` / `targetData`).
- Live Activities / Live Updates (`live_update` mode: progress, chronometer,
  colors) — start/update by sending, end via the clear path with the same tag.
- Configurable per-device send stagger (default 1000 ms), replacing v2's
  ad-hoc canvas delay nodes.
- `node.error()` on Home Assistant call failures (v2 failed silently), and
  per-send tracking persistence so a mid-fan-out failure can't drop a
  delivered device from state.
- Automated test suite (Mocha unit tests + node-red-node-test-helper
  integration tests), including a two-instance isolation test.

### Changed
- Action override keys (`msg.notificationOverride.actions`) are now keyed by
  a stable action `id` instead of a 1-10 `actionOutput` number.
- Media override URL / lazy flag emit under `data.attachment.*` (documented
  structure) instead of top-level `data.contentUrl` / `data.lazy`; `content-type`
  is newly exposed.
- Action overrides fully replace an action slot (a prop absent from the
  override is dropped), matching v2 exactly.
- Send stagger defaults to 1000 ms (v2 ≈ 5 s always-on); set `0` to disable.
- No pre-routing sequencing delay on auto-clear (v2 waited ~10 s).
- See the README's migration section for all behavior changes.

### Unchanged (compatible with v2)
- `msg.notificationOverride` three-tier override precedence, including
  explicit empty-string overrides (nullish semantics).
- `msg.clear = true` manual clear behavior.
- Auto-clear-on-action behavior.
- User-info enrichment on action received.
- Config field names for Basics/Map/Media/Advanced.
```

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md ha-ios-notification.html
git commit -m "docs: rewrite README, add CHANGELOG, verify bundled sound list"
```

---

## Task 27: Example flows and local dev workflow

**Files:**
- Create: `examples/send-basic.json`, `examples/send-with-actions.json`, `examples/manual-clear.json`, `examples/multi-device-fanout.json`
- Modify: `package.json` (add `node-red.examples` — actually the manifest key is `node-red.nodes`, and examples are auto-discovered from the `examples/` directory by Node-RED's runtime; no explicit manifest entry needed beyond the directory existing at the package root)

**Interfaces:** none — these are Node-RED flow JSON snippets, importable via the editor's Import menu or discoverable through the built-in Examples browser once the package is installed (Node-RED auto-scans each installed node package's `examples/` directory).

- [ ] **Step 1: Create `examples/send-basic.json`**

```json
[
  {
    "id": "example-send-basic-tab",
    "type": "tab",
    "label": "HA iOS Notification: Basic Send"
  },
  {
    "id": "example-inject",
    "type": "inject",
    "z": "example-send-basic-tab",
    "name": "send test notification",
    "props": [{ "p": "payload" }],
    "payload": "",
    "payloadType": "date",
    "x": 200,
    "y": 120,
    "wires": [["example-notify"]]
  },
  {
    "id": "example-notify",
    "type": "ha-ios-notification",
    "z": "example-send-basic-tab",
    "name": "Notify my_iphone",
    "server": "",
    "services": [{ "deviceName": "my_iphone" }],
    "title": "Test Notification",
    "message": "Hello from node-red-contrib-ha-ios-notification",
    "actions": [],
    "x": 430,
    "y": 120,
    "wires": []
  }
]
```

- [ ] **Step 2: Create `examples/send-with-actions.json`**

```json
[
  {
    "id": "example-actions-tab",
    "type": "tab",
    "label": "HA iOS Notification: Actionable Buttons"
  },
  {
    "id": "example-actions-inject",
    "type": "inject",
    "z": "example-actions-tab",
    "name": "send with actions",
    "props": [{ "p": "payload" }],
    "payload": "",
    "payloadType": "date",
    "x": 190,
    "y": 100,
    "wires": [["example-actions-notify"]]
  },
  {
    "id": "example-actions-notify",
    "type": "ha-ios-notification",
    "z": "example-actions-tab",
    "name": "Front Door Alert",
    "server": "",
    "services": [{ "deviceName": "my_iphone" }],
    "title": "Front Door",
    "message": "Someone is at the door",
    "actions": [
      { "id": "unlock", "title": "Unlock", "destructive": false },
      { "id": "ignore", "title": "Ignore", "destructive": true }
    ],
    "x": 420,
    "y": 100,
    "wires": [["example-unlock-debug"], ["example-ignore-debug"]]
  },
  {
    "id": "example-unlock-debug",
    "type": "debug",
    "z": "example-actions-tab",
    "name": "Unlock tapped",
    "active": true,
    "x": 650,
    "y": 80,
    "wires": []
  },
  {
    "id": "example-ignore-debug",
    "type": "debug",
    "z": "example-actions-tab",
    "name": "Ignore tapped",
    "active": true,
    "x": 650,
    "y": 140,
    "wires": []
  }
]
```

- [ ] **Step 3: Create `examples/manual-clear.json`**

```json
[
  {
    "id": "example-clear-tab",
    "type": "tab",
    "label": "HA iOS Notification: Manual Clear"
  },
  {
    "id": "example-clear-inject",
    "type": "inject",
    "z": "example-clear-tab",
    "name": "clear notification",
    "props": [{ "p": "clear", "v": "true", "vt": "bool" }],
    "x": 190,
    "y": 100,
    "wires": [["example-clear-notify"]]
  },
  {
    "id": "example-clear-notify",
    "type": "ha-ios-notification",
    "z": "example-clear-tab",
    "name": "Clear front-door tag",
    "server": "",
    "services": [{ "deviceName": "my_iphone" }],
    "tag": "front-door",
    "actions": [],
    "x": 420,
    "y": 100,
    "wires": []
  }
]
```

- [ ] **Step 4: Create `examples/multi-device-fanout.json`**

```json
[
  {
    "id": "example-fanout-tab",
    "type": "tab",
    "label": "HA iOS Notification: Multi-Device Fanout"
  },
  {
    "id": "example-fanout-inject",
    "type": "inject",
    "z": "example-fanout-tab",
    "name": "send to everyone",
    "props": [{ "p": "payload" }],
    "payload": "",
    "payloadType": "date",
    "x": 190,
    "y": 100,
    "wires": [["example-fanout-notify"]]
  },
  {
    "id": "example-fanout-notify",
    "type": "ha-ios-notification",
    "z": "example-fanout-tab",
    "name": "Notify household",
    "server": "",
    "services": [{ "deviceName": "my_iphone" }, { "deviceName": "my_ipad" }],
    "title": "Household Alert",
    "message": "This goes to every device",
    "staggerMs": 500,
    "actions": [],
    "x": 420,
    "y": 100,
    "wires": []
  }
]
```

- [ ] **Step 5: Verify Node-RED's examples auto-discovery expectation is met**

Run: `ls examples/*.json`
Expected: all four files listed. Node-RED's runtime scans each installed package's `examples/` directory automatically (no `package.json` manifest entry required) — this is confirmed Node-RED core behavior, not specific to this package.

- [ ] **Step 6: Commit**

```bash
git add examples
git commit -m "docs: add example flows for send, actions, clear, and fanout"
```

---

## Task 28: npm account, publish dry run, and GitHub release

**Files:** none — publishing operations.

**Interfaces:** none.

This task has manual, one-time account-setup steps only Steve can perform (2FA, email verification), interleaved with commands to run.

- [ ] **Step 1: Create an npm account (manual, if not already done)**

Visit https://www.npmjs.com/signup, create an account, verify the email address.

- [ ] **Step 2: Enable two-factor authentication (required for publishing since 2022)**

In npm account settings → Two-Factor Authentication → enable "Authorization and writes". Requires an authenticator app (not SMS).

- [ ] **Step 3: Log in from the CLI**

Run: `npm login`
Expected: prompts for username/password/email and a 2FA code (from the authenticator app), then confirms `Logged in as <username>`.

- [ ] **Step 4: Verify package name availability**

Run: `npm view node-red-contrib-ha-ios-notification`
Expected: `npm ERR! 404 Not Found` (confirms the name is unclaimed — if it unexpectedly returns package data, stop and pick a different name before proceeding).

- [ ] **Step 5: Dry-run the publish to inspect exactly what would be uploaded**

Run: `npm pack --dry-run`
Expected: a file listing showing `ha-ios-notification.js`, `ha-ios-notification.html`, `lib/`, `examples/`, `README.md`, `CHANGELOG.md`, `package.json` — and explicitly confirm `test/`, `.github/`, `legacy-subflow/`, `docs/` are **not** in the listing (add a `"files"` array to `package.json` if any of those leak in, listing only what should ship).

- [ ] **Step 6: If Step 5 showed unwanted files, add a `files` allowlist to `package.json` and re-run**

```json
  "files": [
    "ha-ios-notification.js",
    "ha-ios-notification.html",
    "lib/",
    "examples/",
    "README.md",
    "CHANGELOG.md"
  ]
```

Run: `npm pack --dry-run` again.
Expected: only the allowlisted paths appear.

- [ ] **Step 7: Set the CHANGELOG's version to a real release date and publish**

Edit `CHANGELOG.md`: change `## 1.0.0 (unreleased)` to `## 1.0.0 (YYYY-MM-DD)` with today's actual date.

Run:
```bash
git add CHANGELOG.md
git commit -m "chore: prepare 1.0.0 release"
npm publish
```
Expected: `+ node-red-contrib-ha-ios-notification@1.0.0`

- [ ] **Step 8: Verify the published package**

Run: `npm view node-red-contrib-ha-ios-notification`
Expected: shows version `1.0.0` and the correct `node-red` manifest section.

- [ ] **Step 9: Tag and push, then create the GitHub release**

```bash
git tag v1.0.0
git push origin master
git push origin v1.0.0
gh release create v1.0.0 --title "v1.0.0" --notes-file <(sed -n '/## 1.0.0/,/## /p' CHANGELOG.md | sed '$d')
```

- [ ] **Step 10: Confirm flows.nodered.org indexing (may take up to a few hours)**

Check https://flows.nodered.org/node/node-red-contrib-ha-ios-notification once available — the flow library indexes npm packages carrying the `node-red` keyword automatically; no separate submission is needed. If it hasn't appeared after 24 hours, check https://flows.nodered.org/add/node for manual-refresh guidance.

---

## Self-Review

**1. Spec coverage (incl. Revision 2):**
- Package layout, config schema, override compatibility → Tasks 1, 12.
- Retained behaviors 1–7 (manual clear, auto-clear, ownership matching, user-info,
  rate limiting, node.status, debugMode) → Tasks 14, 17, 15, 16, 18, `node.status()`
  throughout, 19.
- **[REV2] Override nullish semantics** (explicit `''` honored) → Task 5 (`pickNullish`),
  tested in Task 5.
- **[REV2] Action override full-replace** → Task 3, tested there and in Task 6.
- **[REV2] Auto-clear state cleanup** → Task 17.
- **[REV2] Send-path persistence** → Tasks 13 + 18.
- **[REV2] Dual action-event + normalization** → Tasks 11 + 15 (`normalizeActionId`),
  tested in Task 15 (modern + legacy).
- **[REV2] Media `data.attachment.*` placement + content-type** → Task 8.
- **[REV2] Badge + presentation_options** → Task 8.5 (builder) + 24.5 (editor);
  **clear_badge** → Task 19.1.
- **[REV2] Tap-to-perform** → Task 3 (props) + 19.2 (runtime + endpoints) + 24.5 (editor).
- **[REV2] Live Activities** → Task 19.3 (builder) + 19.4 (runtime) + 24.5 (editor).
- **[REV2] Two-instance isolation test (required)** → Task 19.5.
- **[REV2] Stagger default non-zero** → Tasks 12 + 18.
- Editor UI → Tasks 21–24 (base) + 24.5 (REV2 fields).
- Testing → Tasks 2–19.5 carry their own tests; Task 20 verifies the whole suite.
- Documentation (incl. REV2 migration notes) → Task 26.
- Publishing plan → Tasks 1 (restructure), 28 (account/publish/release).
- Out-of-scope (Android, auto-migration tooling, standalone HA client) — no task
  builds them.

**2. Placeholder scan:** No "TBD"/"TODO". Remaining flagged verification is one bounded
item — the modern `mobile_app_notification_action` payload field mapping (`action` vs
`actionName`), confirmed via docs but not a live event; the normalizer handles either
shape, and Task 27's npm-link smoke test closes it. The `send()` return-shape question
from Rev-1 is now resolved (bare array). The rate-limit-wiring question is resolved
(Task 18 reproduces send-path throttle, consciously drops the clear-path throttle and
the ~10 s sequencing delay with migration notes).

**3. Type consistency (re-verified after REV2 edits):**
- `buildNotificationPayloads(config, override)` — signature identical at its Task 5/6
  definition and its Task 13/19.4 call sites.
- `buildLiveActivityPayloads(config, override)` — same return shape (`{error, payloads}`)
  as `buildNotificationPayloads`, so Task 19.4's shared send loop consumes either.
- `pick` (|| semantics, sound only) vs `pickNullish` (?? semantics, everything else) —
  both defined and exported in `lib/build-payload.js`; `build-live-activity.js` defines
  its own local `pickNullish`.
- `action-list.js` exports `IOS_ACTION_PROPS` (emitted to iOS) and `TAP_TARGET_PROPS`
  (node-side only); Task 6 imports and emits only `IOS_ACTION_PROPS`, so tap-to-perform
  props never leak into the notification payload (tested in Task 6).
- `messageStore.{recordSent,findMatch,removeMatch}` — call sites in Tasks 13/14/15/17
  all match Task 4's signatures.
- `haClient.*` — every name used in Tasks 12–19.5, 21, 22, 19.2 matches Task 11's
  exports (`subscribeToActionEvents`, `callAction`, `getCallableServices`, `getEntities`,
  etc.); no renamed variants.
- `handleActionReceived` — Task 16 is the canonical rewrite (async, `actionId`,
  `msg.actionId`); Tasks 17, 19, 19.2 append/modify against that exact version (verified:
  the `outMsg` line they reference includes `actionId`).
- **Integration-test counts** are cumulative in one spec file; the per-task "N passing"
  values were re-tallied after REV2 additions (12→…→19 through Task 19; 21, 23, 25, 26
  through Tasks 19.1–19.5). Task 20 states the authoritative totals (≈84 unit, 26
  integration) and instructs reconciling against the live runner.
