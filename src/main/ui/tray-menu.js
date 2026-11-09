// Pure: the native menu of the tray icon on Linux. It has the same rows as the menu page (renderer/panel/panel.js).
// Linux trays (AppIndicator) only show an icon that has a menu, and they do not report clicks or where the icon is.

/**
 * @param {{ configured: boolean, petVisible: boolean, status?: { pause?: { active: boolean } } | null }} state  the panel state
 * @param {{ resume: Function, startVacation: Function, togglePet: Function, openCard: Function,
 *           openSettings: Function, quit: Function }} actions
 * @returns {Electron.MenuItemConstructorOptions[]}
 */
function trayMenuTemplate({ configured, petVisible, status }, actions) {
  const quit = { label: 'Quit Gitgotchi', click: actions.quit };
  if (!configured) return [{ label: 'Set up Gitgotchi…', click: actions.openSettings }, { type: 'separator' }, quit];
  const vacation = status?.pause?.active
    ? { label: "I'm back", click: actions.resume }
    : { label: 'Vacation…', click: actions.startVacation };
  return [
    vacation,
    { label: petVisible ? 'Hide pet' : 'Show pet', click: actions.togglePet },
    { type: 'separator' },
    { label: 'Pet card', click: actions.openCard },
    { label: 'Settings…', click: actions.openSettings },
    { type: 'separator' },
    quit,
  ];
}

module.exports = { trayMenuTemplate };
