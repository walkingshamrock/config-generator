import { app, BrowserWindow, ipcMain, dialog } from "electron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process"; // Changed from require to import

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let databaseConfig: any = null;
let currentSettings: any = null;
let outputDirectoryPath: string;
let watchedDbPath: string | null = null;
let watchedSettingsPath: string | null = null;
let mainWindow: BrowserWindow | null = null;
let dynamicDbPathFromSettings: string | null = null; // Added: To store db path from settings.json

// Function to load/reload settings.json
function loadSettingsConfig(notifyRenderer = false): boolean {
  const settingsPath = path.join(process.cwd(), "settings.json");
  try {
    console.log(`Attempting to load settings.json from: ${settingsPath}`);
    const rawData = fs.readFileSync(settingsPath, "utf-8");
    // Strip JS comments before parsing JSON
    const stripped = rawData
      .replace(/\/\/.*$/gm, "") // Corrected regex for single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, ""); // Corrected regex for multi-line comments
    const newSettings = JSON.parse(stripped);

    const oldDbPathFromSettings = dynamicDbPathFromSettings;
    if (newSettings?.database_path && typeof newSettings.database_path === 'string') {
      dynamicDbPathFromSettings = path.resolve(newSettings.database_path);
      console.log(`Database path updated from settings.json: ${dynamicDbPathFromSettings}`);
    } else {
      dynamicDbPathFromSettings = null; // Reset if not present or invalid
      console.log("No valid database_path in settings.json, will use CLI arg or default.");
    }

    currentSettings = newSettings; // Update currentSettings after processing database_path
    console.log("settings.json loaded successfully.");

    // Update outputDirectoryPath based on new settings
    if (currentSettings?.output_dir) {
      outputDirectoryPath = path.resolve(currentSettings.output_dir);
      console.log(`Output directory updated from settings.json: ${outputDirectoryPath}`);
    } else {
      outputDirectoryPath = process.cwd(); // Default if not specified
      console.log(`Output directory set to default (CWD) as output_dir not in settings.json: ${outputDirectoryPath}`);
    }


    if (notifyRenderer && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("settings-updated", currentSettings);
    }

    // If database_path from settings has changed, attempt to reload database.json
    if (dynamicDbPathFromSettings !== oldDbPathFromSettings) {
      console.log("Database path from settings changed, attempting to reload database.json...");
      // We need to ensure this doesn't quit the app if called during a settings reload
      // and the new path is invalid. The original loadDatabaseConfigAndQuitOnError handles quitting.
      // For reloads, we might want a softer failure (e.g., notify renderer, keep old db config).
      // For simplicity now, we'll call it. Consider refining error handling for reloads.
      if (!loadDatabaseConfigAndQuitOnError(true)) { // Pass a flag to indicate it's a reload
        console.warn("Reload of database.json due to settings change failed. Check settings.json and database file.");
        // Optionally, revert to old DB config or clear it and notify renderer
      }
    }
    return true;
  } catch (error: any) {
    console.error(`Failed to load/reload settings.json:`, error);
    currentSettings = { platforms: [] }; // Fallback to empty platforms
    outputDirectoryPath = process.cwd(); // Fallback output dir
    dynamicDbPathFromSettings = null; // Reset on error
    if (notifyRenderer && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("settings-error", {
        message: `Failed to reload settings.json: ${error.message}`,
      });
    }
    return false;
  }
}

// Function to set up watcher for settings.json
function setupSettingsWatcher(filePath: string) {
  if (watchedSettingsPath) {
    fs.unwatchFile(watchedSettingsPath); // Unwatch previous if any
  }
  watchedSettingsPath = filePath;
  fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs || curr.ino === 0 || (curr.size === 0 && prev.size > 0)) {
      console.log(`Change detected in ${filePath}. Reloading settings...`);
      loadSettingsConfig(true); // Reload and notify renderer
    }
  });
  console.log(`Watching ${filePath} for changes.`);
}


// Function to determine and set the output directory (Initial call)
function initializeOutputDirectory(): void {
  // Now primarily relies on loadSettingsConfig to set outputDirectoryPath
  // Call loadSettingsConfig here to ensure currentSettings and outputDirectoryPath are set at startup
  if (!loadSettingsConfig(false)) { // Load silently at first
      // If settings.json fails to load initially, outputDirectoryPath will be CWD by default from loadSettingsConfig
      console.warn(
        `Initial load of settings.json failed. Output directory defaulted to CWD.`
      );
  }
  // Setup watcher after initial load attempt
  setupSettingsWatcher(path.join(process.cwd(), "settings.json"));
}

function loadDatabaseConfigAndQuitOnError(isReload = false): boolean {
  let dbPath: string | undefined;
  const dbArgPrefix = "--database=";

  // Stop watching the old file if any
  if (watchedDbPath) {
    fs.unwatchFile(watchedDbPath);
    console.log(
      `Stopped watching ${watchedDbPath} before attempting new load.`
    );
    watchedDbPath = null;
  }

  // Priority:
  // 1. Path from settings.json (dynamicDbPathFromSettings)
  // 2. Command-line argument
  // 3. Default path
  if (dynamicDbPathFromSettings) {
    dbPath = dynamicDbPathFromSettings;
    console.log(`Using database path from settings.json: ${dbPath}`);
  } else {
    for (const arg of process.argv) {
      if (arg.startsWith(dbArgPrefix)) {
        dbPath = arg.substring(dbArgPrefix.length);
        console.log(`Using database path from command-line argument: ${dbPath}`);
        break;
      }
    }
    if (!dbPath) {
      dbPath = path.join(process.cwd(), "database.json");
      console.log(`Using default database path: ${dbPath}`);
    }
  }
  
  // Ensure dbPath is absolute if it's from settings.json or CLI
  // path.resolve in loadSettingsConfig already makes dynamicDbPathFromSettings absolute.
  // For CLI and default, path.resolve here ensures it.
  if (dbPath) { // dbPath should always be defined by this point
      dbPath = path.resolve(dbPath);
  }


  try {
    console.log(`Attempting to load database.json from: ${dbPath}`);
    const rawData = fs.readFileSync(dbPath, "utf-8");
    const newDatabaseConfig = JSON.parse(rawData); // Parse to new variable first
    databaseConfig = newDatabaseConfig; // Assign to global only on success
    console.log("database.json loaded successfully.");
    watchedDbPath = dbPath; // Store the path for watching
    setupFileWatcher(watchedDbPath); // Setup watcher for the loaded file

    // Notify renderer if it's a reload and successful
    if (isReload && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("database-updated", databaseConfig);
    }
    return true;
  } catch (error: any) {
    console.error(`Failed to load database.json from ${dbPath}:`, error);
    databaseConfig = null; // Clear database config on error

    if (isReload && mainWindow && !mainWindow.isDestroyed()) {
      // Notify renderer about the error during reload
      mainWindow.webContents.send("database-error", {
        message: `Failed to reload database.json from ${dbPath}: ${error.message}`,
      });
      return false; // Don't quit app on reload failure
    }

    // Ensure dialog is only shown if app is ready for UI
    if (app.isReady()) {
      dialog.showErrorBox(
        "Error Loading Configuration",
        `Could not load database.json.\\nPath: ${dbPath}\\nError: ${error.message}\\n\\nThe application will now exit.`
      );
    } else {
      // Fallback for errors before app is ready (though less likely for dialog)
      console.error(
        "Dialog not shown as app is not ready. Error was:",
        `Could not load database.json.\\nPath: ${dbPath}\\nError: ${error.message}`
      );
    }
    app.quit();
    return false;
  }
}

// Modify setupFileWatcher to handle potential re-assignment and notify renderer on successful reload
function setupFileWatcher(filePath: string) {
  if (!filePath) return;

  // Note: fs.watchFile will overwrite if called again for the same filePath,
  // which is fine. If filePath changes, loadDatabaseConfigAndQuitOnError handles unwatching.

  fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
    // Check if mtime or size changed. Size check helps detect deletion/truncation.
    if (
      curr.mtimeMs !== prev.mtimeMs ||
      curr.ino === 0 ||
      (curr.size === 0 && prev.size > 0)
    ) {
      console.log(`Change detected in ${filePath}. Reloading...`);
      try {
        const rawData = fs.readFileSync(filePath, "utf-8");
        const newConfig = JSON.parse(rawData);
        databaseConfig = newConfig; // Update the global config
        console.log("database.json reloaded successfully.");
        if (mainWindow && !mainWindow.isDestroyed()) {
          // Send 'database-updated' for consistency with settings reload
          mainWindow.webContents.send("database-updated", databaseConfig);
        }
      } catch (error: any) {
        console.error(
          `Failed to reload database.json from ${filePath}:`,
          error
        );
        databaseConfig = null; // Clear on error
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("database-error", {
            message: `Failed to reload ${filePath}: ${error.message}`,
          });
        }
      }
    }
  });
  console.log(`Watching ${filePath} for changes.`);
}

function createWindow() {
  const preloadPath = app.isPackaged
    ? path.join(__dirname, "preload.js")
    : path.join(__dirname, "../../src/main/preload.js");
  mainWindow = new BrowserWindow({
    // Assign to mainWindow
    width: 800,
    height: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    // mainWindow.webContents.openDevTools(); // It's often better to not open dev tools for packaged app by default
  }

  mainWindow.on("closed", () => {
    mainWindow = null; // Dereference on close
  });
}

app.whenReady().then(() => {
  initializeOutputDirectory(); // Loads settings.json, potentially sets dynamicDbPathFromSettings

  if (!loadDatabaseConfigAndQuitOnError()) { // Now uses dynamicDbPathFromSettings if available
    return;
  }

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  if (watchedDbPath) {
    fs.unwatchFile(watchedDbPath);
    console.log(`Stopped watching ${watchedDbPath}`);
  }
  if (watchedSettingsPath) { // Added: Unwatch settings.json on quit
    fs.unwatchFile(watchedSettingsPath);
    console.log(`Stopped watching ${watchedSettingsPath}`);
  }
});

ipcMain.handle("get-settings", async () => {
  // Return the current in-memory settings
  if (currentSettings === null) {
    // This case should ideally be handled by initial load, but as a fallback:
    console.warn("get-settings called before initial settings load, attempting to load now.");
    loadSettingsConfig(false); // Load silently
  }
  return currentSettings ?? { platforms: [] }; // Return fallback if still null
});

ipcMain.handle("get-database-config", async () => {
  // This assumes databaseConfig has been successfully loaded by loadDatabaseConfigAndQuitOnError.
  // If loadDatabaseConfigAndQuitOnError failed, the app would have quit.
  if (databaseConfig === null) {
    // This state should ideally not be reached if the app quits on initial loading failure.
    // However, as a fallback, attempt to load again or throw an error.
    console.error(
      "get-database-config called but databaseConfig is null. This indicates an issue with initial loading logic."
    );
    throw new Error("Database configuration is not available.");
  }
  return databaseConfig;
});

ipcMain.handle("load-config", async (_event, platform: string) => {
  if (!platform) {
    console.log(
      "load-config: platform is null or undefined, returning empty config."
    );
    return {};
  }
  const platformConfigPath = path.join(
    outputDirectoryPath,
    platform,
    "config.json"
  );
  try {
    console.log(
      `Attempting to load config for platform "${platform}" from: ${platformConfigPath}`
    );
    const data = await fs.promises.readFile(platformConfigPath, "utf-8");
    const loadedConfig = JSON.parse(data);
    console.log(`Successfully loaded config for platform "${platform}".`);
    return loadedConfig;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.log(
        `No existing config file found for platform "${platform}" at ${platformConfigPath}. Returning empty config.`
      );
    } else {
      console.error(
        `Error loading config for platform "${platform}" from ${platformConfigPath}:`,
        error
      );
    }
    return {}; // Return empty object if file not found or any other error
  }
});

ipcMain.handle("save-config", async (_event, platform, config) => {
  // No need to reload settings.json here, use currentSettings
  const platformSettings =
    currentSettings?.platforms?.find((p: any) => p.name === platform) || {};
  const platformDir = platformSettings.platform_dir || platform;
  const outputFilename = platformSettings.output_filename || "config.json";
  const batchCommandTemplate = platformSettings.batch;

  const platformOutputDir = path.join(outputDirectoryPath, platformDir); // outputDirectoryPath is now dynamic
  const file = path.join(platformOutputDir, outputFilename);

  try {
    await fs.promises.mkdir(platformOutputDir, { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(config, null, 2));
    console.log(`Config saved to: ${file}`);

    // Run batch if specified
    if (batchCommandTemplate) {
      const command = batchCommandTemplate.replace(
        "{{config_file_path}}",
        file
      );
      console.log(`Executing batch command: ${command}`);
      exec(command, (err: any, stdout: string, stderr: string) => {
        if (err) {
          console.error(`Batch command failed:`, err);
          // Optionally, send error to renderer
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("batch-error", {
              message: err.message,
            });
          }
        } else {
          console.log(`Batch command output: ${stdout}`);
        }
      });
    }

    return { success: true, path: file };
  } catch (error: any) {
    console.error(`Failed to save config to ${file}:`, error);
    dialog.showErrorBox(
      "Error Saving Configuration",
      `Could not save configuration to ${file}.\\\\nError: ${error.message}`
    );
    return { success: false, error: error.message };
  }
});
