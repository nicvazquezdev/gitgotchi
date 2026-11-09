// What Settings says about updates, from the state of the updater (see main/services/updater.js). Pure.

/** `{ hint, action?: { label, name }, busy?, error? }`: `name` is the Settings action the button sends. */
export function updateRow({ supported, status, latest, progress, error } = {}) {
  if (!supported) return { hint: 'A development build: it does not look for updates.' };
  if (status === 'checking') return { hint: 'Looking for a new version…', busy: true };
  if (status === 'downloading') return { hint: `Downloading ${latest}… ${progress}%`, busy: true };
  if (status === 'ready')
    return { hint: `${latest} is ready.`, action: { label: 'Restart to update', name: 'applyUpdate' } };
  if (status === 'available') return { hint: `${latest} is out.`, action: { label: 'Get it', name: 'applyUpdate' } };
  if (error)
    return {
      hint: 'Could not look for updates.',
      error: true,
      action: { label: 'Try again', name: 'checkForUpdates' },
    };
  return { hint: 'You have the latest version.', action: { label: 'Check now', name: 'checkForUpdates' } };
}
