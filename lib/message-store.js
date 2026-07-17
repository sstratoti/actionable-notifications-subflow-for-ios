// lib/message-store.js
'use strict';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours, matches v2

function pruneStale(entries, now) {
  return (entries || []).filter((e) => now - e.dateCreated < TTL_MS);
}

function recordSent(entries, entry) {
  const pruned = pruneStale(entries, entry.dateCreated);
  const filtered = pruned.filter((e) => !(e.tag === entry.tag && e.deviceName === entry.deviceName));
  filtered.push(entry);
  return filtered;
}

function findMatch(entries, tag, deviceName) {
  return (entries || []).find((e) => e.tag === tag && e.deviceName === deviceName) || null;
}

function removeMatch(entries, tag, deviceName) {
  return (entries || []).filter((e) => !(e.tag === tag && e.deviceName === deviceName));
}

module.exports = { TTL_MS, pruneStale, recordSent, findMatch, removeMatch };
