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
- **Level and stage** come from the XP a pet has earned: Baby → Kid → Young → Adult. Levels scale with your own weekly baseline, and a pet never goes down a level or a stage. Every level up gets a toast with the XP to the next one.
- **Collection:** you keep every pet you hatch, one per species (eight lines to collect), and raise one at a time: only the **active** pet earns XP. Switching is free and nothing is lost: a pet that waits keeps its XP, level and stage. New XP goes to whichever pet is active when the app sees it (to the active pet if the app was closed; changing repos never takes XP away from a pet, and it cannot be farmed). Each pet keeps its XP per day, so two computers merge them with a max per day. The _Collection_ tab of the profile is a dex: a card per species (the silhouette of the ones you have not hatched), the detail of the selected one with its next level and next evolution (and about how long they take at your own pace), _Make … active_, _Hatch …_ (with a name) and a pencil to rename. The menu bar panel has a row of faces to switch with one click, and the pet card and the popover have a _Switch_ button. When you switch or hatch, the new pet grows out of a flash on the desktop and says that it earns the XP now. A pet that reaches the last stage is fully grown (a gold frame and a trophy) and keeps leveling if you leave it active; hatching all eight and growing them all up is the goal after level 18.
- **Mood** has two states: happy (a PR merged in the last 48 h, or a strong week) and neutral (everything else). The pet is never anxious: a PR that waits for review does not change how it feels.
- **Streak:** days in a row with activity, since the first pet hatched. Weekends never break it: a Saturday or Sunday without activity is skipped, one with activity counts. Days of _time off_ (see below) are skipped too. Missing any other weekday starts over.
- **Time off:** _Settings → Away → Time off_ for a vacation or a holiday, with an optional day you are back. While it is on your streak is safe (those days are skipped, like weekends), and reminders and notifications pause. Turning it off means you are back today. The dates travel with the cloud backup.
- **Daily goal:** the popover shows today's XP against a typical working day of yours: your weekly baseline over five working days (a ring that fills as the day goes). It is a nudge: weekends and days of time off have no goal, and missing it costs nothing. The pet celebrates the day you reach it, once, and never for what was already reached when the app started.
- **Share card:** the _Share_ button of the profile shows a card with your pet, its level, your companions, achievements, score, streak and the trophies of each tier, and copies it to the clipboard as an image to paste anywhere. It has nothing else on it: no repos, no PR titles, no username. It only reads the pixels of the profile window and writes to the local clipboard; nothing is sent.
- **Achievements:** 28 of them (first PR, 10 and 50 merges, 100 reviews, a review within an hour of being asked, a 5-day streak, a PR merged within an hour, hatching 2, 4 or all the companions, growing them up…). They are yours, not a pet's: counted from the day your first pet hatched, so what happened before it does not count, and they stay when you switch pets. Like console trophies, each has a tier (bronze, silver, gold, diamond, or special) worth points (10, 25, 50, 100 and 50: 990 in total). The profile's _Achievements_ tab is the trophy case: the score, the trophies of each tier, the ones closest to unlock, a filter and every achievement as a pixel medal with its progress. Reaching one is recorded and never lost, travels with the cloud backup, and the pet celebrates it once with a toast. The list, tiers and points live in `src/main/game/catalog.js`.
- XP syncs from the Events API every 90 s (GitHub only returns your latest 300 events, so the app keeps its own per-day history).
- **Review queue:** the open PRs where you (or a team you are in) were asked for a review, in the repos you picked. It refreshes with every sync and when the popover or the menu opens. The wait is counted from when you were asked (directly or through one of your teams, which it names), not from when the PR was opened; when GitHub's history cannot prove the date, the row says how old the PR is instead and does not flag it as late. The pet mentions it and reacts when a new request arrives. Drafts are left out.
- **Notifications:** system notifications (macOS Notification Center) for six things only: someone asks for your review and, on your own PRs, changes requested, failing checks, merge conflicts, an approval and being ready to merge (approved with every check green and no conflicts; an approval that comes with green checks is just the one, ready). Several at once become one notification, the same thing on the same PR is not repeated within 30 minutes, and _Do not disturb_ and time off silence them. Clicking one opens the PR (or the popover when it sums up several). Merges, commits and achievements are left to the pet. The menu bar shows, next to the pet icon, how many PRs wait for your review: it is the standing state, while a notification is an event. Both can be turned off in Settings. (In development they come from "Electron", and macOS asks for permission the first time.)
- **Live reactions:** a `git push` from a local clone of a selected repo is detected instantly (the app watches the clones' reflogs), and your PRs are checked every ~10 s (60 s when idle) so a merge celebrates within seconds. The pet also reacts, with a wiggle and a line, when your own PR gets changes requested, its checks fail, it gets merge conflicts, or it becomes ready to merge (no XP for those). A PR with conflicts shows _Merge conflicts_ in the popover, ahead of failing checks, and is never _Ready to merge_.
- XP rules and thresholds live in `src/main/game/catalog.js`.

**Usage:** drag the pet anywhere. Click it: a popover opens with the PRs that wait for your review (_To review_) and your own (_My PRs_). Right-click the pet or click the menu bar icon: a panel with the pet's level, your companions (click a face to make it the active pet, "+" to hatch another), your PRs and the everyday switches (_Show pet on desktop_, _Do not disturb_).

**Settings** (_Settings…_ in the menu): pet size, speech bubbles, notifications, time off, the account and repos (_Change…_ reopens the setup: two steps when you already have pets, since pets are managed in the collection), _Back up pet to GitHub_ and _Open at login_ (on by default; on macOS it installs a LaunchAgent in `~/Library/LaunchAgents/com.gitgotchi.app.plist`).

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
    profile/                profile window: overview, collection and achievements (one module per view)
    settings/               preferences window
    onboarding/             onboarding: GitHub, repos and the first pet (one module per step)
```

## Sprites

Eight creature lines with four stages each live in `assets/pets/`: the static rest poses (`<id>_<k>.png`, plus `_happy` and `_anxious`), `sprites.json` (names, sizes and shadow ellipses), and for the animations `sheets/` (14 frames × 3 moods per stage, with the shadow as its own layer; the app never plays the anxious row), `fx/` (hearts, sparkles, sweat drops, dust and each line's ambient particle) and `animations.json` (timings, lift per frame, facing and effect anchors). English copy per line is in `src/main/game/catalog.js`.

The desktop pet is animated by `src/renderer/shared/pet-animator.js`, copied verbatim from the pack's reference player (do not edit it; update it from a newer pack). `pet/pet-view.js` draws it on a canvas at a whole-number scale with nearest-neighbor filtering and decides when it moves: an idle loop with blinks; a short stroll every 20–60 s; a cheer when a PR of yours is merged or approved (or you earn an achievement), followed by a burst of hearts and sparkles for a few seconds and a spell of being happy. Otherwise the pet on the desktop is always in its normal state: how it feels, and why, shows in the popover, where the portrait plays the mood (a happy pose) and a notice gives the reason. A happy pet is otherwise quiet: it can stay happy for days, so hearts are a reaction and not a state. With _Do not disturb_ or macOS _Reduce motion_ the pet only idles. The profile and onboarding use the static poses.

## Scripts

- `npm run dev`: run with live reload (UI changes reload the windows, main process changes restart the app)
- `npm start`: run the app
- `npm run format` / `npm run lint`: Prettier
- `npm run shots [-- profile popover panel settings evolution pet] [--mine] [--tab achievements|collection|collection/koi] [--tall] [--scroll] [--celebrate] [--happy] [--conflicts] [--fresh] [--complete] [--click selector]`: renders the windows with sample data (four pets, one fully grown) to PNG files (path printed) and flags cards that overflow. Use it to check a UI change by eye
- `npm run shots:check [case ...]`: visual tests. Renders the profile, popover, menu, settings and evolution windows (with a fixed clock, no animation and no animated sprites) and compares each with the screenshot saved in `test/visual/`. A window that changed, grew, shrank or overflows fails, and `test/visual/__failures__/` gets the actual and a diff image (changes in red). If the change is on purpose, `npm run shots:update` saves the new screenshots: look at them before committing (the pet window is not covered: it is random and has its own tests). It needs Electron, so CI does not run it, and the references are made on macOS (another system may need its own)
- `npm test`: unit tests (Node built-in runner, files in `test/`)
