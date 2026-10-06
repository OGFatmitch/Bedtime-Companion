# Raspberry Pi 3 Bedroom Node Bring-Up

Bring up one subsystem at a time. Do not assemble the final enclosure until duplex audio, GPIO selection, LED signaling, heat, and power are proven together.

## Before wiring

Record the exact part numbers for the microphone, MAX98357A board, speaker, NeoPixel board, power supply, and any level shifter. The Pi 3 uses micro-USB power; a USB-C enclosure connector needs an intentional adapter or power design.

Confirm a pin plan that accounts for:

- shared I2S clocks and compatible input/output device-tree overlays;
- the NeoPixel backend and its GPIO restrictions;
- button pull-up/pull-down behavior;
- common ground, amplifier power, peak LED current, and speaker rating;
- a 3.3 V-to-5 V level shifter if required by the NeoPixel wiring and cable length.

Do not wire from placeholder GPIO examples.

## Base operating system

1. Install the current Raspberry Pi OS Lite image appropriate for the Pi 3.
2. Set a unique hostname, enable SSH, create a non-default admin account, and join the home Wi-Fi.
3. Update packages, verify time synchronization, and reserve the Pi address in the router if practical.
4. Confirm the Mac server is reachable from the intended bedside location.
5. Run the client as the unprivileged `bedtimecompanion` user, with its cache under `data/pi-client-cache`.

## Hardware sequence

1. **Speaker only:** enable the intended output overlay and play a known WAV at low volume.
2. **Microphone only:** record a short mono WAV and inspect/play it on another device.
3. **Duplex I2S:** prove input and output enumerate and operate together after reboot.
4. **One button:** prove clean press/release edges and software debounce; then add the remaining controls.
5. **NeoPixel:** begin at a very low brightness, verify logic levels and power, and render static colors before animations.
6. **Combined load:** play audio while LEDs animate and buttons are pressed. Check voltage stability, audio noise, temperature, and reboot behavior.
7. **Clean shutdown:** implement the three-second power hold as an OS shutdown request before considering any hard power cut.

## Run the protocol client

Clone or copy the application to `/opt/bedtime-companion`, install production dependencies, and create `/etc/bedtime-companion.env` from `apps/pi-client/config.example.env`.

Initially run the simulator on the Pi itself:

```bash
cd /opt/bedtime-companion
npm run dev:pi-sim
```

From the Mac adult UI, queue a device test. The Pi should authenticate, download and checksum the WAV, simulate playback, acknowledge the command, and report completion. Inspect `data/pi-simulator-cache/client-state.json` to confirm the command cursor survives a restart.

Only after this succeeds should simulated player/button/light adapters be replaced with real Linux adapters.

## Acceptance checks

- Ten consecutive connection-test sessions complete.
- Restarting the client does not replay an acknowledged command.
- Duplicate events are accepted without applying their effect twice.
- A corrupt cached file is discarded and downloaded again.
- Disconnecting Wi-Fi does not corrupt local state.
- No OpenAI key exists on the Pi.
- The microphone remains unopened until interactive mode explicitly requests listening.
