// ha-ios-notification.js
'use strict';

const haClient = require('./lib/ha-client');

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

  function HaIosNotificationNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.serverConfig = RED.nodes.getNode(config.server);
    node.actions = config.actions || [];
    node.nodeConfig = normalizeNodeConfig(config);
    node.outputCount = node.actions.length;

    node.homeAssistant = node.serverConfig ? haClient.connect(node.serverConfig) : null;
  }

  RED.nodes.registerType('ha-ios-notification', HaIosNotificationNode);
};
