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
    dragEnd: send('pet:drag-end'),
    openMenu: send('pet:menu'),
    // ---- everyday UI ----
    prefs: invoke('pet:prefs'), // -> { speechBubbles }
    onPrefs: subscribe('pet:prefs'),
    openPopover: send('pet:popover'), // creature rect in window coords { x, y, width, height }: toggles the PR popover
    onPopoverRequest: subscribe('pet:popover-request'), // the menu asks for the rect to anchor on
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

  // --- Profile & evolution windows ---
  profile: {
    status: invoke('profile:status'),
    onStatus: subscribe('profile:status'),
    view: invoke('profile:view'), // -> the tab the window was opened on ('collection'...), or null
    onView: subscribe('profile:view'), // an open window is asked to show another tab
    copyCard: invoke('profile:copy-card'), // { x, y, width, height } of the share card: copies it to the clipboard as an image -> { ok } | { error, message }
  },

  evolution: {
    data: invoke('evolution:data'), // -> { fromIndex, toIndex }
    close: send('evolution:close'),
    viewProfile: send('evolution:view-profile'), // optional tab: 'collection'
  },
  // --- end Profile & evolution windows ---

  // ---- everyday UI ----
  panel: {
    state: invoke('panel:state'), // -> { status, configured, connected, petVisible }
    onState: subscribe('panel:state'),
    // 'sync' | 'togglePet' | 'pauseHour' | 'pauseTomorrow' | 'pauseVacation' | 'resume' | 'openProfile' | 'openSettings'
    // | 'quit'
    action: send('panel:action'),
    setHeight: send('panel:height'), // content height in px
  },

  popover: {
    state: invoke('popover:state'), // -> panel state plus { placement: 'above' | 'below', tailX }
    onState: subscribe('popover:state'),
    action: send('popover:action'), // 'openProfile' | 'openXp' | 'openMenu' | 'resume'
    openPullRequest: send('popover:open-pr'), // https://github.com URL
    setHeight: send('popover:height'),
  },
  // ---- end everyday UI ----

  settings: {
    // -> { login, repoCount, speechBubbles, notifications, openAtLogin,
    //      pause: { active, until, backOn, since },
    //      cloud: { enabled, repo, saved, phase, error, lastPushAt },
    //      petSize, sizeRange: { min, max }, defaultPetSize }
    state: invoke('settings:state'),
    onState: subscribe('settings:state'),
    // 'toggleSpeechBubbles' | 'toggleNotifications' | 'pauseHour' | 'pauseTomorrow' | 'pauseVacation' | 'resume'
    // | 'toggleOpenAtLogin'
    // | 'toggleCloudSync'
    // | 'openSaveRepo' | 'openSetup'
    action: send('settings:action'),
    setSize: send('settings:size'), // { size, commit }: live while dragging, commit on release
    setPauseReturn: send('settings:pause-return'), // 'YYYY-MM-DD' (the first day that counts again), or null
  },
});
