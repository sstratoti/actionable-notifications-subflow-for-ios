'use strict';

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function safeString(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, '_')
    .toUpperCase();
}

function randomSuffix(length = 6) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHANUMERIC[Math.floor(Math.random() * ALPHANUMERIC.length)];
  }
  return out;
}

function sanitizeTag(rawTag, fallbackTitle) {
  const cleaned = safeString(rawTag);
  if (cleaned) return cleaned;
  const titlePart = safeString(fallbackTitle) || 'NOTIFY';
  return `${titlePart}_${randomSuffix()}`;
}

module.exports = { safeString, randomSuffix, sanitizeTag };
