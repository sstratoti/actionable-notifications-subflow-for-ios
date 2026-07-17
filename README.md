# node-red-contrib-ha-ios-notification

Native Node-RED node for sending actionable iOS notifications through the Home
Assistant iOS Companion App, with entity/service pickers instead of hand-typed
HA identifiers. Successor to the `iOS Actionable Notification v2` subflow
(kept for reference in `legacy-subflow/`).

## Requirements

- Node-RED 3.x, Node.js >= 18
- [`node-red-contrib-home-assistant-websocket`](https://flows.nodered.org/node/node-red-contrib-home-assistant-websocket)
  >= 0.70.0, with a configured `server` connection to your Home Assistant instance
- Home Assistant iOS Companion App on each target device, with actionable
  notifications configured

## Install

```
npm install node-red-contrib-ha-ios-notification
```

Or via the Node-RED editor: Menu → Manage palette → Install → search
`ha-ios-notification`.

## Quick start

1. Drag the **HA iOS Notification** node onto the canvas, connect it to your
   HA server config.
2. In **Targets**, check the devices to notify (populated from your HA
   `notify.*` services — no manual typing).
3. Set **Title**/**Message** under Basics.
4. Wire an inject node into the input and deploy — a plain `msg.payload = {}`
   triggers a send using the node's configured fields.

## Sending with overrides

Send `msg.notificationOverride` to override any configured field per-call,
without redeploying the node:

```js
msg.notificationOverride = {
  notificationBase: { title: "Front Door", message: "Someone's here" },
  services: [{ deviceName: "my_iphone" }],
};
return msg;
```

Precedence: per-service override (inside a `services[].serviceOverride`) >
`msg.notificationOverride` > the node's configured defaults.

## Clearing notifications

- **Manually:** send `msg.clear = true` (optionally with
  `msg.notificationOverride.tag`/`services`) into the same input.
- **Automatically on action:** enable "Clear on other devices when actioned"
  in Advanced — when one device's action is tapped, the same tagged
  notification is cleared from every other configured device.

## Actionable buttons

Configure buttons under **Actions** — each gets its own output, in the order
shown in the editor. When a button is tapped, the matching output fires with
the raw HA event as `msg.payload` and (if the original send matched by tag +
device) the original sent message as `msg.matchedMessage`.

## Sounds

The "Sound (bundled)" dropdown under Advanced lists the Home Assistant iOS
Companion App's pre-installed notification sounds (Alexa, Daisy, and Morgan
Freeman voice packs — 127 `.wav` files), verified against the
[companion app docs](https://companion.home-assistant.io/docs/notifications/notification-sounds).

To use a sound outside that list, set **Custom Sound** (free text, overrides
the dropdown):

- A **custom uploaded sound** must be a **32-bit float, 48000 Hz `.wav`** file
  uploaded to the Companion App per its documentation.
- An imported iOS **system** sound (`.caf`) can also be referenced by name.

## Migrating from the v2 subflow

Config field names and `msg.notificationOverride` shape are unchanged from
the v2 subflow, with one adjustment: actions are now identified by a stable
`id` (defaults to `"1"`, `"2"`, `"3"`... in the order you define them in the
editor, matching the old `actionOutput` numbers if you migrate actions in the
same order) instead of an `actionOutput` number. To swap an existing subflow
instance:

1. Add this node to the flow, pointed at the same HA server.
2. Recreate the subflow instance's env values as this node's config fields
   (same names) — check the Targets/Camera Entity pickers instead of
   retyping the old JSON.
3. Recreate the old `actionNjson` blobs as entries in the Actions list.
4. Re-wire the outputs (order-preserving if actions were migrated in order).
5. Delete the old subflow instance.

No changes are needed to anything sending `msg.notificationOverride` into the
old subflow, unless it overrides `actions` by `actionOutput` number — update
those keys to match the new action `id`s.

### Behavior changes from v2 to note

- **Action event:** the node now listens for both `mobile_app_notification_action`
  (current) and the legacy `ios.notification_action_fired` — no action needed, but
  new setups are future-proof.
- **Media keys:** the override URL and lazy flag now emit under
  `data.attachment.url` / `data.attachment.lazy` (the documented structure) instead
  of v2's top-level `data.contentUrl` / `data.lazy`. If you built payloads by hand
  expecting the old keys, update them; via this node's config, it's automatic.
- **Send stagger** defaults to **1000 ms** between per-device sends (v2 effectively
  throttled ~5 s). Set "Stagger between sends" to `0` to disable, or raise it.
- **Auto-clear sequencing delay:** v2 waited ~10 s before routing an action when
  clear-on-action was set; this node routes immediately (no delay).

### New capabilities beyond v2

Badge (`push.badge`) + `clear_badge` command, `presentation_options`, tap-to-perform
action targets (call an HA service on tap), and **Live Activities** (`live_update`
mode) — see the in-editor help and the sections above.

## Configuration reference

See the in-editor help panel (info tab) for the full field-by-field
reference, or `docs/superpowers/specs/2026-07-16-native-node-design.md` for
the complete design rationale.

## Development

```
git clone https://github.com/sstratoti/actionable-notifications-subflow-for-ios
cd actionable-notifications-subflow-for-ios
npm install
npm test
```

See `CHANGELOG.md` for release history.

## License

MIT
