// Safe bridge between pages and the main process. Must match src/main/ipc.js.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (payload) => ipcRenderer.invoke(channel, payload);
const send = (channel) => (payload) => ipcRenderer.send(channel, payload);
const subscribe = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('gitgotchi', {
  bootstrap: invoke('app:bootstrap'),

  auth: {
    accounts: invoke('auth:accounts'), // -> { accounts: [{ login, active, avatarUrl }], selected, missing }
    connect: invoke('auth:connect'), // login -> { user }
    disconnect: invoke('auth:disconnect'),
  },

  onboarding: {
    listRepos: invoke('repos:list'),
    finish: invoke('onboarding:finish'), // { repos, species, name, cloudSync }
  },

  cloud: {
    find: invoke('cloud:find'), // -> { found: false } | { found: true, pet: { name, speciesId, stageIndex, level } }
    restore: invoke('cloud:restore'), // restores the save; main then closes onboarding and shows the pet
  },

  // The collection of pets. Each returns nothing, or { error, message } when it could not be done.
  pets: {
    activate: invoke('pets:activate'), // species id: from now on that pet earns the XP
    hatch: invoke('pets:hatch'), // { species, name }: a new pet, which becomes the active one
    rename: invoke('pets:rename'), // { species, name }
  },

  pet: {
    status: invoke('pet:status'),
    refresh: invoke('pet:refresh'),
    setClickThrough: send('pet:click-through'), // boolean
    dragStart: send('pet:drag-start'), // { offsetX, offsetY }
    dragAlive: send('pet:drag-alive'), // every 250 ms while the pet is held: if it stops, the main process lets go of it
    dragShift: send('pet:drag-shift'), // px: held by the feet, the window goes lower so the body hangs below the cursor
    dragEnd: send('pet:drag-end'), // { throwable }: false and the pet stays where it was let go (no slide)
    openMenu: send('pet:menu'),
    // ---- everyday UI ----
    prefs: invoke('pet:prefs'), // -> { speechBubbles, playful }
    onPrefs: subscribe('pet:prefs'),
    openPopover: send('pet:popover'), // creature rect in window coords { x, y, width, height }: toggles the PR popover
    onPopoverRequest: subscribe('pet:popover-request'), // the menu asks for the rect to anchor on
    onBump: subscribe('pet:bump'), // { axis: 'x' | 'y', speed }: the pet slid into an edge of the screen and bounced
    onPointer: subscribe('pet:pointer'), // { x, y }: the cursor in window coords, after the window moved from under it
    onPopoverOpen: subscribe('pet:popover-open'), // boolean: the popover hangs from the creature (or not any more)
    // ---- end everyday UI ----
    size: invoke('pet:size'), // sprite size in px
    onSize: subscribe('pet:size'),
    onStatus: subscribe('pet:status'),
    onEvolved: subscribe('pet:evolved'),
    onActivity: subscribe('pet:activity'), // { [kind]: count }
    onCompanion: subscribe('pet:companion'), // { kind: 'hatched' | 'switched', species, name }
    onLevelUp: subscribe('pet:level-up'), // { level, name, toNext }: the new level and the XP to the next one
    onAchievements: subscribe('pet:achievements'), // [{ id, name, description, icon }]: just reached
  },

  // --- Share & evolution windows ---
  share: {
    status: invoke('share:status'),
    onStatus: subscribe('share:status'),
    copyCard: invoke('share:copy-card'), // { x, y, width, height } of the share card: copies it to the clipboard as an image -> { ok } | { error, message }
  },

  evolution: {
    data: invoke('evolution:data'), // -> { fromIndex, toIndex }
    close: send('evolution:close'),
  },
  // --- end Share & evolution windows ---

  // ---- everyday UI ----
  panel: {
    state: invoke('panel:state'), // -> { status, configured, connected, petVisible }
    onState: subscribe('panel:state'),
    // 'sync' | 'togglePet' | 'startVacation' | 'resume' | 'openCard'
    // | 'openSettings' | 'quit'
    action: send('panel:action'),
    setHeight: send('panel:height'), // content height in px
  },

  popover: {
    state: invoke('popover:state'), // -> panel state plus { placement: 'above' | 'below' }
    onState: subscribe('popover:state'),
    action: send('popover:action'), // 'openShare' | 'openSettings' | 'resume'
    setHeight: send('popover:height'),
  },
  // ---- end everyday UI ----

  settings: {
    // -> { login, repoCount, speechBubbles, playful, openAtLogin,
    //      pause: { active, backOn, since } (on vacation),
    //      cloud: { enabled, repo, saved, phase, error, lastPushAt },
    //      petSize, sizeRange: { min, max }, defaultPetSize }
    state: invoke('settings:state'),
    onState: subscribe('settings:state'),
    // 'toggleSpeechBubbles' | 'togglePlayful' | 'toggleVacation'
    // | 'toggleOpenAtLogin'
    // | 'toggleCloudSync'
    // | 'openSaveRepo' | 'openSetup'
    action: send('settings:action'),
    setSize: send('settings:size'), // { size, commit }: live while dragging, commit on release
    setVacationReturn: send('settings:vacation-return'), // 'YYYY-MM-DD' (the first day that counts again), or null
  },
});
