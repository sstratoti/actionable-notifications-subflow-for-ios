'use strict';

// Props emitted into the iOS notification action payload (data.data.actions[]).
const IOS_ACTION_PROPS = [
  'activationMode',
  'uri',
  'textInputButtonTitle',
  'textInputPlaceholder',
  'authenticationRequired',
  'destructive',
  'behavior',
  'icon',
];

// Node-side-only props for the tap-to-perform feature — NEVER emitted to iOS.
const TAP_TARGET_PROPS = ['targetService', 'targetEntityId', 'targetData'];

const ALL_ACTION_PROPS = [...IOS_ACTION_PROPS, ...TAP_TARGET_PROPS];

function normalizeActions(rawActions) {
  if (!Array.isArray(rawActions)) return [];

  return rawActions
    .map((action, index) => {
      if (!action || typeof action !== 'object' || !action.title) return null;

      const id =
        action.id !== undefined && action.id !== null && action.id !== ''
          ? String(action.id)
          : String(index + 1);

      const normalized = { id, title: action.title, outputIndex: index };

      ALL_ACTION_PROPS.forEach((prop) => {
        if (action[prop] !== undefined) {
          normalized[prop] = action[prop];
        }
      });

      return normalized;
    })
    .filter(Boolean);
}

// Full-replace semantics (matches v2): the override supplies the WHOLE action content
// for its id. Props absent from the override are dropped, not merged from the base.
// id and outputIndex stay stable; title falls back to the base only if the override
// omits it, so a slot is never dropped mid-list (which would shift dynamic outputs).
function applyActionOverrides(normalizedActions, overridesById) {
  if (!overridesById || typeof overridesById !== 'object') return normalizedActions;

  return normalizedActions.map((action) => {
    const override = overridesById[action.id];
    if (!override || typeof override !== 'object') return action;

    const replaced = {
      id: action.id,
      outputIndex: action.outputIndex,
      title: override.title !== undefined && override.title !== null && override.title !== ''
        ? override.title
        : action.title,
    };
    ALL_ACTION_PROPS.forEach((prop) => {
      if (override[prop] !== undefined) replaced[prop] = override[prop];
    });
    return replaced;
  });
}

module.exports = { normalizeActions, applyActionOverrides, IOS_ACTION_PROPS, TAP_TARGET_PROPS };
