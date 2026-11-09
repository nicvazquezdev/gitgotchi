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
- **XP:** PR opened 5–30 by size · review 10 (+5 more when it answers a request within an hour) · PR merged +15 · issue opened 5 · commit 1 (up to 10 XP a day). Commits are counted per push, only yours (no merge commits), with one extra GitHub request per push. A review is _fast_ when it comes within an hour of the date you were asked (see the review queue below); the app remembers the requests it saw until you review them, so a review of a request it never saw is a normal one.
- **Level and stage** come from the XP a pet has earned: Baby → Kid → Young → Adult. Levels scale with your own weekly baseline, and a pet never goes down a level or a stage. Every level up gets a pill over the pet (_Level 10_), and the XP that arrives floats up as _+10 XP_.
- **Collection:** you keep every pet you hatch, one per species (eight lines to collect), and raise one at a time: only the **active** pet earns XP. Switching is free and nothing is lost: a pet that waits keeps its XP, level and stage. New XP goes to whichever pet is active when the app sees it (to the active pet if the app was closed; changing repos never takes XP away from a pet, and it cannot be farmed). Each pet keeps its XP per day, so two computers merge them with a max per day. The _Pets_ tab of the card is a grid: a card per species (the silhouette of the ones you have not hatched) and, under it, what you can do with the selected one: _Switch to …_, _Hatch …_ (with a name) and a pencil to rename. When you switch or hatch, the new pet grows out of a flash on the desktop and says that it earns the XP now. A pet that reaches the last stage is fully grown (a gold frame and a trophy) and keeps leveling if you leave it active; hatching all eight and growing them all up is the goal after level 18.
- **Mood** has two states: happy (a PR merged in the last 48 h, or a strong week) and neutral (everything else). The pet is never anxious: a PR that waits for review does not change how it feels.
- **Streak:** days in a row with activity, since the first pet hatched. Weekends never break it: a Saturday or Sunday without activity is skipped, one with activity counts. Days of _time off_ (see below) are skipped too. Missing any other weekday starts over.
- **Vacation:** the one way to say "leave me alone for a while". Start it from the menu (_Vacation…_) or _Settings → Vacation_, and pick the day you are back in _Settings_ (without a date it lasts until you say _I'm back_). It is time off: your streak is safe (those days are skipped, like weekends), the dates travel with the cloud backup, nothing talks to you (no speech bubbles or evolution popups) and the pet only idles. While it lasts, the card says so and offers _I'm back_.
- **Share card:** the share button of the card (next to the dots) opens a small window with a card with your pet, its level, your pets, achievements, streak and the trophies of each tier, and copies it to the clipboard as an image to paste anywhere. It has nothing else on it: no repos, no PR titles, no username. It only reads the pixels of that window and writes to the local clipboard; nothing is sent.
- **Achievements:** 28 of them (first PR, 10 and 50 merges, 100 reviews, a review within an hour of being asked, a 5-day streak, a PR merged within an hour, hatching 2, 4 or all the pets, growing them up…). They are yours, not a pet's: counted from the day your first pet hatched, so what happened before it does not count, and they stay when you switch pets. Like console trophies, each has a tier (bronze, silver, gold, diamond, or special) that is only the color of its medal: there are no points and no score. The card's _Trophies_ tab is a grid of pixel medals in the color of their tier (dim while locked) and, under it, the selected one with how far you are; it opens on the one closest to unlock. Reaching one is recorded and never lost, travels with the cloud backup, and the pet celebrates it once. The list and tiers live in `src/main/game/catalog.js`.
- XP syncs from the Events API every 90 s (GitHub only returns your latest 300 events, so the app keeps its own per-day history).
- **Review requests:** the app asks GitHub which open PRs ask for your review (directly or through one of your teams) only to remember _when_ you were asked, so that a review within an hour of the request earns its bonus. It shows no queue, no reminders and no notifications: the app is about the pet and your XP, not a to-do list.
- **Live reactions:** a `git push` from a local clone of a selected repo is detected instantly (the app watches the clones' reflogs), and your PRs are checked every ~10 s (60 s when idle) so a merge celebrates within seconds. The pet also reacts, with a wiggle and a line, when your own PR gets changes requested, its checks fail, it gets merge conflicts, or it becomes ready to merge (no XP for those). A PR with conflicts shows _Merge conflicts_ in the card, ahead of failing checks, and is never _Ready to merge_.
- XP rules and thresholds live in `src/main/game/catalog.js`.

**Usage:** drag the pet anywhere. Click it: a card opens, inside a little creature whose eyes show how the pet feels, with the level and one bar on top and four tabs at the bottom: _Home_ (how the pet will grow, the XP it earned this week and your streak; the one it opens on), _Pets_ (your pets), _Trophies_ and _XP log_ (what you earned each day and why, with _How XP works_). The menu bar icon (a click or a right-click) and a right-click on the pet open the menu: _Vacation…_, _Hide pet_, _Pet card_ (the card, also when the pet is hidden), _Settings…_ and _Quit_. The share icon of the card opens a small window with your pet's card to copy as an image, and the gear opens Settings; neither closes the card.

**Settings** (_Settings…_ in the menu): pet size, speech bubbles, vacation, the account and repos (_Change…_ reopens the setup: two steps when you already have pets, since pets are managed in the collection), _Back up pet to GitHub_ and _Open at login_ (on by default; on macOS it installs a LaunchAgent in `~/Library/LaunchAgents/com.gitgotchi.app.plist`).

**Backup** (optional, off by default): _Back up pet to GitHub_ keeps a private repo `<you>/gitgotchi-save` in your own GitHub account with one file, `save.json`: your pets (name, species, birth date, level, stage and the XP each earned per day), which one is active, your achievements, the XP counts per day and kind, and which repos you picked **as ids** (a hash of your account and the repo name). It has no repo names, PR titles or code. The ids keep the names from being read at a glance; they are not encryption, so whoever can guess a name can check it. On another computer, the setup offers to restore the save (with all your pets) and finds your repos again among the ones you can see (one that you can no longer see, or that is not among your 300 most recently pushed, is left out: pick it again). Turning the backup off stops syncing but leaves the repo; delete it on GitHub to remove it (the app cannot delete repos). Saves written before the ids existed had the repo names, and they stay in the repo's history: delete the repo and turn the backup on again to get rid of them. Saves from before the collection (one pet) are still read; two computers keep both collections (a species on only one of them is never lost), so update the app on all of them: an older version cannot read the new file.

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
    game/collection.js      the pets, their XP per day, the collection view (pure)
    game/achievements.js    achievement progress (pure)
    services/session.js     GitHub connection via `gh`
    services/pet-service.js sync, setup and pet events
    ui/                     windows and tray
  preload/preload.js        safe API exposed to pages
  renderer/
    shared/                 synthwave tokens and components, DOM helpers, sprites, pet animation (pet-animator.js is the pack's player)
    pet/                    floating pet window
    popover/                the card: header and four tabs, Home, Pets, Trophies and XP log (one module per tab)
    share/                  share window: the card of your pet, to copy as an image
    settings/               preferences window
    onboarding/             onboarding: GitHub, repos and the first pet (one module per step)
```

## Sprites

Eight creature lines with four stages each live in `assets/pets/`: the static rest poses (`<id>_<k>.png`, plus `_happy` and `_anxious`), `sprites.json` (names, sizes and shadow ellipses), and for the animations `sheets/` (14 frames × 3 moods per stage, with the shadow as its own layer; the app never plays the anxious row), `fx/` (hearts, sparkles, sweat drops, dust and each line's ambient particle) and `animations.json` (timings, lift per frame, facing and effect anchors). English copy per line is in `src/main/game/catalog.js`.

The desktop pet is animated by `src/renderer/shared/pet-animator.js`, copied verbatim from the pack's reference player (do not edit it; update it from a newer pack). `pet/pet-view.js` draws it on a canvas at a whole-number scale with nearest-neighbor filtering and decides when it moves: an idle loop with blinks; a short stroll every 20–60 s; a cheer when a PR of yours is merged or approved (or you earn an achievement), followed by a burst of hearts and sparkles for a few seconds and a spell of being happy. Otherwise the pet on the desktop is always in its normal state: how it feels, and why, shows in the card: the portrait plays the mood (a happy pose) and the eyes of its shell show it (cyan, mint when happy, dim on vacation). A happy pet is otherwise quiet: it can stay happy for days, so hearts are a reaction and not a state. On vacation or with macOS _Reduce motion_ the pet only idles. The profile and onboarding use the static poses.

## Scripts

- `npm run dev`: run with live reload (UI changes reload the windows, main process changes restart the app)
- `npm start`: run the app
- `npm run format` / `npm run lint`: Prettier
- `npm run shots [-- share popover panel settings evolution pet] [--tab pets|pets/koi|trophies|xp] [--tall] [--scroll] [--celebrate] [--happy] [--fresh] [--complete] [--click selector]`: renders the windows with sample data (four pets, one fully grown) to PNG files (path printed) and flags cards that overflow. Use it to check a UI change by eye
- `npm run shots:check [case ...]`: visual tests. Renders the card (and its tabs), the share window, the menu, settings, the setup and the evolution windows (with a fixed clock, no animation and no animated sprites) and compares each with the screenshot saved in `test/visual/`. A window that changed, grew, shrank or overflows fails, and `test/visual/__failures__/` gets the actual and a diff image (changes in red). If the change is on purpose, `npm run shots:update` saves the new screenshots: look at them before committing (the pet window is not covered: it is random and has its own tests). It needs Electron, so CI does not run it, and the references are made on macOS (another system may need its own)
- `npm test`: unit tests (Node built-in runner, files in `test/`)
