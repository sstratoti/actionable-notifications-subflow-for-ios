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
