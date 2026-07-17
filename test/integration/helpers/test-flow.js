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

  const realNode = proxyquire('../../../ha-ios-notification.js', {
    './lib/ha-client': haClient,
  });

  // node-red-node-test-helper only preloads a few core node types (catch/status/complete);
  // 'server' is not one of them. Node-RED's flow runtime refuses to start ANY node in a
  // flow that references an unregistered type (it silently no-ops the whole flow rather
  // than throwing), so without this stub, `fakeServerFlowNode`'s `server1` id never
  // resolves via RED.nodes.getNode and the node under test is never created either.
  // Registering a trivial passthrough 'server' type here — alongside the real node under
  // test — is what lets `RED.nodes.getNode(config.server)` actually resolve, matching the
  // comment's stated intent on `fakeServerFlowNode` below.
  function nodeUnderTest(RED) {
    RED.nodes.registerType('server', function (n) {
      RED.nodes.createNode(this, n);
    });
    realNode(RED);
  }

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
