#!/bin/sh
# Installs Gitgotchi from its latest GitHub release on macOS and Linux. Run it again to update.
#
#   curl -fsSL https://raw.githubusercontent.com/nicvazquezdev/gitgotchi/main/install.sh | sh
#
# GITGOTCHI_VERSION=0.1.0   install that version instead of the latest
# GITGOTCHI_INSTALL_DIR     where the app goes (macOS: /Applications, or ~/Applications when that is not writable;
#                           Linux without apt: ~/.local/bin)
set -eu

repo=nicvazquezdev/gitgotchi
releases=https://github.com/$repo/releases

say() { printf '%s\n' "$*"; }
die() { printf 'gitgotchi: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

need curl
need openssl

case $(uname -s) in
  Darwin) os=mac ;;
  Linux) os=linux ;;
  *) die "this script is for macOS and Linux; on Windows use install.ps1" ;;
esac
case $(uname -m) in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) die "no build for $(uname -m)" ;;
esac

if [ -n "${GITGOTCHI_VERSION:-}" ]; then
  version=${GITGOTCHI_VERSION#v}
else
  # /releases/latest redirects to /releases/tag/vX.Y.Z: no API call, so no rate limit
  latest=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$releases/latest") || die "could not reach GitHub"
  version=${latest##*/v}
fi
case $version in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) die "could not find a release (got '$version')" ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# download <file> <manifest>: fetches the file and checks it against the sha512 in the release manifest
download() {
  curl -fsSL -o "$tmp/$2" "$releases/download/v$version/$2" || die "v$version has no $2"
  want=$(awk -v f="$1" '$1 == "-" && $2 == "url:" { hit = ($3 == f) } hit && $1 == "sha512:" { print $2; exit }' "$tmp/$2")
  [ -n "$want" ] || die "$1 is not in $2"
  say "Downloading $1"
  curl -fL --progress-bar -o "$tmp/$1" "$releases/download/v$version/$1" || die "could not download $1"
  got=$(openssl dgst -sha512 -binary "$tmp/$1" | openssl base64 -A)
  [ "$got" = "$want" ] || die "$1 does not match its checksum"
}

# launch <command...>: starts the app, unless there is no screen to show it on
launch() {
  if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    nohup "$@" >/dev/null 2>&1 &
  fi
}

running() { pgrep -f "$1/Contents/MacOS/" >/dev/null 2>&1; }

install_mac() {
  file=Gitgotchi-$version-mac-$arch.zip
  dir=${GITGOTCHI_INSTALL_DIR:-}
  if [ -z "$dir" ]; then
    dir=/Applications
    [ -w "$dir" ] || dir=$HOME/Applications
  fi
  app=$dir/Gitgotchi.app

  download "$file" latest-mac.yml
  ditto -xk "$tmp/$file" "$tmp/unzipped"
  mkdir -p "$dir"

  if running "$app"; then
    say "Quitting the running Gitgotchi"
    # A signal, not an Apple event: that one makes macOS ask the person to let the terminal control the app.
    # The app saves its state in whole files on every change, so nothing is lost.
    pkill -TERM -f "$app/Contents/MacOS/" || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      running "$app" || break
      sleep 1
    done
    ! running "$app" || die "Gitgotchi did not quit: quit it and run this again"
  fi

  # The app is ad-hoc signed and curl does not mark what it downloads as quarantined, so Gatekeeper has nothing to ask.
  rm -rf "$app"
  ditto "$tmp/unzipped/Gitgotchi.app" "$app"
  say "Installed $app"
  open "$app"
}

install_linux() {
  [ "$arch" = x64 ] || die "there is no Linux build for $(uname -m) yet"

  if command -v apt-get >/dev/null 2>&1; then
    # The .deb does not need FUSE and is the build that works with the sandbox limits of Ubuntu 23.10 and later.
    # It only tells you about updates (the app cannot replace a package): run this script again.
    file=Gitgotchi-$version-linux-amd64.deb
    download "$file" latest-linux.yml
    say "Installing the .deb (needs sudo)"
    if [ "$(id -u)" = 0 ]; then apt-get install -y "$tmp/$file"; else sudo apt-get install -y "$tmp/$file"; fi
    say "Installed Gitgotchi"
    launch gitgotchi
  else
    # The AppImage updates itself.
    file=Gitgotchi-$version-linux-x86_64.AppImage
    dir=${GITGOTCHI_INSTALL_DIR:-$HOME/.local/bin}
    download "$file" latest-linux.yml
    mkdir -p "$dir"
    cp "$tmp/$file" "$dir/gitgotchi.new"
    chmod 755 "$dir/gitgotchi.new"
    mv -f "$dir/gitgotchi.new" "$dir/gitgotchi" # a rename, so it works while the old version runs
    say "Installed $dir/gitgotchi (an AppImage: it needs FUSE 2, the libfuse2 package)"
    case :$PATH: in
      *:"$dir":*) ;;
      *) say "Add $dir to your PATH to start it with 'gitgotchi'" ;;
    esac
    launch "$dir/gitgotchi"
  fi
}

"install_$os"
say "Gitgotchi $version is installed."
