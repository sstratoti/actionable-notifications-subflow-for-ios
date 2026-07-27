// ha-ios-notification.js
'use strict';

const haClient = require('./lib/ha-client');
const { buildNotificationPayloads } = require('./lib/build-payload');
const { buildLiveActivityPayloads } = require('./lib/build-live-activity');
const { buildManualClearPayloads, buildAutoClearPayloads } = require('./lib/build-clear-payload');
const messageStore = require('./lib/message-store');
const { findMatch } = require('./lib/message-store');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = function (RED) {
  function normalizeNodeConfig(config) {
    return {
      tag: config.tag || '',
      services: config.services || [],
      group: config.group || '',
      title: config.title || '',
      subtitle: config.subtitle || '',
      message: config.message || '',
      notificationUrl: config.notificationUrl || '',
      cameraEntity: config.cameraEntity || '',
      customSoundPreInstalled: config.customSoundPreInstalled || 'default',
      customSound: config.customSound || '',
      interruptionLevel: config.interruptionLevel || 'active',
      userInfo: !!config.userInfo,
      isClearNotificationsOnAction: !!config.isClearNotificationsOnAction,
      actions: config.actions || [],
      firstLatitude: config.firstLatitude || '',
      firstLongitude: config.firstLongitude || '',
      secondLatitude: config.secondLatitude || '',
      secondLongitude: config.secondLongitude || '',
      showLineBetweenPoints: !!config.showLineBetweenPoints,
      showCompass: !!config.showCompass,
      showPointsOfInterest: !!config.showPointsOfInterest,
      showScale: !!config.showScale,
      showTraffic: !!config.showTraffic,
      showUserLocation: !!config.showUserLocation,
      contentUrl: config.contentUrl || '',
      contentType: config.contentType || '',
      imagePath: config.imagePath || '',
      videoPath: config.videoPath || '',
      audioPath: config.audioPath || '',
      lazyLoading: !!config.lazyLoading,
      hideThumbnail: !!config.hideThumbnail,
      // [REV2] badge + presentation_options
      badge: config.badge === undefined || config.badge === '' ? undefined : Number(config.badge),
      presentationOptions: Array.isArray(config.presentationOptions) ? config.presentationOptions : [],
      // [REV2] stagger between per-device sends; default non-zero (protects APNs, see Task 18)
      staggerMs: config.staggerMs === undefined || config.staggerMs === '' ? 1000 : Number(config.staggerMs),
      // [REV2] Live Activity mode + its fields (see Task 19.3)
      liveActivity: !!config.liveActivity,
      progress: config.progress === undefined || config.progress === '' ? undefined : Number(config.progress),
      progressMax: config.progressMax === undefined || config.progressMax === '' ? undefined : Number(config.progressMax),
      chronometer: !!config.chronometer,
      when: config.when === undefined || config.when === '' ? undefined : Number(config.when),
      whenRelative: !!config.whenRelative,
      notificationIcon: config.notificationIcon || '',
      notificationIconColor: config.notificationIconColor || '',
      color: config.color || '',
      backgroundColor: config.backgroundColor || '',
      textColor: config.textColor || '',
      debugMode: !!config.debugMode,
    };
  }

  RED.httpAdmin.get('/ha-ios-notification/notify-targets', RED.auth.needsPermission('flows.write'), async function (req, res) {
    const serverNode = RED.nodes.getNode(req.query.server);
    if (!serverNode) {
      res.json({ targets: [], classified: false });
      return;
    }
    try {
      const homeAssistant = haClient.connect(serverNode);
      // Prefer the classified companion-app list (iOS-tagged, friendly labels).
      // Fall back to the plain notify-service names as free-type suggestions if
      // the registries aren't available (older HA, permissions, transport).
      const classified = await haClient.getClassifiedNotifyTargets(homeAssistant);
      if (classified) {
        res.json({ targets: classified, classified: true });
      } else {
        const names = haClient.getNotifyTargets(homeAssistant);
        res.json({ targets: names.map((deviceName) => ({ deviceName, label: deviceName, platform: 'unknown' })), classified: false });
      }
    } catch (err) {
      res.json({ targets: [], classified: false });
    }
  });

  RED.httpAdmin.get('/ha-ios-notification/camera-entities', RED.auth.needsPermission('flows.write'), function (req, res) {
    const serverNode = RED.nodes.getNode(req.query.server);
    if (!serverNode) {
      res.json({ entities: [] });
      return;
    }
    try {
      const homeAssistant = haClient.connect(serverNode);
      res.json({ entities: haClient.getCameraEntities(homeAssistant) });
    } catch (err) {
      res.json({ entities: [] });
    }
  });

  function HaIosNotificationNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.serverConfig = RED.nodes.getNode(config.server);
    node.actions = config.actions || [];
    node.nodeConfig = normalizeNodeConfig(config);
    node.outputCount = node.actions.length;

    node.homeAssistant = node.serverConfig ? haClient.connect(node.serverConfig) : null;

    node.actionHandler = function (event) {
      handleActionReceived(node, event).catch((err) => node.error(err));
    };

    if (node.homeAssistant) {
      haClient.subscribeToActionEvents(node.homeAssistant, node.id, node.actionHandler);
    }

    node.on('close', function (removed, done) {
      if (node.homeAssistant) {
        haClient.unsubscribeFromActionEvents(node.homeAssistant, node.id, node.actionHandler);
      }
      done();
    });

    node.on('input', function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err) { if (err) node.error(err, msg); };

      if (msg.clearBadge) {
        handleClearBadge(node, msg, send, done);
        return;
      }

      if (msg.clear) {
        handleManualClear(node, msg, send, done);
        return;
      }

      handleSend(node, msg, send, done);
    });
  }

  async function handleSend(node, msg, send, done) {
    // [REV2] Live Activity mode: msg.liveActivity, when explicitly set, overrides
    // node.nodeConfig.liveActivity (see Task 19.4).
    const liveMode = msg.liveActivity !== undefined ? !!msg.liveActivity : node.nodeConfig.liveActivity;
    const { error, payloads } = liveMode
      ? buildLiveActivityPayloads(node.nodeConfig, msg.notificationOverride)
      : buildNotificationPayloads(node.nodeConfig, msg.notificationOverride);

    if (error) {
      node.status({ text: error, shape: 'ring', fill: 'red' });
      done();
      return;
    }

    try {
      const now = Date.now();
      let stored = node.context().get('sentMessages') || [];

      if (node.nodeConfig.debugMode) {
        node.trace(`ha-ios-notification: sending to ${payloads.length} service(s): ${JSON.stringify(payloads.map((p) => p.action))}`);
      }

      for (let i = 0; i < payloads.length; i += 1) {
        const item = payloads[i];
        await haClient.sendNotification(node.homeAssistant, item.service.deviceName, item.payload.data);
        stored = messageStore.recordSent(stored, {
          tag: item.tag,
          deviceName: item.service.deviceName,
          dateCreated: now,
          message: msg,
        });
        // [REV2] persist after EACH successful send, so a mid-fan-out failure never
        // silently drops an already-delivered device from the tracking store.
        node.context().set('sentMessages', stored);
        // [REV2] stagger per-device sends to avoid slamming APNs/HA; not applied
        // after the final send (see Task 18).
        if (node.nodeConfig.staggerMs > 0 && i < payloads.length - 1) {
          await delay(node.nodeConfig.staggerMs);
        }
      }

      node.status({ text: `sent to ${payloads.length} service(s)`, shape: 'dot', fill: 'green' });
      done();
    } catch (err) {
      node.error(err, msg);
      done(err);
    }
  }

  async function handleClearBadge(node, msg, send, done) {
    const override = msg.notificationOverride || {};
    const services = (override.services && override.services.length > 0)
      ? override.services
      : node.nodeConfig.services;
    if (!services || services.length === 0) {
      node.status({ text: 'no services defined', shape: 'ring', fill: 'red' });
      done();
      return;
    }
    try {
      for (const service of services) {
        await haClient.sendNotification(node.homeAssistant, service.deviceName, { message: 'clear_badge' });
      }
      node.status({ text: `badge cleared on ${services.length} service(s)`, shape: 'dot', fill: 'blue' });
      done();
    } catch (err) {
      node.error(err, msg);
      done(err);
    }
  }

  async function handleManualClear(node, msg, send, done) {
    const { error, payloads } = buildManualClearPayloads(node.nodeConfig, msg.notificationOverride);

    if (error) {
      node.status({ text: error, shape: 'ring', fill: 'red' });
      done();
      return;
    }

    try {
      let stored = node.context().get('sentMessages') || [];

      for (const item of payloads) {
        await haClient.sendNotification(node.homeAssistant, item.service.deviceName, item.payload.data);
        stored = messageStore.removeMatch(stored, item.tag, item.service.deviceName);
      }

      node.context().set('sentMessages', stored);
      node.status({ text: `cleared ${payloads.length} notification(s)`, shape: 'dot', fill: 'blue' });
      done();
    } catch (err) {
      node.error(err, msg);
      done(err);
    }
  }

  // [REV2] Normalize the action id across both event shapes: the modern
  // mobile_app_notification_action carries `action`; the legacy
  // ios.notification_action_fired carries `actionName`.
  function normalizeActionId(eventPayload) {
    const raw = eventPayload.action !== undefined && eventPayload.action !== null
      ? eventPayload.action
      : eventPayload.actionName;
    return raw === undefined || raw === null ? undefined : String(raw);
  }

  async function handleActionReceived(node, event) {
    const eventPayload = event && event.event;
    if (!eventPayload || !eventPayload.action_data) return;

    const { tag, deviceName, populateUserInfo } = eventPayload.action_data;
    if (!tag || !deviceName) return;

    const stored = node.context().get('sentMessages') || [];
    const owned = findMatch(stored, tag, deviceName);
    if (!owned) return; // belongs to a different node instance — ignore

    const actionId = normalizeActionId(eventPayload); // event.action ?? event.actionName
    if (actionId === undefined) return;

    const actionIndex = node.actions.findIndex((a, i) => {
      const id = a.id !== undefined && a.id !== null && a.id !== '' ? String(a.id) : String(i + 1);
      return id === actionId;
    });
    if (actionIndex === -1) return;

    const outMsg = { payload: event, actionId, matchedMessage: owned.message };

    if (node.nodeConfig.debugMode) {
      outMsg._debug = {
        matchedTag: tag,
        matchedDeviceName: deviceName,
        rawEvent: event,
      };
      node.trace(`ha-ios-notification: action ${actionId} matched tag ${tag}`);
    }

    if (populateUserInfo && event.context && event.context.user_id) {
      try {
        const users = await haClient.fetchUsers(node.homeAssistant);
        outMsg.userData = users.find((u) => u.id === event.context.user_id);
      } catch (err) {
        node.error(err, outMsg);
      }
    }

    const outputs = new Array(node.outputCount).fill(null);
    outputs[actionIndex] = outMsg;

    const matchedAction = node.actions[actionIndex];
    const overrideActions =
      (owned.message &&
        owned.message.notificationOverride &&
        owned.message.notificationOverride.actions) ||
      {};
    const overrideTitle =
      overrideActions[actionId] &&
      overrideActions[actionId].title !== undefined &&
      overrideActions[actionId].title !== null &&
      overrideActions[actionId].title !== ''
        ? String(overrideActions[actionId].title)
        : '';
    const actionTitle =
      overrideTitle ||
      (matchedAction && matchedAction.title) ||
      String(actionId);
    node.status({
      text: `Action ${actionIndex + 1}: ${actionTitle}`,
      shape: 'dot',
      fill: 'green',
    });
    node.send(outputs);

    // [REV2] Tap-to-perform: call the HA service configured on the matched action
    // (raw node.actions config, not the outbound payload) in addition to emitting
    // on its output. targetService/targetEntityId/targetData never touch outMsg.
    if (matchedAction && matchedAction.targetService) {
      const dot = String(matchedAction.targetService).indexOf('.');
      const domain = dot > 0 ? matchedAction.targetService.slice(0, dot) : '';
      const service = dot > 0 ? matchedAction.targetService.slice(dot + 1) : '';
      if (domain && service) {
        try {
          const target = matchedAction.targetEntityId ? { entity_id: matchedAction.targetEntityId } : undefined;
          await haClient.callAction(node.homeAssistant, domain, service, matchedAction.targetData || {}, target);
        } catch (err) {
          node.error(err);
        }
      }
    }

    if (eventPayload.action_data.clearNotificationsOnAction) {
      try {
        const { payloads: clearPayloads } = buildAutoClearPayloads(eventPayload.action_data);
        for (const item of clearPayloads) {
          await haClient.sendNotification(node.homeAssistant, item.service.deviceName, item.payload.data);
        }
      } catch (err) {
        node.error(err);
      }
    }

    // [REV2] State cleanup. Always drop the firing device's own entry (dedup guard for
    // duplicate/late events on the same tag+device). Under clear-on-action, also drop the
    // OTHER devices' entries for this tag — their notifications were just cleared (matches
    // v2's cleanUpMessages). With clear-on-action OFF, leave the others so each device can
    // still be actioned independently (v2 behavior).
    let after = node.context().get('sentMessages') || [];
    after = messageStore.removeMatch(after, tag, deviceName);
    if (eventPayload.action_data.clearNotificationsOnAction) {
      (eventPayload.action_data.allServices || []).forEach((svc) => {
        if (svc && svc.deviceName) after = messageStore.removeMatch(after, tag, svc.deviceName);
      });
    }
    node.context().set('sentMessages', after);
  }

  // [REV2] Admin endpoints backing the editor's tap-to-perform pickers (Task 24.5).
  RED.httpAdmin.get('/ha-ios-notification/callable-services', RED.auth.needsPermission('flows.write'), function (req, res) {
    const serverNode = RED.nodes.getNode(req.query.server);
    if (!serverNode) { res.json({ services: [] }); return; }
    try {
      res.json({ services: haClient.getCallableServices(haClient.connect(serverNode)) });
    } catch (err) {
      res.json({ services: [] });
    }
  });

  RED.httpAdmin.get('/ha-ios-notification/entities', RED.auth.needsPermission('flows.write'), function (req, res) {
    const serverNode = RED.nodes.getNode(req.query.server);
    if (!serverNode) { res.json({ entities: [] }); return; }
    try {
      res.json({ entities: haClient.getEntities(haClient.connect(serverNode), req.query.prefix) });
    } catch (err) {
      res.json({ entities: [] });
    }
  });

  RED.nodes.registerType('ha-ios-notification', HaIosNotificationNode);
};
