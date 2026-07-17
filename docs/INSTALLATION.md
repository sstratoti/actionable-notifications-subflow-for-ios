# Installation

## Requirements

- **Node-RED 3.x**, running on **Node.js >= 18**
- [`node-red-contrib-home-assistant-websocket`](https://flows.nodered.org/node/node-red-contrib-home-assistant-websocket)
  `>= 0.70.0`, already installed in the same Node-RED instance, with at least
  one configured `server` node pointing at your Home Assistant instance. This
  node depends on it (as a `peerDependency`) for the HA connection, entity
  pickers, and event stream — it is not bundled.
- The **Home Assistant iOS Companion App** installed on each target device,
  with notifications enabled and the device already showing up under
  `notify.mobile_app_*` in Home Assistant.

## Install via the Node-RED editor (recommended)

1. Menu (top-right) → **Manage palette** → **Install** tab.
2. Search for `ha-ios-notification`.
3. Click **Install** on `node-red-contrib-ha-ios-notification`.
4. The **HA iOS Notification** node appears in the palette under the
   `home_assistant` category once installed — no restart needed.

## Install via npm

From your Node-RED user directory (typically `~/.node-red`, or wherever your
Node-RED instance's `package.json` lives):

```bash
cd ~/.node-red
npm install node-red-contrib-ha-ios-notification
```

Restart Node-RED (or redeploy, if your setup hot-reloads installed nodes) for
the new node to appear in the palette.

### Docker / containerized Node-RED

If Node-RED runs in a container with a persistent `data` volume, run the
install from inside that container (or against the mounted volume's
`package.json`), then restart the container:

```bash
docker exec -it <node-red-container> npm install node-red-contrib-ha-ios-notification
docker restart <node-red-container>
```

Exact paths and commands depend on your Docker setup — the key requirement is
that the install happens in the same `node_modules` Node-RED itself loads
from (its user directory), not an unrelated location.

## Verifying the install

After restarting, drag a node onto the canvas: it should appear in the
palette under **home_assistant** as **HA iOS Notification**. Open it — the
**HA Server** field should offer your existing `server` config node(s) from
`node-red-contrib-home-assistant-websocket`. If the Targets/Camera
Entity/tap-to-perform pickers come back empty even with a server selected,
confirm that server's connection is actually established (green dot in its
own config, not just present in the dropdown) — the pickers query HA live via
admin endpoints this node registers, and return an empty list (never an
error) when the HA connection isn't up yet.

## Upgrading

Same as install — via **Manage palette** → **Installed** tab → find the node
→ **Update**, or `npm update node-red-contrib-ha-ios-notification` in the
Node-RED user directory. Check `CHANGELOG.md` for behavior changes between
versions before upgrading a production flow.

## Migrating from the `iOS Actionable Notification v2` subflow

If you're moving from the original hand-built subflow rather than installing
fresh, see the **Migrating from the v2 subflow** section in the main
[README](../README.md) — it covers the compatible config-field mapping and
the specific behavior changes to account for (media key placement, default
send stagger, and the dropped auto-clear sequencing delay).

## Uninstalling

**Manage palette** → **Installed** → find `ha-ios-notification` → **Remove**,
or `npm uninstall node-red-contrib-ha-ios-notification` from the Node-RED
user directory. Existing node instances in your flows will show as "missing
type" until removed or the package is reinstalled — export/back up any flows
using this node before uninstalling if you might need them again.
