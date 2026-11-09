# Contributing to Gitgotchi

Thanks for helping. Gitgotchi is a small Electron app: a pixel pet that grows with your GitHub activity. Bug reports, fixes and ideas are all welcome.

## Run it

You need Node 22 and the [GitHub CLI](https://cli.github.com) logged in (`gh auth login`).

```sh
npm install
npm run dev   # auto-reloads on changes
```

The README has the [structure of the code](README.md#development). The XP rules, species and trophies live in `src/main/game/catalog.js`.

## Before you open a pull request

```sh
npm run lint    # Prettier
npm test        # unit tests, Node's built-in runner
```

CI runs both on Linux, macOS and Windows. `npm run format` fixes the formatting.

If you change something you can see, also run:

```sh
npm run shots:check            # compares each window with the screenshots in test/visual/
npm run shots:update -- <case> # on purpose only: look at the new screenshots before you commit them
```

The screenshots are made on macOS (fonts and window chrome differ on other systems), and CI does not run them. If you are on Windows or Linux, say so in the pull request and a maintainer will update them.

## Conventions

- **Code, comments, UI copy and commit messages are in English.**
- **Match the surrounding code**: naming, comment density, idiom. The game rules are pure functions (`game/*.js`, no I/O) with unit tests in `test/`; keep it that way.
- **Commits**: a short imperative subject, then a wrapped body that says _why_ (`Popover: the notch of the shell always points at the pet`). One finished change per commit.
- **Keep the app calm.** No notifications, no nagging, no scores that go down: a pet never loses a level. Read the README before you add a feature that talks to the person.
- **Keep the setup free of friction.** The app uses the `gh` login people already have. No GitHub App, OAuth App or token flow that needs an organization admin to approve something.
- **Privacy.** The app reads PRs, reviews, issues and push events in the repos the person picks, never code. Nothing leaves the machine except calls to the GitHub API and the optional backup repo.
- **Sprites** are in `assets/pets/` (see the README). If you add or change art, say how you made it, and make sure you can license it under the MIT license.

## Other systems

The app runs on macOS, Windows and Linux. If you touch windows, the tray, or anything that depends on the system, check it on more than one if you can, and say in the pull request which ones you tried.

## Releasing (maintainers)

1. Move the `Unreleased` notes in `CHANGELOG.md` under the new version.
2. `npm version <x.y.z> --no-git-tag-version`, then commit both files.
3. Tag the commit `vX.Y.Z` and push the tag.

The release workflow builds the app for each system and uploads the files to a **draft** release. Read it, and publish it: the app only offers an update once the release is published.

Build it yourself with `npm run dist` (all files go to `dist/`).

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
