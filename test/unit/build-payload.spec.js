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
    should(result.error).be.null();
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
