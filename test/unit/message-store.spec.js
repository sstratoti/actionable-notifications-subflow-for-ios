// test/unit/message-store.spec.js
'use strict';

require('should');
const { TTL_MS, pruneStale, recordSent, findMatch, removeMatch } = require('../../lib/message-store');

describe('message-store', () => {
  describe('pruneStale', () => {
    it('keeps entries younger than TTL_MS and drops older ones', () => {
      const now = 1_000_000_000_000;
      const entries = [
        { tag: 'A', deviceName: 'phone', dateCreated: now - TTL_MS + 1000 },
        { tag: 'B', deviceName: 'phone', dateCreated: now - TTL_MS - 1000 },
      ];
      const result = pruneStale(entries, now);
      result.should.have.length(1);
      result[0].tag.should.equal('A');
    });

    it('handles an empty/undefined list', () => {
      pruneStale(undefined, Date.now()).should.eql([]);
    });
  });

  describe('recordSent', () => {
    it('adds a new entry', () => {
      const result = recordSent([], { tag: 'A', deviceName: 'phone', dateCreated: 1000, message: {} });
      result.should.have.length(1);
    });

    it('replaces an existing entry with the same tag+deviceName', () => {
      const existing = [{ tag: 'A', deviceName: 'phone', dateCreated: 1000, message: { v: 1 } }];
      const result = recordSent(existing, { tag: 'A', deviceName: 'phone', dateCreated: 2000, message: { v: 2 } });
      result.should.have.length(1);
      result[0].message.v.should.equal(2);
    });

    it('prunes stale entries while recording a new one', () => {
      const now = 1_000_000_000_000;
      const existing = [{ tag: 'OLD', deviceName: 'phone', dateCreated: now - TTL_MS - 1 }];
      const result = recordSent(existing, { tag: 'NEW', deviceName: 'phone', dateCreated: now });
      result.should.have.length(1);
      result[0].tag.should.equal('NEW');
    });
  });

  describe('findMatch', () => {
    it('finds an entry matching tag and deviceName', () => {
      const entries = [{ tag: 'A', deviceName: 'phone', dateCreated: 1 }];
      findMatch(entries, 'A', 'phone').should.equal(entries[0]);
    });

    it('returns null when nothing matches', () => {
      should(findMatch([], 'A', 'phone')).be.null();
    });
  });

  describe('removeMatch', () => {
    it('removes only the matching entry', () => {
      const entries = [
        { tag: 'A', deviceName: 'phone', dateCreated: 1 },
        { tag: 'A', deviceName: 'tablet', dateCreated: 1 },
      ];
      const result = removeMatch(entries, 'A', 'phone');
      result.should.have.length(1);
      result[0].deviceName.should.equal('tablet');
    });
  });
});
