# Gitgotchi

A pixel art pet that lives on your desktop, floats above every window, and evolves with your GitHub activity (private repos included).

## Setup

Requires the [GitHub CLI](https://cli.github.com) logged in (`gh auth login`). The app reuses that login: nothing to register, no tokens stored.

With several `gh` accounts logged in on github.com, onboarding lets you pick one; its token is used via `gh auth token --user`, and gh's active account is never switched.

Set `GITGOTCHI_GH_PATH` to use a `gh` binary outside the usual locations. Pointing it to `/usr/bin/false` simulates being logged out.

```sh
npm install
npm run dev   # auto-reloads on changes
```

## How it works

- **Source:** your GitHub activity (Events API, private repos included), only for the repos you pick.
- **Points:** push 1 · PR opened 4 · PR merged 3 · review 3 · comment 1 · issue 2.
- **XP** = points since the pet was adopted. It sets the stage: Baby → Kid → Teen → Adult. Thresholds scale with your own weekly baseline.
- **Mood** has three states: anxious (a PR has waited 2+ days for review), happy (a PR merged in the last 48 h, or a strong week) and neutral (everything else).
- XP syncs from the Events API every 90 s (GitHub only returns your latest 300 events, so the app keeps its own per-day history).
- **Live reactions:** a `git push` from a local clone of a selected repo is detected instantly (the app watches the clones' reflogs), and your PRs are checked every ~10 s (60 s when idle) so a merge celebrates within seconds.
- Points and thresholds live in `src/main/game/catalog.js`.

**Usage:** drag the pet anywhere. Click: it talks. Right-click the pet or click the menu bar icon: a panel with the pet's level, your PRs and the everyday switches (_Show pet on desktop_, _Do not disturb_).

**Settings** (_Settings…_ in the menu): pet size, speech bubbles, the account and repos (_Change…_ reopens the setup), _Back up pet to GitHub_ and _Open at login_ (on by default; on macOS it installs a LaunchAgent in `~/Library/LaunchAgents/com.gitgotchi.app.plist`).

## Structure

```
src/
  main/                     main process (Node)
    main.js                 app lifecycle and wiring
    config.js               constants
    store.js                local JSON state
    ipc.js                  IPC contract (mirrors preload.js)
    github/gh-cli.js        token from the `gh` CLI
    github/client.js        GitHub REST API
    game/catalog.js         species, stages, scoring
    game/engine.js          pure game rules (no I/O)
    services/session.js     GitHub connection via `gh`
    services/pet-service.js sync, setup and pet events
    ui/                     windows and tray
  preload/preload.js        safe API exposed to pages
  renderer/
    shared/                 retro theme, DOM helpers, sprites
    pet/                    floating pet window
    settings/               preferences window
    onboarding/             3-step onboarding (one module per step)
```

## Sprites

Eight creature lines with four stages each live in `assets/pets/` (1x PNGs plus `sprites.json` from the sprite tool: names, sizes and shadow ellipses). English copy per line is in `src/main/game/catalog.js`. `src/renderer/shared/sprite.js` draws them nearest-neighbor, aligned on the shadow so every stage stands on the same floor.

## Scripts

- `npm run dev`: run with live reload (UI changes reload the windows, main process changes restart the app)
- `npm start`: run the app
- `npm run format` / `npm run lint`: Prettier
- `npm test`: unit tests (Node built-in runner, files in `test/`)
