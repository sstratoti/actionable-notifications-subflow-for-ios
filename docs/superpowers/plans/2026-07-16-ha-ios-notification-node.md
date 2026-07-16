# HA iOS Notification Native Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the `iOS Actionable Notification v2` Node-RED subflow into a publishable native node package, `node-red-contrib-ha-ios-notification`, with HA entity/service pickers, dynamic actionable-button outputs, per-instance state, a Mocha + node-red-node-test-helper test suite, docs, and a publish-ready package.

**Architecture:** A single self-contained Node-RED node (one input handling both send and manual-clear; dynamic outputs for received actions) built from small pure `lib/` modules (payload building, clear-payload building, action-list normalization, tag sanitization, message-store) wired together by the node runtime file. HA connectivity goes through `node-red-contrib-home-assistant-websocket`'s internal `getHomeAssistant()`/`HomeAssistant` client (verified against the installed v0.80.3 source — see Task 11), not a standalone HA client.

**Tech Stack:** Node.js (CommonJS), Mocha + should, node-red-node-test-helper, proxyquire, ESLint, GitHub Actions.

## Global Constraints

- Package name: `node-red-contrib-ha-ios-notification`. Node type (palette name): `ha-ios-notification`, label "HA iOS Notification".
- Depends on `node-red-contrib-home-assistant-websocket` as a `peerDependency` (range `>=0.70.0`, matching the installed `0.80.3` and the API surface verified in Task 11) — never bundled as a regular `dependency`.
- `msg.notificationOverride` 3-tier precedence (`serviceOverride` > global `override` > node config default) is preserved exactly, per the design spec's override-compatibility section. Tag never accepts a service-level override (matches v2).
- All dedup/tracking state lives in `node.context()`, keyed by this node instance only — never `flow.*` or `global.*`.
- iOS-only for v1 (`ios.notification_action_fired` event only).
- Node engines: `"node": ">=18"`.
- Test runner: Mocha + should for unit tests; `node-red-node-test-helper` + `proxyquire` for integration tests. No live HA connection in any test.
- Repo: `sstratoti/actionable-notifications-subflow-for-ios`, restructured in place. Local clone: `/home/steve/Documents/GitHub/actionable-notifications-subflow-for-ios`. All commands below assume this as the working directory unless stated otherwise.
- Design spec of record: `docs/superpowers/specs/2026-07-16-native-node-design.md` (already committed).

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

## Task 3: `lib/action-list.js` — action normalization and override merging

**Files:**
- Create: `lib/action-list.js`
- Test: `test/unit/action-list.spec.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `normalizeActions(rawActions): Array<{id, title, outputIndex, ...optionalProps}>`, `applyActionOverrides(normalizedActions, overridesById): Array<...>` — consumed by Task 6 (`lib/build-payload.js`) and Task 12 (node runtime, for output count).

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

const OPTIONAL_ACTION_PROPS = [
  'activationMode',
  'uri',
  'textInputButtonTitle',
  'textInputPlaceholder',
  'authenticationRequired',
  'destructive',
  'behavior',
  'icon',
];

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

      OPTIONAL_ACTION_PROPS.forEach((prop) => {
        if (action[prop] !== undefined) {
          normalized[prop] = action[prop];
        }
      });

      return normalized;
    })
    .filter(Boolean);
}

function applyActionOverrides(normalizedActions, overridesById) {
  if (!overridesById || typeof overridesById !== 'object') return normalizedActions;

  return normalizedActions.map((action) => {
    const override = overridesById[action.id];
    if (!override || typeof override !== 'object') return action;
    return { ...action, ...override, id: action.id, outputIndex: action.outputIndex };
  });
}

module.exports = { normalizeActions, applyActionOverrides, OPTIONAL_ACTION_PROPS };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/action-list.spec.js`
Expected: PASS — 10 passing

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

function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
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

  const tag = sanitizeTag(pick(safeOverride.tag, config.tag), config.title);

  const payloads = services.map((service) => {
    const serviceOverride = service.serviceOverride || {};
    const nb = serviceOverride.notificationBase || {};
    const ovNb = safeOverride.notificationBase || {};

    const title = pick(nb.title, ovNb.title, config.title) || '';
    const subtitle = pick(nb.subtitle, ovNb.subtitle, config.subtitle) || '';
    const message = pick(nb.message, ovNb.message, config.message) || '';
    const url = pick(nb.url, ovNb.url, config.notificationUrl);
    const cameraEntity = pick(nb.cameraEntity, ovNb.cameraEntity, config.cameraEntity);
    const interruptionLevel = pick(nb.interruptionLevel, ovNb.interruptionLevel, config.interruptionLevel) || 'active';
    const customSound =
      pick(nb.customSound, ovNb.customSound, config.customSound, config.customSoundPreInstalled) || 'default';
    const group = pick(nb.group, ovNb.group, config.group);

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

module.exports = { buildNotificationPayloads, pick, firstDefined };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: PASS — 12 passing

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
const { normalizeActions, applyActionOverrides } = require('./action-list');

function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function firstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

const ACTION_OUTPUT_PROPS = [
  'activationMode',
  'uri',
  'textInputButtonTitle',
  'textInputPlaceholder',
  'authenticationRequired',
  'destructive',
  'behavior',
  'icon',
];

function buildNotificationPayloads(config, override) {
  const safeOverride = override || {};
  const services =
    safeOverride.services && safeOverride.services.length > 0
      ? safeOverride.services
      : config.services || [];

  if (!services || services.length === 0) {
    return { error: 'no services defined', payloads: [] };
  }

  const tag = sanitizeTag(pick(safeOverride.tag, config.tag), config.title);
  const baseActions = normalizeActions(config.actions);

  const payloads = services.map((service) => {
    const serviceOverride = service.serviceOverride || {};
    const nb = serviceOverride.notificationBase || {};
    const ovNb = safeOverride.notificationBase || {};

    const title = pick(nb.title, ovNb.title, config.title) || '';
    const subtitle = pick(nb.subtitle, ovNb.subtitle, config.subtitle) || '';
    const message = pick(nb.message, ovNb.message, config.message) || '';
    const url = pick(nb.url, ovNb.url, config.notificationUrl);
    const cameraEntity = pick(nb.cameraEntity, ovNb.cameraEntity, config.cameraEntity);
    const interruptionLevel = pick(nb.interruptionLevel, ovNb.interruptionLevel, config.interruptionLevel) || 'active';
    const customSound =
      pick(nb.customSound, ovNb.customSound, config.customSound, config.customSoundPreInstalled) || 'default';
    const group = pick(nb.group, ovNb.group, config.group);
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
    const finalActions = applyActionOverrides(baseActions, actionOverridesById).map((a) => {
      const actionObj = { action: a.id, title: a.title };
      ACTION_OUTPUT_PROPS.forEach((prop) => {
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

module.exports = { buildNotificationPayloads, pick, firstDefined };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: PASS — 19 passing

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
    const firstLatitude = pick(mp.firstLatitude, ovMp.firstLatitude, config.firstLatitude);
    const firstLongitude = pick(mp.firstLongitude, ovMp.firstLongitude, config.firstLongitude);
    const secondLatitude = pick(mp.secondLatitude, ovMp.secondLatitude, config.secondLatitude);
    const secondLongitude = pick(mp.secondLongitude, ovMp.secondLongitude, config.secondLongitude);
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
Expected: PASS — 24 passing

- [ ] **Step 5: Commit**

```bash
git add lib/build-payload.js test/unit/build-payload.spec.js
git commit -m "feat: add map fields to notification payload builder"
```

---

## Task 8: `lib/build-payload.js` — media fields

**Files:**
- Modify: `lib/build-payload.js`
- Modify: `test/unit/build-payload.spec.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `payload.data.data.{contentUrl,image,video,audio,lazy,attachment}` when any media field is present. This completes `lib/build-payload.js` — no further tasks modify this file.

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
    d.should.not.have.property('contentUrl');
  });

  it('adds the image path when set', () => {
    const config = baseConfig({ imagePath: '/local/camera.jpg' });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.image.should.equal('/local/camera.jpg');
  });

  it('adds contentUrl, video, and audio when set', () => {
    const config = baseConfig({ contentUrl: 'https://x/y.mp4', videoPath: '/v.mp4', audioPath: '/a.mp3' });
    const { payloads } = buildNotificationPayloads(config, {});
    const d = payloads[0].payload.data.data;
    d.contentUrl.should.equal('https://x/y.mp4');
    d.video.should.equal('/v.mp4');
    d.audio.should.equal('/a.mp3');
  });

  it('sets lazy and attachment.hide-thumbnail from lazyLoading/hideThumbnail', () => {
    const config = baseConfig({ imagePath: '/x.jpg', lazyLoading: true, hideThumbnail: true });
    const { payloads } = buildNotificationPayloads(config, {});
    const d = payloads[0].payload.data.data;
    d.lazy.should.equal(true);
    d.attachment.should.eql({ 'hide-thumbnail': true });
  });

  it('omits attachment when hideThumbnail is false', () => {
    const config = baseConfig({ imagePath: '/x.jpg', hideThumbnail: false });
    const { payloads } = buildNotificationPayloads(config, {});
    payloads[0].payload.data.data.attachment.should.equal(undefined);
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
    const contentUrl = pick(md.contentUrl, ovMd.contentUrl, config.contentUrl);
    const imagePath = pick(md.imagePath, ovMd.imagePath, config.imagePath);
    const videoPath = pick(md.videoPath, ovMd.videoPath, config.videoPath);
    const audioPath = pick(md.audioPath, ovMd.audioPath, config.audioPath);
    const lazyLoading = firstDefined(md.lazyLoading, ovMd.lazyLoading, config.lazyLoading, false);
    const hideThumbnail = firstDefined(md.hideThumbnail, ovMd.hideThumbnail, config.hideThumbnail, false);
```

Then, after the map-fields `if (firstLatitude && firstLongitude) { ... }` block (from Task 7), add:

```js
    if (contentUrl || imagePath || videoPath || audioPath) {
      Object.assign(data, {
        contentUrl: contentUrl || undefined,
        image: imagePath || undefined,
        video: videoPath || undefined,
        audio: audioPath || undefined,
        lazy: lazyLoading || undefined,
        attachment: hideThumbnail ? { 'hide-thumbnail': hideThumbnail } : undefined,
      });
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/unit/build-payload.spec.js`
Expected: PASS — 29 passing

- [ ] **Step 5: Commit**

```bash
git add lib/build-payload.js test/unit/build-payload.spec.js
git commit -m "feat: add media fields to notification payload builder"
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
- Produces: `connect(serverConfigNode)`, `subscribeToActionEvents(homeAssistant, subscriberId, handler)`, `unsubscribeFromActionEvents(homeAssistant, subscriberId, handler)`, `sendNotification(homeAssistant, deviceName, serviceData)`, `fetchUsers(homeAssistant)`, `getNotifyTargets(homeAssistant)`, `getCameraEntities(homeAssistant)`, `ACTION_EVENT_TYPE`, `ACTION_EVENT_BUS_NAME` — consumed by Task 12 (node registration) and Tasks 13–17 (all runtime behaviors), and by Task 21/22 (picker admin endpoints).

Not unit-tested directly (it's a thin wrapper over a live external client with no pure logic of its own) — exercised by the integration tests in Tasks 12–17 via a `proxyquire`-injected fake.

**Verified facts this task's code depends on (do not re-derive — confirmed by reading the installed package source):**
- `getHomeAssistant(serverConfigNode)` — exported from `dist/homeAssistant/index.js`, returns/creates a cached `HomeAssistant` client keyed by the server config node's `id`.
- The client exposes: `eventsList` (a plain object, `{[subscriberId]: eventType}`, driving what the underlying websocket subscribes to), `isConnected` (getter), `subscribeEvents()` (re-subscribes over websocket using the current `eventsList`), `addListener(name, handler, {once})` / `removeListener(name, handler)` (delegate to an internal `EventEmitter`), `callService(domain, service, data, target)`, `send(rawMessage)`, `getServices()` (returns `{domain: {service: meta}}`), `getStates()` (returns `{entity_id: stateObj}`).
- Specific event-type subscriptions arrive on the bus under the name `` `ha_events:${eventType}` `` (confirmed via `dist/nodes/events-all/events.js`'s `startListeners` and the `HA_EVENTS` constant `"ha_events"` in `dist/const.js`).
- The handler for `ha_events:ios.notification_action_fired` receives the same object shape the original subflow's `server-events` node exposed as `msg.payload` — i.e. `event.event.actionName`, `event.event.action_data.{tag,deviceName,allServices,populateUserInfo,clearNotificationsOnAction}`, `event.context.user_id` (confirmed by cross-referencing the original subflow's `build message`/`belongs here?` function code, which is ground truth extracted from the live production `flows.json`, against the palette's `eventData` output-property resolver in `TypedInputService.js`, which passes the raw bus-emitted object through unmodified).
- The config node type for "which HA server" is `"server"` (confirmed in `dist/index.html`'s `RED.nodes.registerType` calls).

**Genuinely unverified against a live call — flagged for manual confirmation during Task 16 (not blocking, defensive code handles both shapes):**
- Whether `homeAssistant.send({type: 'config/auth/list'})` resolves directly to the array of users, or to a wrapped `{result: [...]}` envelope.

- [ ] **Step 1: Write the implementation**

```js
// lib/ha-client.js
'use strict';

const { getHomeAssistant } = require('node-red-contrib-home-assistant-websocket/dist/homeAssistant');

const ACTION_EVENT_TYPE = 'ios.notification_action_fired';
const ACTION_EVENT_BUS_NAME = `ha_events:${ACTION_EVENT_TYPE}`;

function connect(serverConfigNode) {
  return getHomeAssistant(serverConfigNode);
}

function subscribeToActionEvents(homeAssistant, subscriberId, handler) {
  homeAssistant.eventsList[subscriberId] = ACTION_EVENT_TYPE;
  homeAssistant.addListener(ACTION_EVENT_BUS_NAME, handler);
  if (homeAssistant.isConnected) {
    homeAssistant.subscribeEvents();
  }
}

function unsubscribeFromActionEvents(homeAssistant, subscriberId, handler) {
  homeAssistant.removeListener(ACTION_EVENT_BUS_NAME, handler);
  delete homeAssistant.eventsList[subscriberId];
  if (homeAssistant.isConnected) {
    homeAssistant.subscribeEvents();
  }
}

async function sendNotification(homeAssistant, deviceName, serviceData) {
  return homeAssistant.callService('notify', deviceName, serviceData, undefined);
}

async function fetchUsers(homeAssistant) {
  const result = await homeAssistant.send({ type: 'config/auth/list' });
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.result)) return result.result;
  return [];
}

function getNotifyTargets(homeAssistant) {
  const services = homeAssistant.getServices() || {};
  return Object.keys(services.notify || {});
}

function getCameraEntities(homeAssistant) {
  const states = homeAssistant.getStates() || {};
  return Object.keys(states).filter((id) => id.startsWith('camera.'));
}

module.exports = {
  ACTION_EVENT_TYPE,
  ACTION_EVENT_BUS_NAME,
  connect,
  subscribeToActionEvents,
  unsubscribeFromActionEvents,
  sendNotification,
  fetchUsers,
  getNotifyTargets,
  getCameraEntities,
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
    emitFakeActionEvent(payload) {
      emitter.emit('ha_events:ios.notification_action_fired', payload);
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
      imagePath: config.imagePath || '',
      videoPath: config.videoPath || '',
      audioPath: config.audioPath || '',
      lazyLoading: !!config.lazyLoading,
      hideThumbnail: !!config.hideThumbnail,
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
      }

      node.context().set('sentMessages', stored);
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
- Produces: when a `ha_events:ios.notification_action_fired` event fires and its `action_data.tag`+`deviceName` matches this node's own `sentMessages`, sends a message on the output whose configured action id equals `event.event.actionName`. Non-matching events (belonging to a different node instance) are silently ignored — this is the multi-instance safety mechanism.

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
  function handleActionReceived(node, event) {
    const eventPayload = event && event.event;
    if (!eventPayload || !eventPayload.action_data) return;

    const { tag, deviceName } = eventPayload.action_data;
    if (!tag || !deviceName) return;

    const stored = node.context().get('sentMessages') || [];
    const owned = findMatch(stored, tag, deviceName);
    if (!owned) return; // belongs to a different node instance — ignore

    const actionIndex = node.actions.findIndex((a, i) => {
      const id = a.id !== undefined && a.id !== null && a.id !== '' ? String(a.id) : String(i + 1);
      return id === String(eventPayload.actionName);
    });
    if (actionIndex === -1) return;

    const outputs = new Array(node.outputCount).fill(null);
    outputs[actionIndex] = { payload: event, matchedMessage: owned.message };
    node.status({ text: `action ${eventPayload.actionName} received`, shape: 'dot', fill: 'green' });
    node.send(outputs);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 8 passing

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

**Manual verification note (from Task 11):** confirm live whether `homeAssistant.send({type:'config/auth/list'})` returns a bare array or `{result:[...]}` before trusting this in production — `haClient.fetchUsers` already defensively handles both, but confirm against the real BEEbox HA instance once this node is npm-linked in (Task 27's dev workflow) by triggering one real actionable notification with `userInfo` enabled and inspecting `node.warn`/debug output.

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

```js
  async function handleActionReceived(node, event) {
    const eventPayload = event && event.event;
    if (!eventPayload || !eventPayload.action_data) return;

    const { tag, deviceName, populateUserInfo } = eventPayload.action_data;
    if (!tag || !deviceName) return;

    const stored = node.context().get('sentMessages') || [];
    const owned = findMatch(stored, tag, deviceName);
    if (!owned) return;

    const actionIndex = node.actions.findIndex((a, i) => {
      const id = a.id !== undefined && a.id !== null && a.id !== '' ? String(a.id) : String(i + 1);
      return id === String(eventPayload.actionName);
    });
    if (actionIndex === -1) return;

    const outMsg = { payload: event, matchedMessage: owned.message };

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
    node.status({ text: `action ${eventPayload.actionName} received`, shape: 'dot', fill: 'green' });
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
Expected: PASS — 10 passing

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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — no clear call is made, `calls` stays empty.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

Add to the requires:

```js
const { buildAutoClearPayloads } = require('./lib/build-clear-payload');
```

In `handleActionReceived`, after sending the output message (after `node.send(outputs);`), add:

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 11 passing

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
- Produces: a `staggerMs` config field (default `0`, disabled) that, when non-zero, waits `staggerMs` between each per-device `sendNotification` call in `handleSend` (does not apply to `handleManualClear` or auto-clear, since those are lower-frequency, rarely-fanned-out-wide operations where v2's own rate limiting appears to target the primary send path).

This directly replaces v2's ad-hoc delay/rate-limit canvas nodes with an explicit, documented config option, per the design spec.

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
        services: [{ deviceName: 'a' }, { deviceName: 'b' }], staggerMs: 50, actions: [], wires: [],
      },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        timestamps.should.have.length(2);
        (timestamps[1] - timestamps[0]).should.be.aboveOrEqual(45); // small slack for timer jitter
        done();
      }, 150);
    });
  });

  it('does not wait between sends when staggerMs is 0 (default)', function (done) {
    const timestamps = [];
    const { nodeUnderTest } = loadNodeWithMockHomeAssistant({
      callService: async () => { timestamps.push(Date.now()); return {}; },
    });
    const flow = [
      fakeServerFlowNode,
      { id: 'n1', type: 'ha-ios-notification', server: 'server1', services: [{ deviceName: 'a' }, { deviceName: 'b' }], actions: [], wires: [] },
    ];
    helper.load(nodeUnderTest, flow, () => {
      const n1 = helper.getNode('n1');
      n1.receive({ payload: {} });
      setTimeout(() => {
        timestamps.should.have.length(2);
        (timestamps[1] - timestamps[0]).should.be.below(45);
        done();
      }, 100);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: FAIL — sends happen back-to-back regardless of `staggerMs`, so the "waits" test's timing assertion fails.

- [ ] **Step 3: Extend `ha-ios-notification.js`**

Add `staggerMs` to `normalizeNodeConfig`:

```js
      staggerMs: Number(config.staggerMs) || 0,
```

Add a small delay helper at module scope:

```js
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
```

In `handleSend`, change the `for (const item of payloads) { ... }` loop to stagger between iterations:

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
        if (node.nodeConfig.staggerMs > 0 && i < payloads.length - 1) {
          await delay(node.nodeConfig.staggerMs);
        }
      }
```

- [ ] **Step 4: Add the `staggerMs` field to the editor defaults in `ha-ios-notification.html`**

In the `defaults` object, add:

```js
      staggerMs: { value: 0 },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 13 passing

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

In `handleActionReceived`, in the `outMsg` construction, add debug info conditionally. Change:

```js
    const outMsg = { payload: event, matchedMessage: owned.message };
```

to:

```js
    const outMsg = { payload: event, matchedMessage: owned.message };

    if (node.nodeConfig.debugMode) {
      outMsg._debug = {
        matchedTag: tag,
        matchedDeviceName: deviceName,
        rawEvent: event,
      };
      node.trace(`ha-ios-notification: action ${eventPayload.actionName} matched tag ${tag}`);
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx mocha test/integration/ha-ios-notification.spec.js`
Expected: PASS — 15 passing

- [ ] **Step 5: Commit**

```bash
git add ha-ios-notification.js test/integration/ha-ios-notification.spec.js
git commit -m "feat: add debug mode logging and msg._debug"
```

---

## Task 20: Full test suite and lint pass

**Files:**
- No new files — verification-only task.

**Interfaces:**
- Consumes: everything from Tasks 1–19.
- Produces: a green `npm test` and clean `npm run lint`, confirming the whole runtime + lib layer is internally consistent before editor UI work begins.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all unit + integration tests pass (67 total: 29 build-payload + 8 build-clear-payload + 7 sanitize-tag + 10 action-list + 8 message-store = 62 unit, plus 15 integration — reconcile the exact count against what actually accumulated across Tasks 2–19 and fix any test that regressed from a later task's refactor).

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

The legacy subflow's dropdown (in `legacy-subflow/actionable-notifications-subflow-for-ios.json`, the `customSoundPreInstalled` env var's `opts.opts` array) has ~90 entries. Per the design spec's decision, this is the iOS Companion App's own bundled sound library (not personal files), but it needs to be checked against the **current** app release rather than trusted as still-accurate, since it was captured 2025-02-07. Cross-reference against the Home Assistant iOS Companion App's current documentation/source (`companion-app` repo's bundled sound resources) before finalizing the list. If any sounds were added/removed since, update accordingly; if unable to verify a change, keep the legacy list as the known-good baseline rather than guessing.

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
- Configurable per-device send stagger, replacing ad-hoc canvas delay nodes.
- `node.error()` on Home Assistant call failures (v2 failed silently).
- Automated test suite (Mocha unit tests + node-red-node-test-helper
  integration tests).

### Changed
- Action override keys (`msg.notificationOverride.actions`) are now keyed by
  a stable action `id` instead of a 1-10 `actionOutput` number. See the
  README's migration section.

### Unchanged (compatible with v2)
- `msg.notificationOverride` three-tier override precedence.
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

**1. Spec coverage:**
- Package layout, config schema, override compatibility → Tasks 1, 12.
- Retained behaviors 1–7 (manual clear, auto-clear, ownership matching, user-info,
  rate limiting, node.status, debugMode) → Tasks 14, 17, 15, 16, 18, all tasks'
  `node.status()` calls, 19, respectively.
- Error handling (new) → Tasks 13/14/16/17 (`node.error` in every catch block).
- Editor UI (Basics/Targets/Actions/Map/Media/Advanced, pickers, help text) →
  Tasks 21–24.
- Local dev/debug workflow → covered in Task 27's `npm link` note folded into the
  README's Development section (Task 26 Step 3) rather than a separate task, since
  it's a few lines of documentation, not a code deliverable.
- Testing (unit + integration) → Tasks 2–19 each carry their own tests; Task 20
  verifies the whole suite together.
- Documentation → Task 26.
- Publishing plan (npm account, repo restructure, manifest, release) → Tasks 1
  (restructure), 28 (account/publish/release).
- Out-of-scope items (Android, auto-migration tooling, standalone HA client) —
  correctly absent from every task; no task builds any of them.

**2. Placeholder scan:** No "TBD"/"TODO" in any task. The two flagged
verification items (rate-limit wiring intent, `homeAssistant.send()` return
shape) are explicit, bounded manual-check notes with defensive code already
written to handle either outcome — not vague requirements.

**3. Type consistency:** Verified across tasks —
`buildNotificationPayloads(config, override)` signature is identical everywhere
it's called (Task 5 defines it, Task 13 calls it with `node.nodeConfig,
msg.notificationOverride`). `messageStore.recordSent`/`findMatch`/`removeMatch`
signatures from Task 4 match every call site in Tasks 13/14/15. `haClient.*`
function names from Task 11 match every call site in Tasks 12–17, 21, 22
exactly (no renamed variants). Action `id`/`outputIndex` fields from Task 3
are consumed identically in Task 6 (`build-payload.js`) and Task 15
(`handleActionReceived`'s output-index lookup).
