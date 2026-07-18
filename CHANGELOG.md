# Changelog

## 1.0.0 (unreleased)

Initial release of `node-red-contrib-ha-ios-notification`, replacing the
`iOS Actionable Notification v2` Node-RED subflow.

### Added
- Native Node-RED node (was a subflow) — installable via npm / palette manager.
- HA entity/service pickers for notify targets, camera entity, and
  tap-to-perform action targets — no more hand-typed HA identifiers.
- Dynamic action outputs (one per configured action, 0-10) replacing the
  fixed 10-output/10-JSON-field layout.
- Per-node-instance state (`node.context()`) replacing global flow-context
  tracking — safe with multiple node instances in one flow.
- Dual action-event support: `mobile_app_notification_action` (current) +
  legacy `ios.notification_action_fired`, normalized to `msg.actionId`.
- Badge control: `data.push.badge` field and the `clear_badge` command
  (`msg.clearBadge = true`).
- `presentation_options` (foreground alert/badge/sound control).
- Tap-to-perform: an action can call an HA service directly on tap
  (`targetService` / `targetEntityId` / `targetData`).
- Live Activities / Live Updates (`live_update` mode: progress, chronometer,
  colors) — start/update by sending, end via the clear path with the same tag.
- Configurable per-device send stagger (default 1000 ms), replacing v2's
  ad-hoc canvas delay nodes.
- `node.error()` on Home Assistant call failures (v2 failed silently), and
  per-send tracking persistence so a mid-fan-out failure can't drop a
  delivered device from state.
- Automated test suite (Mocha unit tests + node-red-node-test-helper
  integration tests), including a two-instance isolation test.
- Config-panel completion & polish: `categoryName` field (emits
  `data.push.category`); per-action `icon` field; per-action text-input fields
  (`behavior`, `textInputButtonTitle`, `textInputPlaceholder`); per-action
  `targetData` drill-down JSON editor for tap-to-perform parameters; a Live
  Activity "Beta" badge with a TestFlight-required note; and config-panel layout
  fixes (default target row, "Actionable Buttons" label wrap, checkbox
  alignment, clickable combo caret).

### Changed
- Action override keys (`msg.notificationOverride.actions`) are now keyed by
  a stable action `id` instead of a 1-10 `actionOutput` number.
- Media override URL / lazy flag emit under `data.attachment.*` (documented
  structure) instead of top-level `data.contentUrl` / `data.lazy`; `content-type`
  is newly exposed.
- Action overrides fully replace an action slot (a prop absent from the
  override is dropped), matching v2 exactly.
- Send stagger defaults to 1000 ms (v2 ≈ 5 s always-on); set `0` to disable.
- No pre-routing sequencing delay on auto-clear (v2 waited ~10 s).
- See the README's migration section for all behavior changes.

### Unchanged (compatible with v2)
- `msg.notificationOverride` three-tier override precedence, including
  explicit empty-string overrides (nullish semantics).
- `msg.clear = true` manual clear behavior.
- Auto-clear-on-action behavior.
- User-info enrichment on action received.
- Config field names for Basics/Map/Media/Advanced.
