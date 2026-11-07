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
    finish: invoke('onboarding:finish'), // { repos, species, name }
  },

  pet: {
    status: invoke('pet:status'),
    refresh: invoke('pet:refresh'),
    setClickThrough: send('pet:click-through'), // boolean
    dragStart: send('pet:drag-start'), // { offsetX, offsetY }
    dragEnd: send('pet:drag-end'),
    openMenu: send('pet:menu'),
    size: invoke('pet:size'), // sprite size in px
    stepSize: send('pet:size-step'), // -1 (smaller) or 1 (bigger)
    onSize: subscribe('pet:size'),
    onStatus: subscribe('pet:status'),
    onEvolved: subscribe('pet:evolved'),
  },
});
