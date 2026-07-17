// lib/ha-client.js
'use strict';

const { getHomeAssistant } = require('node-red-contrib-home-assistant-websocket/dist/homeAssistant');

// [REV2] Modern event first, legacy second — the node listens for both.
const ACTION_EVENT_TYPES = ['mobile_app_notification_action', 'ios.notification_action_fired'];

function actionBusName(eventType) {
  return `ha_events:${eventType}`;
}

function connect(serverConfigNode) {
  return getHomeAssistant(serverConfigNode);
}

function subscribeToActionEvents(homeAssistant, subscriberId, handler) {
  ACTION_EVENT_TYPES.forEach((eventType, i) => {
    homeAssistant.eventsList[`${subscriberId}::${i}`] = eventType;
    homeAssistant.addListener(actionBusName(eventType), handler);
  });
  if (homeAssistant.isConnected) {
    homeAssistant.subscribeEvents();
  }
}

function unsubscribeFromActionEvents(homeAssistant, subscriberId, handler) {
  ACTION_EVENT_TYPES.forEach((eventType, i) => {
    homeAssistant.removeListener(actionBusName(eventType), handler);
    delete homeAssistant.eventsList[`${subscriberId}::${i}`];
  });
  if (homeAssistant.isConnected) {
    homeAssistant.subscribeEvents();
  }
}

async function sendNotification(homeAssistant, deviceName, serviceData) {
  return homeAssistant.callService('notify', deviceName, serviceData, undefined);
}

// [REV2] Generic service call for the tap-to-perform feature.
async function callAction(homeAssistant, domain, service, data, target) {
  return homeAssistant.callService(domain, service, data, target);
}

async function fetchUsers(homeAssistant) {
  const result = await homeAssistant.send({ type: 'config/auth/list' });
  return Array.isArray(result) ? result : [];
}

function getNotifyTargets(homeAssistant) {
  const services = homeAssistant.getServices() || {};
  return Object.keys(services.notify || {});
}

function getEntities(homeAssistant, prefix) {
  const ids = Object.keys(homeAssistant.getStates() || {});
  return (prefix ? ids.filter((id) => id.startsWith(prefix)) : ids).sort();
}

function getCameraEntities(homeAssistant) {
  return getEntities(homeAssistant, 'camera.');
}

// [REV2] "domain.service" strings for the tap-to-perform service picker.
function getCallableServices(homeAssistant) {
  const services = homeAssistant.getServices() || {};
  const out = [];
  Object.keys(services).forEach((domain) => {
    Object.keys(services[domain] || {}).forEach((service) => out.push(`${domain}.${service}`));
  });
  return out.sort();
}

module.exports = {
  ACTION_EVENT_TYPES,
  actionBusName,
  connect,
  subscribeToActionEvents,
  unsubscribeFromActionEvents,
  sendNotification,
  callAction,
  fetchUsers,
  getNotifyTargets,
  getEntities,
  getCameraEntities,
  getCallableServices,
};
