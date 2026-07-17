'use strict';

// Classify Home Assistant notify targets for the editor's device picker.
//
// The node sends via the legacy per-device notify service form
// (`notify.mobile_app_<slug>`), so a "target" is identified by its
// deviceName `mobile_app_<slug>`. Modern HA also registers each companion-app
// notify as an entity (`notify.<slug>`) tied to a device in the device
// registry, which is what lets us reliably tell iOS (Apple) devices apart from
// Android ones — including devices whose display name doesn't cleanly
// re-slugify to their service name.
//
// Pure function: takes already-parsed registry data (no HA client access) so
// it can be unit-tested in isolation. lib/ha-client.js does the fetching and
// hands the parsed inputs in.

const NOTIFY_ENTITY_PREFIX = 'notify.';
const MOBILE_APP_SERVICE_PREFIX = 'mobile_app_';

// Extract the object_id from a `notify.<object_id>` entity_id, or null.
function notifyObjectId(entityId) {
  if (typeof entityId !== 'string' || !entityId.startsWith(NOTIFY_ENTITY_PREFIX)) {
    return null;
  }
  return entityId.slice(NOTIFY_ENTITY_PREFIX.length) || null;
}

// manufacturer 'Apple' => iOS; anything else on a mobile_app device => 'other'.
// (We only need iOS vs not-iOS; we don't enumerate Android vendors.)
function platformFor(device) {
  if (!device) return 'unknown';
  const manufacturer = String(device.manufacturer || '').trim().toLowerCase();
  return manufacturer === 'apple' ? 'ios' : 'other';
}

function deviceLabel(device, fallback) {
  if (!device) return fallback;
  return device.name_by_user || device.name || fallback;
}

// Build the classified companion-app target list.
//
// Params:
//  - notifyServiceKeys: string[] — keys under services.notify (service names
//    without the `notify.` prefix), e.g. ['mobile_app_steve_iphone', 'html5'].
//  - notifyEntities: Array<{ entity_id, device_id, platform }> — entity
//    registry entries whose entity_id is in the notify domain.
//  - devicesById: { [device_id]: { manufacturer, name, name_by_user, model } }
//
// Returns Array<{ deviceName, label, platform, model }>, one per
// `mobile_app_*` notify service that maps to a device, sorted iOS-first then
// alphabetically by label. Non-mobile_app notify services (Alexa, html5,
// persistent_notification, ...) are excluded — they can't receive an iOS
// actionable notification. Callers keep the raw service list separately for a
// free-type fallback.
function classifyNotifyTargets(notifyServiceKeys, notifyEntities, devicesById) {
  const serviceSet = new Set(Array.isArray(notifyServiceKeys) ? notifyServiceKeys : []);
  const devices = devicesById || {};

  // object_id -> device_id, from the notify entities registered by mobile_app.
  const deviceIdByObjectId = {};
  (Array.isArray(notifyEntities) ? notifyEntities : []).forEach((entity) => {
    if (!entity || !entity.device_id) return;
    const objectId = notifyObjectId(entity.entity_id);
    if (objectId) deviceIdByObjectId[objectId] = entity.device_id;
  });

  const targets = [];
  serviceSet.forEach((serviceKey) => {
    if (typeof serviceKey !== 'string' || !serviceKey.startsWith(MOBILE_APP_SERVICE_PREFIX)) {
      return; // not a companion-app device service
    }
    const objectId = serviceKey.slice(MOBILE_APP_SERVICE_PREFIX.length);
    const deviceId = deviceIdByObjectId[objectId];
    const device = deviceId ? devices[deviceId] : undefined;
    targets.push({
      deviceName: serviceKey,
      label: deviceLabel(device, serviceKey),
      platform: platformFor(device),
      model: (device && device.model) || '',
    });
  });

  // iOS first, then alphabetical by label (locale-agnostic).
  const platformRank = { ios: 0, other: 1, unknown: 2 };
  targets.sort((a, b) => {
    const pr = (platformRank[a.platform] ?? 3) - (platformRank[b.platform] ?? 3);
    if (pr !== 0) return pr;
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });

  return targets;
}

module.exports = { classifyNotifyTargets, notifyObjectId, platformFor };
