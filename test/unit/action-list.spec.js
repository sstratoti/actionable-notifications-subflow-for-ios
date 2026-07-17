'use strict';

require('should');
const { normalizeActions, applyActionOverrides } = require('../../lib/action-list');

describe('action-list', () => {
  describe('normalizeActions', () => {
    it('returns an empty array for non-array input', () => {
      normalizeActions(undefined).should.eql([]);
      normalizeActions(null).should.eql([]);
      normalizeActions('nope').should.eql([]);
    });

    it('drops entries without a title', () => {
      normalizeActions([{ uri: '/x' }, { title: 'Open' }]).should.have.length(1);
    });

    it('defaults id to the 1-based index when not provided', () => {
      const result = normalizeActions([{ title: 'A' }, { title: 'B' }]);
      result[0].id.should.equal('1');
      result[1].id.should.equal('2');
    });

    it('keeps a custom id when provided', () => {
      const result = normalizeActions([{ title: 'A', id: 'open-door' }]);
      result[0].id.should.equal('open-door');
    });

    it('assigns outputIndex matching array position', () => {
      const result = normalizeActions([{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
      result.map((a) => a.outputIndex).should.eql([0, 1, 2]);
    });

    it('only includes optional properties that were actually set', () => {
      const result = normalizeActions([{ title: 'A', destructive: true }]);
      result[0].should.have.property('destructive', true);
      result[0].should.not.have.property('uri');
    });

    it('carries through all known optional properties when set', () => {
      const raw = {
        title: 'A',
        activationMode: 'background',
        uri: '/open',
        textInputButtonTitle: 'Send',
        textInputPlaceholder: 'Reply...',
        authenticationRequired: true,
        destructive: false,
        behavior: 'textInput',
        icon: 'sfsymbols:lock.open',
      };
      const result = normalizeActions([raw]);
      result[0].should.match(raw);
    });

    it('carries through tap-to-perform target props', () => {
      const raw = {
        title: 'Unlock',
        targetService: 'lock.unlock',
        targetEntityId: 'lock.front_door',
        targetData: { code: '1234' },
      };
      const result = normalizeActions([raw]);
      result[0].targetService.should.equal('lock.unlock');
      result[0].targetEntityId.should.equal('lock.front_door');
      result[0].targetData.should.eql({ code: '1234' });
    });
  });

  describe('applyActionOverrides', () => {
    it('returns actions unchanged when no override matches', () => {
      const actions = normalizeActions([{ title: 'A' }]);
      applyActionOverrides(actions, { nope: { title: 'X' } }).should.eql(actions);
    });

    it('replaces matching fields but keeps id and outputIndex stable', () => {
      const actions = normalizeActions([{ title: 'A', uri: '/old' }]);
      const result = applyActionOverrides(actions, { 1: { title: 'A overridden', uri: '/new' } });
      result[0].id.should.equal('1');
      result[0].outputIndex.should.equal(0);
      result[0].title.should.equal('A overridden');
      result[0].uri.should.equal('/new');
    });

    it('FULLY replaces the action: a config prop absent from the override is dropped', () => {
      const actions = normalizeActions([{ title: 'A', destructive: true, uri: '/old' }]);
      const result = applyActionOverrides(actions, { 1: { title: 'A', uri: '/new' } });
      result[0].should.not.have.property('destructive'); // full replace, not merge
      result[0].uri.should.equal('/new');
    });

    it('retains the original title when the override omits one (avoids dropping the slot)', () => {
      const actions = normalizeActions([{ title: 'Original', destructive: true }]);
      const result = applyActionOverrides(actions, { 1: { uri: '/new' } });
      result[0].title.should.equal('Original');
      result[0].should.not.have.property('destructive');
      result[0].uri.should.equal('/new');
    });

    it('handles a missing or non-object overridesById gracefully', () => {
      const actions = normalizeActions([{ title: 'A' }]);
      applyActionOverrides(actions, undefined).should.eql(actions);
      applyActionOverrides(actions, null).should.eql(actions);
    });
  });
});
