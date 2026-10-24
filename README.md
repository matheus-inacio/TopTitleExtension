# TopTitle

Displays the title and application icon of the currently focused window in the GNOME top bar, using a lightweight, resource-efficient implementation designed to minimize CPU and memory usage.

## Features

- **Resource Efficient**: Event-driven architecture with zero polling loops or background timers.
- **Icon and Title Display**: Shows the focused application's symbolic icon alongside its window title.
- **Smart Formatting**: Removes redundant application name repetitions and trims window separators.
- **Native AppMenu**: Click the indicator to open the native GNOME application menu.
- **Overview Aware**: Automatically hides when entering the GNOME Shell Activities Overview.
- **Filter Helpers**: Ignores desktop layers, background helpers, and internal desktop worker windows.
- **Clean Lifecycle**: Disconnects signals and clears cached patterns on window focus change or extension disable.

## Compatibility

GNOME Shell 46, 47, 48, 49, 50, and 51.

## Installation

### Using `just`

```bash
just install
```

### Manual Installation

1. Package the extension:
   ```bash
   gnome-extensions pack --out-dir=build --force .
   ```

2. Install the archive:
   ```bash
   gnome-extensions install --force build/app-title-extension@matheus-inacio.com.shell-extension.zip
   ```

3. Enable the extension:
   ```bash
   gnome-extensions enable app-title-extension@matheus-inacio.com
   ```

## Development

A `justfile` is provided with common tasks:

| Command | Description |
| --- | --- |
| `just pack` | Build the extension archive into `build/` |
| `just install` | Pack, install, and enable the extension |
| `just uninstall` | Disable and remove the extension |
| `just logs` | Stream GNOME Shell journal logs filtered for this extension |

## License

GPL-3.0-or-later
