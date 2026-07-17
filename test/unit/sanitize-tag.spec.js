'use strict';

require('should');
const { safeString, randomSuffix, sanitizeTag } = require('../../lib/sanitize-tag');

describe('sanitize-tag', () => {
  describe('safeString', () => {
    it('strips punctuation and collapses whitespace to underscores, uppercased', () => {
      safeString('front door: opened!').should.equal('FRONT_DOOR_OPENED');
    });

    it('returns empty string for undefined', () => {
      safeString(undefined).should.equal('');
    });

    it('returns empty string for null', () => {
      safeString(null).should.equal('');
    });

    it('coerces numbers to strings', () => {
      safeString(42).should.equal('42');
    });
  });

  describe('randomSuffix', () => {
    it('defaults to 6 uppercase alphanumeric characters', () => {
      randomSuffix().should.match(/^[A-Z0-9]{6}$/);
    });

    it('respects a custom length', () => {
      randomSuffix(10).should.match(/^[A-Z0-9]{10}$/);
    });
  });

  describe('sanitizeTag', () => {
    it('returns the sanitized raw tag when provided', () => {
      sanitizeTag('front door', 'Some Title').should.equal('FRONT_DOOR');
    });

    it('falls back to TITLE_<random> when rawTag is empty', () => {
      sanitizeTag('', 'Garage Alert').should.match(/^GARAGE_ALERT_[A-Z0-9]{6}$/);
    });

    it('falls back to NOTIFY_<random> when both rawTag and title are empty', () => {
      sanitizeTag('', '').should.match(/^NOTIFY_[A-Z0-9]{6}$/);
    });
  });
});
