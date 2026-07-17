'use strict';

const { sanitizeTag } = require('./sanitize-tag');

function pickNullish(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function buildLiveActivityPayloads(config, override) {
  const safeOverride = override || {};
  const la = safeOverride.liveActivity || {};
  const services =
    safeOverride.services && safeOverride.services.length > 0
      ? safeOverride.services
      : config.services || [];

  if (!services || services.length === 0) {
    return { error: 'no services defined', payloads: [] };
  }

  const tag = sanitizeTag(pickNullish(safeOverride.tag, config.tag), config.title);
  const title = pickNullish(la.title, config.title) || '';
  const message = pickNullish(la.message, config.message) || '';

  const progress = pickNullish(la.progress, config.progress);
  const progressMax = pickNullish(la.progressMax, config.progressMax);
  const chronometer = pickNullish(la.chronometer, config.chronometer) || false;
  const when = pickNullish(la.when, config.when);
  const whenRelative = pickNullish(la.whenRelative, config.whenRelative) || false;
  const notificationIcon = pickNullish(la.notificationIcon, config.notificationIcon);
  const notificationIconColor = pickNullish(la.notificationIconColor, config.notificationIconColor);
  const color = pickNullish(la.color, config.color);
  const backgroundColor = pickNullish(la.backgroundColor, config.backgroundColor);
  const textColor = pickNullish(la.textColor, config.textColor);
  const url = pickNullish(la.url, config.notificationUrl);

  const payloads = services.map((service) => {
    const inner = { tag, live_update: true };
    if (typeof progress === 'number') inner.progress = progress;
    if (typeof progressMax === 'number') inner.progress_max = progressMax;
    if (chronometer) {
      inner.chronometer = true;
      if (typeof when === 'number') inner.when = when;
      inner.when_relative = !!whenRelative;
    }
    if (notificationIcon) inner.notification_icon = notificationIcon;
    if (notificationIconColor) inner.notification_icon_color = notificationIconColor;
    if (color) inner.color = color;
    if (backgroundColor) inner.background_color = backgroundColor;
    if (textColor) inner.text_color = textColor;
    if (url) inner.url = url;

    return {
      service,
      tag,
      action: `notify.${service.deviceName}`,
      payload: { data: { title, message, data: inner } },
    };
  });

  return { error: null, payloads };
}

module.exports = { buildLiveActivityPayloads };
