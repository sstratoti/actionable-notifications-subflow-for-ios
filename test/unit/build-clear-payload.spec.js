'use strict';

require('should');
const { buildManualClearPayloads, buildAutoClearPayloads } = require('../../lib/build-clear-payload');

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
