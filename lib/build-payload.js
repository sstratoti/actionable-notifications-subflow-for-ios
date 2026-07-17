'use strict';

const { sanitizeTag } = require('./sanitize-tag');
const { normalizeActions, applyActionOverrides, IOS_ACTION_PROPS } = require('./action-list');

// [REV2] || semantics — '' is absent. Sound chain only (matches v2).
function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// [REV2] Nullish semantics — honors explicit ''. Used for every other override chain.
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
  const baseActions = normalizeActions(config.actions);

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
    const customSound =
      pick(nb.customSound, ovNb.customSound, config.customSound, config.customSoundPreInstalled) || 'default';
    const group = pickNullish(nb.group, ovNb.group, config.group);
    const populateUserInfo = firstDefined(
      nb.populateUserInformation,
      ovNb.populateUserInformation,
      config.userInfo,
      false
    );
    const clearOnAction = firstDefined(
      nb.clearNotificationsOnAction,
      ovNb.clearNotificationsOnAction,
      config.isClearNotificationsOnAction,
      false
    );

    const actionOverridesById = {
      ...(safeOverride.actions || {}),
      ...(serviceOverride.actions || {}),
    };
    // Emit only IOS_ACTION_PROPS into the payload — tap-to-perform target props
    // (targetService/targetEntityId/targetData) stay node-side and are never sent to iOS.
    const finalActions = applyActionOverrides(baseActions, actionOverridesById).map((a) => {
      const actionObj = { action: a.id, title: a.title };
      IOS_ACTION_PROPS.forEach((prop) => {
        if (a[prop] !== undefined) actionObj[prop] = a[prop];
      });
      // Attach only the minimal projection consumers need — never the raw service
      // object, which may carry serviceOverride.actions[*].targetService/targetEntityId/
      // targetData (tap-to-perform config) that must never reach the iOS-bound payload.
      actionObj.service = { deviceName: service.deviceName };
      return actionObj;
    });

    const actionData =
      finalActions.length > 0
        ? {
            tag,
            populateUserInfo,
            clearNotificationsOnAction: clearOnAction,
            deviceName: service.deviceName,
            // Attach only the minimal projection consumers need — never the raw
            // services array, which may carry serviceOverride.actions[*].targetService/
            // targetEntityId/targetData (tap-to-perform config) that must never reach
            // the iOS-bound payload (action_data round-trips back from the companion app).
            allServices: services.map((s) => ({ deviceName: s.deviceName })),
          }
        : undefined;

    const mp = serviceOverride.map || {};
    const ovMp = safeOverride.map || {};
    // [REV2] pickNullish for map value fields (nullish precedence per spec Rev 2)
    const firstLatitude = pickNullish(mp.firstLatitude, ovMp.firstLatitude, config.firstLatitude);
    const firstLongitude = pickNullish(mp.firstLongitude, ovMp.firstLongitude, config.firstLongitude);
    const secondLatitude = pickNullish(mp.secondLatitude, ovMp.secondLatitude, config.secondLatitude);
    const secondLongitude = pickNullish(mp.secondLongitude, ovMp.secondLongitude, config.secondLongitude);
    const showLineBetweenPoints = firstDefined(mp.showLineBetweenPoints, ovMp.showLineBetweenPoints, config.showLineBetweenPoints, false);
    const showCompass = firstDefined(mp.showCompass, ovMp.showCompass, config.showCompass, false);
    const showPointsOfInterest = firstDefined(mp.showPointsOfInterest, ovMp.showPointsOfInterest, config.showPointsOfInterest, false);
    const showScale = firstDefined(mp.showScale, ovMp.showScale, config.showScale, false);
    const showTraffic = firstDefined(mp.showTraffic, ovMp.showTraffic, config.showTraffic, false);
    const showUserLocation = firstDefined(mp.showUserLocation, ovMp.showUserLocation, config.showUserLocation, false);

    const md = serviceOverride.media || {};
    const ovMd = safeOverride.media || {};
    // [REV2] pickNullish so an explicit '' override clears a configured media field
    const contentUrl = pickNullish(md.contentUrl, ovMd.contentUrl, config.contentUrl);
    const contentType = pickNullish(md.contentType, ovMd.contentType, config.contentType);
    const imagePath = pickNullish(md.imagePath, ovMd.imagePath, config.imagePath);
    const videoPath = pickNullish(md.videoPath, ovMd.videoPath, config.videoPath);
    const audioPath = pickNullish(md.audioPath, ovMd.audioPath, config.audioPath);
    const lazyLoading = firstDefined(md.lazyLoading, ovMd.lazyLoading, config.lazyLoading, false);
    const hideThumbnail = firstDefined(md.hideThumbnail, ovMd.hideThumbnail, config.hideThumbnail, false);

    const data = {
      tag,
      ...(finalActions.length > 0 ? { actions: finalActions } : {}),
      ...(actionData ? { action_data: actionData } : {}),
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

    if (firstLatitude && firstLongitude) {
      data.action_data = {
        ...(actionData || {}),
        latitude: firstLatitude,
        longitude: firstLongitude,
        ...(secondLatitude && secondLongitude
          ? {
              second_latitude: secondLatitude,
              second_longitude: secondLongitude,
              shows_line_between_points: showLineBetweenPoints,
              shows_compass: showCompass,
              shows_points_of_interest: showPointsOfInterest,
              shows_scale: showScale,
              shows_traffic: showTraffic,
              shows_user_location: showUserLocation,
            }
          : {}),
      };
    }

    // image/video/audio: directly under the inner data block
    if (imagePath) data.image = imagePath;
    if (videoPath) data.video = videoPath;
    if (audioPath) data.audio = audioPath;

    // attachment object: url / content-type / lazy / hide-thumbnail
    const attachment = {};
    if (contentUrl) attachment.url = contentUrl;
    if (contentType) attachment['content-type'] = contentType;
    if (lazyLoading) attachment.lazy = lazyLoading;
    if (hideThumbnail) attachment['hide-thumbnail'] = hideThumbnail;
    if (Object.keys(attachment).length > 0) data.attachment = attachment;

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
