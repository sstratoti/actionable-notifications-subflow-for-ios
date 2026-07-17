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
