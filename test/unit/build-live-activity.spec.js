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
