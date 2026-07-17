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
