uuid := "app-title-extension@matheus-inacio.com"
zip := "build" / uuid + ".shell-extension.zip"

default:
    @just --list

# Build the extension zip into build/
pack:
    mkdir -p build
    gnome-extensions pack --out-dir=build --force .

# Pack, install and enable
install: pack
    gnome-extensions install --force {{zip}}
    gnome-extensions enable {{uuid}} || echo "Log out and back in, then run: just install"

# Disable and remove the extension
uninstall:
    -gnome-extensions disable {{uuid}}
    gnome-extensions uninstall {{uuid}}

# Follow GNOME Shell logs for this extension
logs:
    journalctl -f -o cat /usr/bin/gnome-shell | grep --line-buffered -i "app-title"
