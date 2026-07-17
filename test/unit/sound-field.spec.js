'use strict';

require('should');
const { soundFieldValue } = require('../../resources/sound-field');

describe('sound-field', () => {
  describe('soundFieldValue', () => {
    it('returns customSound when it is a non-empty string (wins over preinstalled)', () => {
      soundFieldValue('my_upload.wav', 'US-EN-Morgan-Freeman-Front-Door-Opened.wav')
        .should.equal('my_upload.wav');
    });

    it('falls back to customSoundPreInstalled when customSound is empty', () => {
      soundFieldValue('', 'US-EN-Morgan-Freeman-Front-Door-Opened.wav')
        .should.equal('US-EN-Morgan-Freeman-Front-Door-Opened.wav');
    });

    it("returns 'default' when both are empty", () => {
      soundFieldValue('', '').should.equal('default');
    });

    it("returns 'default' when both are undefined", () => {
      soundFieldValue(undefined, undefined).should.equal('default');
    });

    it("preserves 'none' from customSound", () => {
      soundFieldValue('none', 'default').should.equal('none');
    });

    it("preserves 'none' from customSoundPreInstalled when customSound empty", () => {
      soundFieldValue('', 'none').should.equal('none');
    });

    it('treats null/non-string inputs as empty', () => {
      soundFieldValue(null, null).should.equal('default');
      soundFieldValue(42, 'US-EN-Alexa-Good-Morning.wav').should.equal('US-EN-Alexa-Good-Morning.wav');
    });
  });
});
