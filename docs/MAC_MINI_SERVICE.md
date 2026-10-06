# Mac mini production service

The Mac mini runs the built Next.js server as the per-user launch agent `com.holtserver.bedtime-companion`.

## Routine code update

```bash
cd "/Users/holtserver/Documents/Bedtime Companion"
npm install
npm run check
./scripts/deploy-mac-server.sh
launchctl kickstart -k gui/$(id -u)/com.holtserver.bedtime-companion
```

`npm run check` creates a standalone production build after linting, type-checking, and tests. The deploy script copies it to `~/Library/Application Support/Bedtime Companion`, outside macOS's protected Documents folder. The launch agent restarts that build on port 3000.

## Status and logs

```bash
launchctl print gui/$(id -u)/com.holtserver.bedtime-companion
tail -f "$HOME/Library/Application Support/Bedtime Companion/logs/mac-server.log" "$HOME/Library/Application Support/Bedtime Companion/logs/mac-server.error.log"
curl http://localhost:3000/api/health/ready
```

## Stop and start

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.holtserver.bedtime-companion.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.holtserver.bedtime-companion.plist
```

This is a LaunchAgent, so it starts when the `holtserver` account logs in. A future always-on deployment can move it to a root-managed LaunchDaemon if the Mac must serve before any user login.
