const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getDatabaseConfig: () => ipcRenderer.invoke('get-database-config'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  loadConfig: (platform) => ipcRenderer.invoke('load-config', platform),
  saveConfig: (platform, config) => ipcRenderer.invoke('save-config', platform, config),
  // For live updates from main process to renderer
  onDatabaseUpdated: (callback) => {
    ipcRenderer.on('database-updated', (_event, newConfig) => callback(newConfig));
    // Return a cleanup function
    return () => {
      ipcRenderer.removeAllListeners('database-updated');
    };
  },
  onDatabaseError: (callback) => {
    ipcRenderer.on('database-error', (_event, errorInfo) => callback(errorInfo));
    // Return a cleanup function
    return () => {
      ipcRenderer.removeAllListeners('database-error');
    };
  },
  // Added for settings.json updates
  onSettingsUpdated: (callback) => {
    ipcRenderer.on('settings-updated', (_event, newSettings) => callback(newSettings));
    return () => {
      ipcRenderer.removeAllListeners('settings-updated');
    };
  },
  onSettingsError: (callback) => {
    ipcRenderer.on('settings-error', (_event, errorInfo) => callback(errorInfo));
    return () => {
      ipcRenderer.removeAllListeners('settings-error');
    };
  },
});
