# Group radio setup

A single-page web app that walks a member of a community group through setting up a LoRa mesh radio (for Meshtastic radios): sign in, plug in, install the radio's software, name the radio, write the group's settings, and check that they took. Everything the page talks to is on its own origin (`/api`, `/firmware`); there is no third-party script, analytics or font.

This is a fork of [meshtastic/web-flasher](https://github.com/meshtastic/web-flasher), which is licensed under the GNU GPL v3 (see `LICENSE`). Upstream copyright and license notices are kept. This project is not affiliated with or endorsed by the Meshtastic project; "Meshtastic" is used only to describe which radios the page works with.

Modified by Turbulent Resistance, 2026-10-31: group setup flow. The upstream flashing wizard, survey, analytics, cookie banner, fastboot, Rockchip and BLE tools were removed.

License: GPL-3.0. The footer of every page shows the commit this build was made from; `/version.json` has the same.

## How it works

| piece | file |
| --- | --- |
| flow state machine | `composables/useSetup.ts` |
| browser gate (Chrome/Edge on a computer) | `utils/browserGate.ts` |
| same-origin API client | `utils/api.ts` |
| per-connection serial transport | `utils/serialTransport.ts`, `utils/meshSession.ts` |
| install firmware (esptool-js, SHA-256 checked first) | `utils/espFlash.ts`, `utils/sha256.ts` |
| build / write / verify group config (transport-agnostic) | `utils/groupSetup.ts` |
| board and name helpers | `utils/board.ts` |
| where the check sends the member (never "install" without evidence) | `utils/checkRoute.ts` |
| countdown arithmetic for the wait screens | `utils/countdown.ts` |
| USB vendor filter for the port picker | `utils/usb.ts` |
| screens | `components/Step*.vue`, `app.vue` |
| wait screen body (progress bar, countdown, "next") and step strip | `components/WaitPanel.vue`, `components/StepStrip.vue` |

Waits are shown with a countdown only when their length is known (a countdown is a promise); progress bars only where there is real progress. The numbers are in `WAIT` in `composables/useSetup.ts`.

The backend is expected to serve `GET /api/site`, `/api/me`, `/api/config`, `POST /api/login/zulip`, `GET /api/login/matrix`, `POST /api/check-uplink` and `/firmware/<version>/<file>`.

## Develop

```bash
pnpm install
pnpm vitest run          # unit tests (pure functions, node environment)
pnpm dev                 # forwards /api, /firmware, /admin to http://127.0.0.1:5000 (BACKEND_URL overrides)
pnpm generate            # static site in .output/public
```

The footer commit comes from `NUXT_PUBLIC_COMMIT`, falling back to `git rev-parse --short HEAD`. `public/version.json` is written at build time.

### Screenshots without a radio

`NUXT_PUBLIC_PREVIEW=1 pnpm generate` makes a local build where `/?preview=<screen>` shows any wait screen with fake state (`utils/preview.ts` lists the names: `install-erase`, `install-firstboot`, `setup-saving`, `verify`, ...). Serve `.output/public` and screenshot at 390 px and desktop width. Never deploy a build made with that variable.

## Hardware spike

`scripts/hw-spike.mjs` runs the same write-and-verify code from Node against a radio on a serial port (needs Node 24 for TypeScript stripping and `serialport`):

```bash
node scripts/hw-spike.mjs --port /dev/ttyACM0 --config config.json --name "Dee Smith" --short DS
```

`config.json` is the `config` object from `/api/config`. Channel keys and the MQTT password are never printed.
