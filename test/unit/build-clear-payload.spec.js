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
