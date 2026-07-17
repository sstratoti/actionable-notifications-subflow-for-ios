'use strict';

const { sanitizeTag } = require('./sanitize-tag');

// [REV2] || semantics — treats '' as absent. Used ONLY for the sound chain (matches v2).
function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// [REV2] Nullish (??) semantics — honors an explicit '' (only undefined/null are "absent").
// Used for every other override chain, so an explicit empty-string override suppresses a
// configured default rather than falling through to it (matches v2's `??` chains).
function pickNullish(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function firstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function buildNotificationPayloads(config, override) {
  const safeOverride = override || {};
  const services =
    safeOverride.services && safeOverride.services.length > 0
      ? safeOverride.services
      : config.services || [];

  if (!services || services.length === 0) {
    return { error: 'no services defined', payloads: [] };
  }

  const tag = sanitizeTag(pickNullish(safeOverride.tag, config.tag), config.title);

  const payloads = services.map((service) => {
    const serviceOverride = service.serviceOverride || {};
    const nb = serviceOverride.notificationBase || {};
    const ovNb = safeOverride.notificationBase || {};

    const title = pickNullish(nb.title, ovNb.title, config.title) || '';
    const subtitle = pickNullish(nb.subtitle, ovNb.subtitle, config.subtitle) || '';
    const message = pickNullish(nb.message, ovNb.message, config.message) || '';
    const url = pickNullish(nb.url, ovNb.url, config.notificationUrl);
    const cameraEntity = pickNullish(nb.cameraEntity, ovNb.cameraEntity, config.cameraEntity);
    const interruptionLevel = pickNullish(nb.interruptionLevel, ovNb.interruptionLevel, config.interruptionLevel) || 'active';
    // sound uses || (pick) — matches v2's `||` sound chain
    const customSound =
      pick(nb.customSound, ovNb.customSound, config.customSound, config.customSoundPreInstalled) || 'default';
    const group = pickNullish(nb.group, ovNb.group, config.group);

    const data = {
      tag,
      ...(url ? { url } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(cameraEntity ? { entity_id: cameraEntity } : {}),
      ...(group ? { group } : {}),
      push: {
        sound: {
          name: customSound,
          ...(interruptionLevel === 'critical' ? { critical: 1, volume: 1.0 } : {}),
        },
        ...(interruptionLevel ? { 'interruption-level': interruptionLevel } : {}),
      },
    };

    return {
      service,
      tag,
      action: `notify.${service.deviceName}`,
      payload: { data: { title, message, data } },
    };
  });

  return { error: null, payloads };
}

module.exports = { buildNotificationPayloads, pick, pickNullish, firstDefined };
