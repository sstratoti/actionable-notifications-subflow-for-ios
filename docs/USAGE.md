# Usage

This covers the node's message inputs/outputs, the config-override system,
and a field-by-field reference. For a shorter walkthrough, see the
[README](../README.md)'s Quick Start; for install steps, see
[INSTALLATION.md](INSTALLATION.md).

## Inputs

The node has a single input. What it does depends on which flag is set on
the incoming `msg`, checked in this order:

| `msg` field | Behavior |
|---|---|
| `msg.clearBadge = true` | Silently zero the app-icon badge on each target device (no notification shown). |
| `msg.clear = true` | Send a clear-notification to each target device, using the configured/overridden tag. |
| `msg.liveActivity = true` (or the node's Live Activity config is on) | Send a Live Activity (`live_update`) payload instead of a standard notification. |
| *(none of the above)* | Send a standard actionable notification using the node's configured fields, with `msg.notificationOverride` applied. |

Any plain `msg` (even `{ payload: {} }`) triggers a send using the node's
configured Basics/Targets/Actions/Map/Media fields.

## Outputs

One output per configured action, in the order shown in the editor's
**Actions** list — configuring 3 actions gives the node 3 outputs. A tapped
action fires **only** on the output matching that action, and **only** when
the tap belongs to a notification this specific node instance sent (matched
by tag + device against this node's own tracked state) — a different node
instance's identically-tagged notification will never route here. That
isolation is the node's core design property; see
[TESTING.md](TESTING.md) for how it's verified.

The output message carries:

| Field | When present |
|---|---|
| `msg.payload` | The raw HA action event. |
| `msg.actionId` | The normalized action id that fired (works for both the modern and legacy HA event shapes). |
| `msg.matchedMessage` | The original message this node sent that the action belongs to, if traceable. |
| `msg.userData` | The Home Assistant user record for whoever tapped, if **Populate user information** is enabled. |
| `msg._debug` | The matched tag/device and raw event, if **Debug mode** is enabled. |

## Overriding per-call with `msg.notificationOverride`

Send `msg.notificationOverride` to change any configured field for a single
call, without redeploying the node:

```js
msg.notificationOverride = {
  notificationBase: { title: 'Front Door', message: "Someone's here", tag: 'front-door' },
  services: [{ deviceName: 'my_iphone' }],
};
return msg;
```

**Precedence, highest to lowest:**

1. A per-service override — `services[].serviceOverride` (set at design time
   via the picker's per-device expand, or supplied dynamically in
   `msg.notificationOverride.services[].serviceOverride`)
2. `msg.notificationOverride` (the global override for this call)
3. The node's configured defaults

Most fields use **nullish precedence** — an override value of `''` (empty
string) is honored as an explicit "clear this field," rather than falling
through to the next tier. The one exception is the sound chain
(`customSound`/`customSoundPreInstalled`), which uses `||` semantics
(`''` is treated as absent). `tag` never accepts a per-service override — it
is shared across every device a single send fans out to, so devices agree on
what to clear/dedup against.

`notificationOverride` shape:

```js
{
  tag: 'string',                       // no per-service override
  services: [{ deviceName, serviceOverride: { notificationBase, map, media, actions } }],
  notificationBase: { title, subtitle, message, url, cameraEntity, interruptionLevel, group, badge, presentationOptions },
  map: { firstLatitude, firstLongitude, secondLatitude, secondLongitude, showLineBetweenPoints, showCompass, showPointsOfInterest, showScale, showTraffic, showUserLocation },
  media: { contentUrl, contentType, imagePath, videoPath, audioPath, lazyLoading, hideThumbnail },
  actions: { '<action-id>': { /* full replacement action object, see below */ } },
}
```

## Action overrides are a full replace, not a merge

`notificationOverride.actions` is keyed by each action's `id` (the id shown
in the editor's Actions list — auto-assigned `"1"`, `"2"`, `"3"`... in
editor order unless you set a custom one). **Overriding an action id
replaces the whole action object for that id** — any configured property
not included in the override (e.g. `destructive: true`) is dropped, not
merged. If you only want to change the title, include every property you
still want to keep:

```js
msg.notificationOverride = {
  actions: {
    '1': { title: 'New Title', uri: '/still-here', destructive: true },
  },
};
```

Node-RED fixes a node's output count at deploy time, so an override can
never target an action id that doesn't correspond to a configured, deployed
action slot.

## Clearing notifications

- **Manually:** `msg.clear = true`, optionally with
  `msg.notificationOverride.tag`/`services` to target something other than
  the node's configured defaults.
- **Automatically on action:** enable **Clear on other devices when
  actioned** — when one device's action is tapped, the same tagged
  notification is cleared from every *other* configured device. The firing
  device's own tracking entry is always removed (so a duplicate/late event
  for the same tag+device can't re-fire routing); the other devices' entries
  are only removed when this option is on, so they stay independently
  actionable when it's off.
- **Badge only:** `msg.clearBadge = true` zeroes the badge without touching
  any notification.

## Actionable buttons and tap-to-perform

Each entry in the **Actions** list becomes a real output. Optionally, give
an action a **tap-to-perform** target (a service picker + entity picker) —
when that button is tapped, the node calls the HA service directly (in
addition to emitting on the action's output), so a lock/switch/scene toggle
doesn't need a separate flow wired off the output.

## Field reference

### Basics
`Name`, `Title`, `Subtitle`, `Message`, `Group`, `Tag` (auto-generated if
left blank), `Notification URL`.

### Targets
`Notify Devices` (multi-select picker, populated from your HA server's
`notify.mobile_app_*` services), `Camera Entity` (free-text with
autocomplete suggestions from `camera.*` entities).

### Actions
Per-action: `Title`, `id` (optional, auto-assigned from list order if
blank), `Activation Mode` (foreground/background), `URI`, `Destructive`,
`Requires auth`, and optional tap-to-perform `Service` + `Target entity`
fields.

### Map
`Latitude`/`Longitude` for up to two pins, plus display flags: line between
points, compass, points of interest, scale, traffic, user location. A
second pin (and its display flags) only appears in the payload once both
pins' coordinates are set.

### Media
`Image Path`, `Video Path`, `Audio Path`, `Content URL` (overrides the
path fields), `Content Type`, `Load media lazily`, `Hide thumbnail`.

### Advanced
`Sound (bundled)` — dropdown of the ~127 sounds bundled with the HA
Companion App; `Custom Sound` — free text, overrides the dropdown (for
uploaded custom `.wav` sounds or referenced iOS system `.caf` sounds — see
the README's **Sounds** section for the exact upload format);
`Interruption Level`; `Populate user information`; `Clear on other devices
when actioned`; `Stagger between sends` (ms, default 1000 — set to `0` to
disable); `Debug mode`; `Badge count`; `Foreground presentation` (alert /
badge / sound checkboxes).

### Live Activity (iOS 17.2+, HA Core 2026.7+)
`Send as a Live Activity`, `Progress`/`Max`, `Chronometer` + `when` +
`relative`, `Icon`/`Icon color`, `Accent`/`Background`/`Text color`. When
enabled, sending re-sends the same tag to update the activity; clearing
(via `msg.clear`) ends it.

## Example flows

Four importable examples ship with the package (`examples/`) and appear in
Node-RED's built-in **Import → Examples** browser once installed: a basic
send, a send with actionable buttons, a manual clear, and a multi-device
fan-out. Import one as a starting point rather than building from scratch.
