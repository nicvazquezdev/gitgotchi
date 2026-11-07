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

  pet: {
    status: invoke('pet:status'),
    refresh: invoke('pet:refresh'),
    setClickThrough: send('pet:click-through'), // boolean
    dragStart: send('pet:drag-start'), // { offsetX, offsetY }
    dragEnd: send('pet:drag-end'),
    openMenu: send('pet:menu'),
    // ---- everyday UI ----
    prefs: invoke('pet:prefs'), // -> { speechBubbles, doNotDisturb }
    onPrefs: subscribe('pet:prefs'),
    openPopover: send('pet:popover'), // creature rect in window coords { x, y, width, height }: toggles the PR popover
    onPopoverRequest: subscribe('pet:popover-request'), // the menu asks for the rect to anchor on
    // ---- end everyday UI ----
    size: invoke('pet:size'), // sprite size in px
    onSize: subscribe('pet:size'),
    onStatus: subscribe('pet:status'),
    onEvolved: subscribe('pet:evolved'),
    onActivity: subscribe('pet:activity'), // { [kind]: count }
  },

  // --- Profile & evolution windows ---
  profile: {
    status: invoke('profile:status'),
    onStatus: subscribe('profile:status'),
  },

  evolution: {
    data: invoke('evolution:data'), // -> { fromIndex, toIndex }
    close: send('evolution:close'),
    viewProfile: send('evolution:view-profile'),
  },
  // --- end Profile & evolution windows ---

  // ---- everyday UI ----
  panel: {
    state: invoke('panel:state'), // -> { status, configured, connected, petVisible, speechBubbles, doNotDisturb, openAtLogin, cloudSync, petSize, sizeRange }
    onState: subscribe('panel:state'),
    // 'sync' | 'togglePet' | 'toggleSpeechBubbles' | 'toggleDoNotDisturb' | 'toggleCloudSync' | 'toggleOpenAtLogin'
    // | 'openPopover' | 'openProfile' | 'openSettings' | 'quit'
    action: send('panel:action'),
    setSize: send('panel:size'), // { size, commit }: live while dragging, commit on release
    setHeight: send('panel:height'), // content height in px
  },

  popover: {
    state: invoke('popover:state'), // -> panel state plus { placement: 'above' | 'below', tailX }
    onState: subscribe('popover:state'),
    action: send('popover:action'), // 'nudgeReviewers' | 'openProfile' | 'openSettings'
    openPullRequest: send('popover:open-pr'), // https://github.com URL
    setHeight: send('popover:height'),
  },
  // ---- end everyday UI ----
});
