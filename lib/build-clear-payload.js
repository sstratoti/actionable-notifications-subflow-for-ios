'use strict';

const { sanitizeTag } = require('./sanitize-tag');

function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function buildManualClearPayloads(config, override) {
  const safeOverride = override || {};
  const services =
    safeOverride.services && safeOverride.services.length > 0
      ? safeOverride.services
      : config.services || [];

  if (!services || services.length === 0) {
    return { error: 'no services defined', payloads: [] };
  }

  const tag = sanitizeTag(pick(safeOverride.tag, config.tag), config.title);

  const payloads = services.map((service) => ({
    service,
    tag,
    action: `notify.${service.deviceName}`,
    payload: { data: { message: 'clear_notification', data: { tag } } },
  }));

  return { error: null, payloads };
}

module.exports = { buildManualClearPayloads };
