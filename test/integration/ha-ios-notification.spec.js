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

describe('send path', () => {
  // [DEVIATION from task-13-brief.md] The brief's literal test text has no
  // afterEach hook in this describe block. node-red-node-test-helper's
  // helper.load() reuses node id 'n1' across every test in this file; without
  // unloading between tests, the second helper.load() in this block never
  // invokes its ready callback and the test hangs to the mocha timeout
  // (verified: isolating each test passes, running two in sequence without
  // this hook hangs). This mirrors the identical hook already present in the
  // sibling `describe('ha-ios-notification node', ...)` block above.
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

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
        // [DEVIATION from task-13-brief.md, surfaced by task-18-brief.md] This test
        // predates staggerMs (Task 18) and asserts both sends land almost immediately.
        // Task 18 made the default stagger 1000ms, which would push the second send
        // past this test's 20ms check window. Set staggerMs: 0 to preserve the
        // original intent (send count / status), since this test isn't about timing.
        staggerMs: 0,
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

describe('manual clear path', () => {
  // [DEVIATION from task-14-brief.md] Same reason as the sibling `describe('send
  // path', ...)` block above: node-red-node-test-helper reuses node id 'n1'
  // across tests in this file, and without unloading between tests the next
  // helper.load() never fires its ready callback (verified pattern, established
  // in Task 13).
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

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

describe('action-received handling', () => {
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

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

describe('user-info enrichment', () => {
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

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

describe('auto-clear on action', () => {
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

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
        // [DEVIATION from task-17-brief.md, surfaced by task-18-brief.md] This test
        // predates staggerMs (Task 18) and drives a 2-device fan-out whose sends must
        // both land within this test's setTimeout windows. Task 18 made the default
        // stagger 1000ms, which would leave a dangling delayed send/context-write
        // running past teardown. Set staggerMs: 0 to preserve the original intent
        // (auto-clear behavior), since this test isn't about timing.
        staggerMs: 0,
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
        // [DEVIATION from task-17-brief.md, surfaced by task-18-brief.md] This test
        // predates staggerMs (Task 18) and drives a 2-device fan-out whose sends must
        // both land within this test's setTimeout windows. Task 18 made the default
        // stagger 1000ms, which would leave a dangling delayed send/context-write
        // running past teardown. Set staggerMs: 0 to preserve the original intent
        // (tracking-store purge logic), since this test isn't about timing.
        staggerMs: 0,
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

  it('[REV2] with clear-on-action OFF, drops only the firing device and keeps the others actionable', function (done) {
    const { nodeUnderTest, mock } = loadNodeWithMockHomeAssistant();
    const flow = [
      fakeServerFlowNode,
      {
        id: 'n1', type: 'ha-ios-notification', server: 'server1',
        services: [{ deviceName: 'my_iphone' }, { deviceName: 'my_ipad' }], tag: 'front-door',
        actions: [{ title: 'Open' }], isClearNotificationsOnAction: false,
        // [DEVIATION from task-17-brief.md, surfaced by task-18-brief.md] This test
        // predates staggerMs (Task 18) and asserts both devices are recorded in
        // sentMessages by the 20ms mark before the action event fires. Task 18 made
        // the default stagger 1000ms, which would leave the second send unrecorded at
        // that point. Set staggerMs: 0 to preserve the original intent (ownership
        // cleanup logic), since this test isn't about timing.
        staggerMs: 0,
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
              clearNotificationsOnAction: false,
            },
          },
          context: { user_id: 'user-123' },
        });
        setTimeout(() => {
          const stored = n1.context().get('sentMessages') || [];
          stored.should.have.length(1);
          stored[0].deviceName.should.equal('my_ipad'); // firing device dropped, other kept
          done();
        }, 30);
      }, 20);
    });
  });
});

describe('rate limiting', () => {
  // [DEVIATION from task-18-brief.md] The brief's literal test text has no afterEach
  // hook in this describe block. Every sibling top-level describe block in this file
  // carries the identical hook (see `describe('send path', ...)` above) because
  // node-red-node-test-helper reuses node id 'n1' across tests; without unloading
  // between tests, the next helper.load() never invokes its ready callback and the
  // test hangs to the mocha timeout.
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

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

describe('debug mode', () => {
  // [DEVIATION from task-19-brief.md] The brief's literal test text has no afterEach
  // hook in this describe block. Every sibling top-level describe block in this file
  // carries the identical hook (see `describe('send path', ...)` above) because
  // node-red-node-test-helper reuses node id 'n1' across tests; without unloading
  // between tests, the next helper.load() never invokes its ready callback and the
  // test hangs to the mocha timeout.
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

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

describe('clear_badge command', () => {
  // [DEVIATION from task-19.1-brief.md] The brief's literal test text has no afterEach
  // hook in this describe block. Every sibling top-level describe block in this file
  // carries the identical hook (see `describe('send path', ...)` above) because
  // node-red-node-test-helper reuses node id 'n1' across tests; without unloading
  // between tests, the next helper.load() never invokes its ready callback and the
  // test hangs to the mocha timeout.
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

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

describe('tap-to-perform', () => {
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

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

describe('live activity send', () => {
  // [DEVIATION from task-19.4-brief.md] The brief's literal test text has no afterEach
  // hook in this describe block. Without it, helper.load()'s reuse of node id 'n1'
  // across tests in this file hangs the second test to the mocha timeout (same issue
  // documented in the sibling `describe('send path', ...)` block above).
  afterEach(function (done) {
    helper.unload().then(() => done());
  });

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
