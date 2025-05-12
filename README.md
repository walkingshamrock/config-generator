# Config Generator

Config Generator is a desktop application built with Electron, Vite, React, TypeScript, and Tailwind CSS. It provides a user-friendly interface to generate `config.json` files for various local development tools and applications, streamlining their setup and configuration.

## Key Features

- **Dynamic Platform Configuration**: Define platforms (applications or services) and their specific configuration needs through `settings.json`.
- **Tool Integration**: Leverages a `database.json` to define available tools (e.g., MCP servers) and their parameters.
- **Live Settings Reload**: `settings.json` is monitored for changes. Any updates to this file (e.g., changing the output directory, modifying platform definitions) are reflected in the application automatically without requiring a restart.
- **Customizable Output**: Specify output directories and filenames for generated configurations.
- **Batch Operations**: Define and execute post-generation batch commands (e.g., injecting secrets, moving files) for each platform via `settings.json`.
- **Modern Tech Stack**: Built with Electron, React, Vite, TypeScript, and Tailwind CSS for a responsive and maintainable application.

## Configuration Files

The application relies on two main JSON files for its configuration:

### 1. `settings.json`

This file controls the application-wide settings and defines the "platforms" that the user can select and configure.

- **Location**: Must be placed in the root directory of the project (alongside `package.json`).
- **Live Reload**: Changes to this file are automatically detected and applied to the running application.
- **Structure**:
  - `output_dir` (optional): Specifies a global output directory for all generated configuration files. If commented out or missing, defaults to the project root.
  - `platforms` (array): Defines the list of platforms available in the application's dropdown menu. Each platform object can have:
    - `name` (string, required): Display name in the UI.
    - `platform_dir` (string, optional): Subdirectory under the main `output_dir` for this platform's files. Defaults to the `name`.
    - `output_filename` (string, optional): Name of the generated config file. Defaults to `config.json`.
    - `batch` (string, optional): A shell command to execute after the configuration file is saved. Supports the placeholder `{{config_file_path}}`, which is replaced with the absolute path to the generated file.

**Example `settings.json`:**

```jsonc
// settings.json
{
  // "output_dir": "output", // Optional: custom global output directory
  "platforms": [
    {
      "name": "Claude Desktop",
      "platform_dir": "ClaudeConfig", // Outputs to "output/ClaudeConfig" if output_dir is "output"
      "output_filename": "claude_settings.json",
      "batch": "op inject -i \"{{config_file_path}}\" > \"~/Library/Application Support/Claude/claude_desktop_config.json\""
    },
    {
      "name": "Another Tool"
      // ... other properties
    }
  ]
}
```

### 2. `database.json`

This file defines the available "tools" or "MCP servers" and their associated commands or settings that can be configured for each platform.

- **Location**:
  1. **Command-line Argument**: Specify a path using `--database=/path/to/your/database.json`.
  2. **Project Root (Default)**: If no argument is provided, it looks for `database.json` in the project root.
- **Error Handling**: If not found or invalid, the application will show an error and exit.
- **Live Reload**: Changes to this file are automatically detected, and the new configuration is loaded.
- **Structure Example**:

```json
// database.json
{
  "mcpServers": {
    "mcp-time": {
      "command": "mcp-time",
      "args": ["--format", "hh:mm:ss"]
    },
    "mcp-spotify": {
      "command": "mcp-spotify",
      "args": ["--now-playing"]
    }
    // ... other tools
  }
}
```

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS version recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)

## Installation

1. Clone the repository:

    ```bash
    git clone <your-repository-url>
    cd config-generator
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

## Development

To run the application in development mode with hot reloading:

```bash
npm run dev
```

This command will:

1. Start the Vite development server for the renderer process.
2. Wait for the Vite server to be ready.
3. Compile the main process TypeScript code.
4. Launch the Electron application.

## Building for Production

To build the application for production:

```bash
npm run build
```

This will compile the TypeScript code and package the application using Vite and Electron Builder. The output will be in the `dist` directory (or as configured in `electron-builder` settings within `package.json`).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
