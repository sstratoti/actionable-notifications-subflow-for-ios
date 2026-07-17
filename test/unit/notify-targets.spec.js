'use strict';

require('should');
const { classifyNotifyTargets, notifyObjectId, platformFor } = require('../../lib/notify-targets');

describe('notify-targets', () => {
  describe('notifyObjectId', () => {
    it('extracts the object_id from a notify entity_id', () => {
      notifyObjectId('notify.stephen_stratotis_ipad').should.equal('stephen_stratotis_ipad');
    });
    it('returns null for a non-notify entity_id', () => {
      (notifyObjectId('sensor.foo') === null).should.equal(true);
    });
    it('returns null for a non-string', () => {
      (notifyObjectId(undefined) === null).should.equal(true);
    });
  });

  describe('platformFor', () => {
    it('classifies Apple as ios (case/space insensitive)', () => {
      platformFor({ manufacturer: 'Apple' }).should.equal('ios');
      platformFor({ manufacturer: ' apple ' }).should.equal('ios');
    });
    it('classifies any other manufacturer as other', () => {
      platformFor({ manufacturer: 'samsung' }).should.equal('other');
      platformFor({ manufacturer: 'LENOVO' }).should.equal('other');
    });
    it('classifies a missing device as unknown', () => {
      platformFor(undefined).should.equal('unknown');
    });
  });

  describe('classifyNotifyTargets', () => {
    // Mirrors Steve's real HA: 2 iPhones + an iPad (Apple), a Lenovo + Samsung
    // tablet (Android), plus non-mobile_app notify services that must be dropped.
    const notifyServiceKeys = [
      'send_message',
      'persistent_notification',
      'html5',
      'alexa_media_kitchen_echo',
      'mobile_app_lenovocd_24502f',
      'mobile_app_norastablet',
      'mobile_app_stephen_stratotis_ipad',
      'mobile_app_arielle_s_iphone_16',
      'mobile_app_steve_stratotis_iphone_16_pro',
    ];
    const notifyEntities = [
      { entity_id: 'notify.stephen_stratotis_ipad', device_id: 'ipad', platform: 'mobile_app' },
      { entity_id: 'notify.arielle_s_iphone_16', device_id: 'ariphone', platform: 'mobile_app' },
      { entity_id: 'notify.steve_stratotis_iphone_16_pro', device_id: 'steviphone', platform: 'mobile_app' },
      { entity_id: 'notify.lenovocd_24502f', device_id: 'lenovo', platform: 'mobile_app' },
      { entity_id: 'notify.norastablet', device_id: 'samsungtab', platform: 'mobile_app' },
    ];
    const devicesById = {
      ipad: { manufacturer: 'Apple', model: 'iPad7,5', name: "Stephen Stratoti's iPad" },
      ariphone: { manufacturer: 'Apple', model: 'iPhone17,3', name: "Arielle's iPhone 16" },
      steviphone: { manufacturer: 'Apple', model: 'iPhone17,1', name: 'Steve Stratotis iPhone 16 Pro', name_by_user: "Steve's iPhone 16 Pro" },
      lenovo: { manufacturer: 'LENOVO', model: 'LenovoCD-24502F', name: 'LenovoCD-24502F' },
      samsungtab: { manufacturer: 'samsung', model: 'SM-T500', name: 'NorasTablet' },
    };

    it('excludes non-mobile_app notify services entirely', () => {
      const result = classifyNotifyTargets(notifyServiceKeys, notifyEntities, devicesById);
      result.map((t) => t.deviceName).should.not.containEql('html5');
      result.map((t) => t.deviceName).should.not.containEql('persistent_notification');
      result.map((t) => t.deviceName).should.not.containEql('alexa_media_kitchen_echo');
      result.map((t) => t.deviceName).should.not.containEql('send_message');
    });

    it('returns exactly the 5 mobile_app targets', () => {
      const result = classifyNotifyTargets(notifyServiceKeys, notifyEntities, devicesById);
      result.should.have.length(5);
    });

    it('classifies the three Apple devices as ios, including the iPad whose name does not re-slugify', () => {
      const result = classifyNotifyTargets(notifyServiceKeys, notifyEntities, devicesById);
      const ios = result.filter((t) => t.platform === 'ios').map((t) => t.deviceName);
      ios.should.have.length(3);
      ios.should.containEql('mobile_app_stephen_stratotis_ipad');
      ios.should.containEql('mobile_app_arielle_s_iphone_16');
      ios.should.containEql('mobile_app_steve_stratotis_iphone_16_pro');
    });

    it('classifies Android companion apps as other', () => {
      const result = classifyNotifyTargets(notifyServiceKeys, notifyEntities, devicesById);
      const other = result.filter((t) => t.platform === 'other').map((t) => t.deviceName);
      other.should.containEql('mobile_app_lenovocd_24502f');
      other.should.containEql('mobile_app_norastablet');
    });

    it('uses the friendly device label, preferring name_by_user', () => {
      const result = classifyNotifyTargets(notifyServiceKeys, notifyEntities, devicesById);
      const stevePhone = result.find((t) => t.deviceName === 'mobile_app_steve_stratotis_iphone_16_pro');
      stevePhone.label.should.equal("Steve's iPhone 16 Pro"); // name_by_user wins over name
      const ipad = result.find((t) => t.deviceName === 'mobile_app_stephen_stratotis_ipad');
      ipad.label.should.equal("Stephen Stratoti's iPad");
    });

    it('sorts iOS devices before others', () => {
      const result = classifyNotifyTargets(notifyServiceKeys, notifyEntities, devicesById);
      const firstOtherIndex = result.findIndex((t) => t.platform === 'other');
      const lastIosIndex = result.map((t) => t.platform).lastIndexOf('ios');
      lastIosIndex.should.be.below(firstOtherIndex);
    });

    it('falls back to unknown platform and the service name as label when a device is not found', () => {
      const result = classifyNotifyTargets(
        ['mobile_app_orphan_device'],
        [], // no notify entity maps to it
        {}
      );
      result.should.have.length(1);
      result[0].platform.should.equal('unknown');
      result[0].label.should.equal('mobile_app_orphan_device');
      result[0].deviceName.should.equal('mobile_app_orphan_device');
    });

    it('handles empty/missing inputs without throwing', () => {
      classifyNotifyTargets(undefined, undefined, undefined).should.eql([]);
      classifyNotifyTargets([], [], {}).should.eql([]);
    });
  });
});
