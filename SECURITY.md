# Security policy

## Report a vulnerability

Please do not open a public issue.

Use GitHub's private reporting: on the repository, go to **Security → Report a vulnerability**. Say what you found, how to reproduce it and what it lets someone do. You will get an answer as soon as possible; this is a small project with one maintainer.

Never paste a token, a key or the contents of a `.env` file in a report.

## What the app has access to

Knowing this helps you judge a finding:

- **GitHub access is the `gh` login of the person.** The app runs `gh auth token` each time it needs it and calls the GitHub API with it. It never stores the token, and it does not ask for a different one. The token is the one `gh` has, so it has the scopes of that login, which cannot be narrowed without an organization admin. The app only reads PRs, reviews, issues and push events in the repos the person picks, and never reads code.
- **The optional backup** writes one file, `save.json`, to a private repo in the person's own account. It holds pets, XP per day and ids of repos (a hash), not repo names, PR titles or code.
- **The pages are local.** Every window loads a page from the app itself, with `contextIsolation` and `sandbox` on, `nodeIntegration` off and a Content Security Policy. The main process only accepts messages from those pages, and opens only `https` links in the browser.
- **Updates** come from this repository's GitHub releases.

## Supported versions

Only the latest release gets fixes.

## Builds on macOS

The macOS builds are signed ad-hoc: they have a signature, but not one from an Apple Developer ID, and they are not notarized. Download them only from this repository's [releases](https://github.com/nicvazquezdev/gitgotchi/releases).
