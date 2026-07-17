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

  it('[REV2] does NOT emit tap-to-perform target props into the iOS action payload', () => {
    const config = baseConfig({
      actions: [{ title: 'Unlock', targetService: 'lock.unlock', targetEntityId: 'lock.front_door' }],
    });
    const { payloads } = buildNotificationPayloads(config, {});
    const action = payloads[0].payload.data.data.actions[0];
    action.title.should.equal('Unlock');
    action.should.not.have.property('targetService');
    action.should.not.have.property('targetEntityId');
  });
});
