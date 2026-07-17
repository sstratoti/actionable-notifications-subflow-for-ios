// Single-sourced across the runtime/editor boundary: CommonJS for the Mocha
// test, and window.haIosSoundField for the Node-RED editor (which loads this
// file via <script src="resources/node-red-contrib-ha-ios-notification/sound-field.js">).
// EDITOR-ONLY LOGIC — the node runtime never calls this.
(function (root) {
  'use strict';

  // Resolve the single value shown in the merged Sound field from the two
  // legacy config keys. customSound (free text) wins when set; else the
  // formerly-dropdown customSoundPreInstalled; else 'default'.
  function soundFieldValue(customSound, customSoundPreInstalled) {
    if (typeof customSound === 'string' && customSound !== '') return customSound;
    if (typeof customSoundPreInstalled === 'string' && customSoundPreInstalled !== '') {
      return customSoundPreInstalled;
    }
    return 'default';
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { soundFieldValue };
  } else {
    root.haIosSoundField = { soundFieldValue: soundFieldValue };
  }
})(typeof window !== 'undefined' ? window : this);
