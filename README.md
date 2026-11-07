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

- **Source:** your GitHub activity (private repos included), only for the repos you pick: PRs (GraphQL), reviews, issues and pushes (Events API).
- **XP:** PR opened 5–30 by size · review 10 · PR merged +15 · issue opened 5 · commit 1 (up to 10 XP a day). Commits are counted per push, only yours (no merge commits), with one extra GitHub request per push.
- **Level and stage** come from the XP since the pet was adopted: Baby → Kid → Young → Adult. Levels scale with your own weekly baseline.
- **Mood** has three states: anxious (a PR has waited 2+ days for review), happy (a PR merged in the last 48 h, or a strong week) and neutral (everything else).
- **Streak:** days in a row with activity, since the pet was adopted. Weekends never break it: a Saturday or Sunday without activity is skipped, one with activity counts. Missing a weekday starts over.
- **Achievements:** 20 of them (first PR, 10 and 50 merges, 100 reviews, a 5-day streak, a PR merged within an hour…), counted from the pet's own history like XP, so what happened before it hatched does not count. Like console trophies, each has a tier (bronze, silver, gold, diamond, or special) worth points (10, 25, 50, 100 and 50: 760 in total). The profile's _Achievements_ tab is the trophy case: the score, the trophies of each tier, the ones closest to unlock, a filter and every achievement as a pixel medal with its progress. Reaching one is recorded in the pet and never lost, travels with the cloud backup, and the pet celebrates it once with a toast. The list, tiers and points live in `src/main/game/catalog.js`.
- XP syncs from the Events API every 90 s (GitHub only returns your latest 300 events, so the app keeps its own per-day history).
- **Review queue:** the open PRs where you (or a team you are in) were asked for a review, in the repos you picked. It refreshes with every sync and when the popover or the menu opens. The wait is counted from when you were asked (directly or through one of your teams, which it names), not from when the PR was opened; when GitHub's history cannot prove the date, the row says how old the PR is instead and does not flag it as late. The pet mentions it and reacts when a new request arrives. Drafts are left out.
- **Notifications:** system notifications (macOS Notification Center) for four things only: someone asks for your review and, on your own PRs, changes requested, failing checks and an approval. Several at once become one notification, the same thing on the same PR is not repeated within 30 minutes, and _Do not disturb_ silences them. Clicking one opens the PR (or the popover when it sums up several). Merges, commits and achievements are left to the pet. The menu bar shows, next to the pet icon, how many PRs wait for your review: it is the standing state, while a notification is an event. Both can be turned off in Settings. (In development they come from "Electron", and macOS asks for permission the first time.)
- **Live reactions:** a `git push` from a local clone of a selected repo is detected instantly (the app watches the clones' reflogs), and your PRs are checked every ~10 s (60 s when idle) so a merge celebrates within seconds.
- XP rules and thresholds live in `src/main/game/catalog.js`.

**Usage:** drag the pet anywhere. Click it: a popover opens with the PRs that wait for your review (_To review_) and your own (_My PRs_). Right-click the pet or click the menu bar icon: a panel with the pet's level, your PRs and the everyday switches (_Show pet on desktop_, _Do not disturb_).

**Settings** (_Settings…_ in the menu): pet size, speech bubbles, the account and repos (_Change…_ reopens the setup), _Back up pet to GitHub_ and _Open at login_ (on by default; on macOS it installs a LaunchAgent in `~/Library/LaunchAgents/com.gitgotchi.app.plist`).

**Backup** (optional, off by default): _Back up pet to GitHub_ keeps a private repo `<you>/gitgotchi-save` in your own GitHub account with one file, `save.json`: the pet (name, species, birth date, stage, achievements), the XP counts per day and kind, and which repos you picked **as ids** (a hash of your account and the repo name). It has no repo names, PR titles or code. The ids keep the names from being read at a glance; they are not encryption, so whoever can guess a name can check it. On another computer, the setup offers to restore the save and finds your repos again among the ones you can see (one that you can no longer see, or that is not among your 300 most recently pushed, is left out: pick it again). Turning the backup off stops syncing but leaves the repo; delete it on GitHub to remove it (the app cannot delete repos). Saves written before the ids existed had the repo names, and they stay in the repo's history: delete the repo and turn the backup on again to get rid of them.

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
    game/achievements.js    achievement progress (pure)
    services/session.js     GitHub connection via `gh`
    services/pet-service.js sync, setup and pet events
    ui/                     windows and tray
  preload/preload.js        safe API exposed to pages
  renderer/
    shared/                 retro theme, DOM helpers, sprites, pet animation (pet-animator.js is the pack's player)
    pet/                    floating pet window
    settings/               preferences window
    onboarding/             3-step onboarding (one module per step)
```

## Sprites

Eight creature lines with four stages each live in `assets/pets/`: the static rest poses (`<id>_<k>.png`, plus `_happy` and `_anxious`), `sprites.json` (names, sizes and shadow ellipses), and for the animations `sheets/` (14 frames × 3 moods per stage, with the shadow as its own layer), `fx/` (hearts, sparkles, sweat drops, dust and each line's ambient particle) and `animations.json` (timings, lift per frame, facing and effect anchors). English copy per line is in `src/main/game/catalog.js`.

The desktop pet is animated by `src/renderer/shared/pet-animator.js`, copied verbatim from the pack's reference player (do not edit it; update it from a newer pack). `pet/pet-view.js` draws it on a canvas at a whole-number scale with nearest-neighbor filtering and decides when it moves: an idle loop with blinks; a short stroll every 20–60 s; a cheer when a PR of yours is merged or approved (or you earn an achievement), followed by a burst of hearts and sparkles for a few seconds and a spell of being happy; sweat and shivers when anxious. A happy pet is otherwise quiet: it can stay happy for days, so hearts are a reaction and not a state. With _Do not disturb_ or macOS _Reduce motion_ the pet only idles. The popover, profile and onboarding use the static poses.

## Scripts

- `npm run dev`: run with live reload (UI changes reload the windows, main process changes restart the app)
- `npm start`: run the app
- `npm run format` / `npm run lint`: Prettier
- `npm run shots [-- profile popover panel settings evolution pet] [--light] [--mine] [--tab achievements] [--tall] [--celebrate] [--fresh] [--complete] [--click selector]`: renders the windows with sample data to PNG files (path printed) and flags cards that overflow. Use it to check a UI change by eye
- `npm test`: unit tests (Node built-in runner, files in `test/`)
