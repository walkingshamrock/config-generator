import React, { useState, useEffect } from 'react';

type Platform = string;
type Theme = 'light' | 'dark' | 'system';

type MCPServerConfig = {
  command: string;
  args: string[];
};

let mcpServers: Record<string, MCPServerConfig> = {}; 

declare global {
  interface Window {
    api: {
      getDatabaseConfig: () => Promise<{ mcpServers: Record<string, MCPServerConfig> }>;
      getSettings: () => Promise<{ output_dir?: string; platforms: Array<{ name: string; platform_dir?: string; output_filename?: string; batch?: string }> }>;
      loadConfig: (platform: Platform) => Promise<{ mcpServers?: Record<string, MCPServerConfig> }>;
      saveConfig: (platform: Platform, config: any) => Promise<void>;
      onDatabaseUpdated: (callback: (newConfig: { mcpServers: Record<string, MCPServerConfig> }) => void) => () => void; // Added
      onDatabaseError: (callback: (errorInfo: { message: string }) => void) => () => void; // Added
      // Added for settings.json live updates
      onSettingsUpdated: (callback: (newSettings: {
        output_dir?: string;
        platforms: Array<{ name: string; platform_dir?: string; output_filename?: string; batch?: string }>;
      }) => void) => () => void;
      onSettingsError: (callback: (errorInfo: { message: string }) => void) => () => void;
    };
  }
}

const App: React.FC = () => {
  const [settings, setSettings] = useState<null | {
    output_dir?: string;
    platforms: Array<{
      name: string;
      platform_dir?: string;
      output_filename?: string;
      batch?: string;
    }>;
  }>(null);
  const [platform, setPlatform] = useState<Platform>('');
  const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<Theme>('system');
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null); // For displaying database load errors
  const [settingsError, setSettingsError] = useState<string | null>(null); // Added for settings.json load errors

  // Effect to load settings.json for platform definitions and listen for updates
  useEffect(() => {
    let isMounted = true;

    const fetchInitialSettings = async () => {
      try {
        const cfg = await window.api.getSettings();
        if (isMounted) {
          console.log("Loaded initial settings.json:", cfg);
          setSettings(cfg);
          const savedPlatform = localStorage.getItem('selectedPlatform');
          if (cfg.platforms && cfg.platforms.length > 0 && !platform) {
            const initialPlatform = savedPlatform && cfg.platforms.some(p => p.name === savedPlatform)
              ? savedPlatform
              : cfg.platforms[0].name;
            setPlatform(initialPlatform);
          }
          setSettingsError(null);
        }
      } catch (err: any) {
        console.error("Error loading initial settings.json:", err);
        if (isMounted) {
          setSettings({ platforms: [] }); // Fallback
          setSettingsError(`Error loading initial settings: ${err.message}`);
        }
      }
    };

    fetchInitialSettings();

    const cleanupSettingsUpdated = window.api.onSettingsUpdated((newSettings) => {
      console.log("Renderer received settings-updated event:", newSettings);
      if (isMounted) {
        setSettings(newSettings);
        // If current platform is no longer in new settings, reset to the first available or empty
        if (newSettings.platforms && !newSettings.platforms.find(p => p.name === platform)) {
          setPlatform(newSettings.platforms.length > 0 ? newSettings.platforms[0].name : '');
        }
        setSettingsError(null);
      }
    });

    const cleanupSettingsError = window.api.onSettingsError((errorInfo) => {
      console.error("Renderer received settings-error event:", errorInfo);
      if (isMounted) {
        // Potentially keep old settings but show an error, or clear them
        setSettingsError(`Settings file error: ${errorInfo.message}. The application might not reflect the latest settings.json.`);
      }
    });

    return () => {
      isMounted = false;
      cleanupSettingsUpdated();
      cleanupSettingsError();
    };
  }, [platform]); // Added platform to dependency array to re-evaluate if platform changes externally

  // Effect to load initial database.json and set up live update listeners
  useEffect(() => {
    let isMounted = true; // To prevent state updates on unmounted component

    async function fetchInitialDatabaseConfig() {
      try {
        const dbConfig = await window.api.getDatabaseConfig();
        if (isMounted) {
          if (dbConfig && dbConfig.mcpServers) {
            mcpServers = dbConfig.mcpServers;
            setIsDbLoaded(true);
            setDbError(null);
            console.log("Initial database config loaded in renderer:", mcpServers);
          } else {
            console.error("Failed to load mcpServers from initial database config or config is empty.");
            setIsDbLoaded(false);
            setDbError("Failed to load initial tool database or it was empty.");
          }
        }
      } catch (error: any) {
        console.error("Error fetching initial database config:", error);
        if (isMounted) {
          setIsDbLoaded(false);
          setDbError(`Error loading initial tool database: ${error.message}`);
        }
      }
    }

    fetchInitialDatabaseConfig();

    const cleanupDbUpdated = window.api.onDatabaseUpdated((newConfig) => {
      console.log("Renderer received database-updated event:", newConfig);
      if (isMounted) {
        if (newConfig && newConfig.mcpServers) {
          mcpServers = newConfig.mcpServers;
          setIsDbLoaded(true);
          setDbError(null);
          // Potentially reset selectedMcpIds if they are no longer valid, or merge them.
          // For now, just reloading the list. User might need to re-select if IDs changed.
          setSelectedMcpIds(currentSelected => currentSelected.filter(id => mcpServers[id]));
        } else {
          setIsDbLoaded(false);
          setDbError("Received empty or invalid tool database update.");
        }
      }
    });

    const cleanupDbError = window.api.onDatabaseError((errorInfo) => {
      console.error("Renderer received database-error event:", errorInfo);
      if (isMounted) {
        setIsDbLoaded(false);
        setDbError(`Tool database error: ${errorInfo.message}`);
      }
    });

    return () => {
      isMounted = false;
      cleanupDbUpdated();
      cleanupDbError();
    };
  }, []);

  // Effect to apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', isDark);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        root.classList.toggle('dark', mediaQuery.matches);
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // Load existing config when platform changes AND database is loaded
  useEffect(() => {
    if (!isDbLoaded) return; // Don't load platform config until db is loaded

    async function loadConfigData() {
      let cfg: { mcpServers?: Record<string, MCPServerConfig> } = {};
      if (window.api?.loadConfig) {
        try {
          cfg = await window.api.loadConfig(platform);
        } catch {
          cfg = {};
        }
      }
      const ids = cfg.mcpServers ? Object.keys(cfg.mcpServers) : [];
      setSelectedMcpIds(ids);
    }
    loadConfigData();
  }, [platform, isDbLoaded]);

  const handleMcpToggle = (id: string) => {
    setSelectedMcpIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const generateConfig = async () => {
    if (!isDbLoaded) {
      console.error("Cannot generate config, database not loaded.");
      // Optionally, show an error to the user
      return;
    }
    const selected: Record<string, MCPServerConfig> = {};
    selectedMcpIds.forEach(id => {
      selected[id] = mcpServers[id];
    });
    const config = { mcpServers: selected };
    await window.api.saveConfig(platform, config);
  };

  if (dbError) {
    return (
      <div className="p-6 max-w-xl mx-auto min-h-screen flex flex-col items-center justify-center text-red-500">
        <h1 className="text-2xl font-bold mb-4">Tool Database Error</h1>
        <p>{dbError}</p>
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Please check the `database.json` file and restart the application.</p>
      </div>
    );
  }

  // Display settings error if any
  if (settingsError) {
    return (
      <div className="p-6 max-w-xl mx-auto min-h-screen flex flex-col items-center justify-center text-red-500">
        <h1 className="text-2xl font-bold mb-4">Settings File Error</h1>
        <p>{settingsError}</p>
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Please check your `settings.json` file. Some features might be unavailable or outdated.</p>
      </div>
    );
  }

  if (!settings || platform === '') {
    return (
      <div className="p-6 max-w-xl mx-auto min-h-screen flex items-center justify-center">
        <p>Loading settings...</p>
      </div>
    );
  }


  return (
    <div className="p-6 max-w-xl mx-auto bg-white dark:bg-tokyo-night text-black dark:text-tokyo-night-foreground min-h-screen">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Config Generator</h1>
        <div>
          <label htmlFor="theme-select" className="block mb-1 font-medium">Color Theme</label>
          <select
            id="theme-select"
            className="border border-gray-300 rounded p-2 bg-white text-black dark:bg-tokyo-night-line dark:border-tokyo-night-comment dark:text-tokyo-night-foreground"
            value={theme}
            onChange={e => setTheme(e.target.value as Theme)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="block mb-1 font-medium">Platform</label>
        <select
          className="w-full border border-gray-300 rounded p-2 bg-white text-black dark:bg-tokyo-night-line dark:border-tokyo-night-comment dark:text-tokyo-night-foreground"
          value={platform}
          onChange={e => {
            const newPlatform = e.target.value as Platform;
            setPlatform(newPlatform);
            localStorage.setItem('selectedPlatform', newPlatform);
          }}
        >
          {settings?.platforms.map(p => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block mb-1 font-medium">Tools (MCP Servers)</label>
        {isDbLoaded && Object.keys(mcpServers).length > 0 ? (
          Object.keys(mcpServers).map(id => (
            <div key={id} className="flex items-center mb-1">
              <input
                type="checkbox"
                id={`mcp-${id}`}
                checked={selectedMcpIds.includes(id)}
                onChange={() => handleMcpToggle(id)}
                className="mr-2"
              />
              <label htmlFor={`mcp-${id}`}>{id}</label>
            </div>
          ))
        ) : isDbLoaded && Object.keys(mcpServers).length === 0 ? (
          <p>No tools found in the loaded database.json.</p>
        ) : (
          <p>Loading tools...</p> // This case should be covered by the main !isDbLoaded check
        )}
      </div>

      <button
        onClick={generateConfig}
        className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 dark:bg-tokyo-night-blue dark:hover:bg-tokyo-night-selection"
      >
        {(() => {
          const found = settings?.platforms.find(p => p.name === platform);
          const fname = found?.output_filename ?? 'config.json';
          return found?.batch
            ? `Save ${fname} and run batch`
            : `Save ${fname}`;
        })()}
      </button>
    </div>
  );
};

export default App;
