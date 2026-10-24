// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {AppMenu} from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const EXCLUDED_PREFIX_RE = /^(?:com\.|gjs)/i;
const REGEX_ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
const REGEX_SPACE_NORM_RE = /[\s\-_]+/g;

// Cache compiled regexes and exclusion status per app name so window focus
// and title changes never re-allocate RegExp objects.
const _appInfoCache = new Map();

function getAppTitlePatterns(appName) {
    let cached = _appInfoCache.get(appName);
    if (cached !== undefined)
        return cached;

    const trimmed = appName.trim();
    if (!trimmed || EXCLUDED_PREFIX_RE.test(trimmed)) {
        _appInfoCache.set(appName, null);
        return null;
    }

    const escaped = trimmed
        .replace(REGEX_ESCAPE_RE, '\\$&')
        .replace(REGEX_SPACE_NORM_RE, '[\\s\\-_]+');

    cached = {
        name: trimmed,
        end: new RegExp(`[\\s\\-\\—\\–\\−\\|:]*${escaped}\\s*$`, 'i'),
        start: new RegExp(`^\\s*${escaped}[\\s\\-\\—\\–\\−\\|:]*`, 'i'),
        middle: new RegExp(`([\\s\\-\\—\\–\\−\\|:]+)${escaped}([\\s\\-\\—\\–\\−\\|:]+)`, 'i'),
    };
    _appInfoCache.set(appName, cached);
    return cached;
}

function stripAppName(title, patterns) {
    let stripped = title.replace(patterns.end, '');
    if (stripped !== title)
        return stripped.replace(patterns.start, '');

    stripped = title.replace(patterns.start, '');
    if (stripped !== title)
        return stripped;

    stripped = title.replace(patterns.middle, '$1');
    if (stripped !== title)
        return stripped;

    // Fallback when window title suffix differs slightly from the .desktop Name
    const dashIndex = Math.max(title.lastIndexOf(' - '), title.lastIndexOf(' — '));
    return dashIndex !== -1 ? title.substring(0, dashIndex) : title;
}

const AppTitleIndicator = GObject.registerClass(
class AppTitleIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'TopTitle', true);

        this._tracker = Shell.WindowTracker.get_default();
        this._focusWindow = null;
        this._titleSignalId = 0;
        this._app = null;
        this._appPatterns = null;
        this._lastRawTitle = null;
        this._hasValidTarget = false;

        this._menu = new AppMenu(this);
        this._menu._arrowAlignment = 0.0;
        this._menu.setSourceAlignment(0.0);
        this.setMenu(this._menu);

        const box = new St.BoxLayout({style_class: 'app-title-box'});

        this._icon = new St.Icon({
            style_class: 'app-menu-icon app-title-icon',
            icon_size: 16,
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._icon);

        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._label);

        this.add_child(box);

        global.display.connectObject(
            'notify::focus-window', () => this._onFocusChanged(),
            this);
        this._tracker.connectObject(
            'notify::focus-app', () => this._onFocusAppChanged(),
            this);
        Main.overview.connectObject(
            'showing', () => this._onOverviewShowing(),
            'hidden', () => this._onOverviewHidden(),
            this);

        this._onFocusChanged();
    }

    _onOverviewShowing() {
        if (this._menu.isOpen)
            this._menu.close({animate: false});
        this.hide();
    }

    _onOverviewHidden() {
        if (!global.display.focus_window)
            this._onFocusChanged();
        else if (this._hasValidTarget)
            this.show();
    }

    _disconnectWindow() {
        if (this._focusWindow && this._titleSignalId) {
            this._focusWindow.disconnect(this._titleSignalId);
            this._titleSignalId = 0;
        }
        this._focusWindow = null;
    }

    _onFocusChanged() {
        const window = global.display.focus_window;

        // Keep current indicator state while the menu is open or overview holds modal focus
        if (!window && (this._menu.isOpen || Main.overview.visible))
            return;

        if (window === this._focusWindow && window !== null)
            return;

        this._disconnectWindow();
        this._lastRawTitle = null;

        if (!window || window.get_window_type() === Meta.WindowType.DESKTOP) {
            this._clearDisplay();
            return;
        }

        this._focusWindow = window;
        this._titleSignalId = window.connect('notify::title', () => this._updateTitle());

        this._syncApp();
        this._updateTitle();
    }

    _onFocusAppChanged() {
        if (!this._focusWindow)
            return;

        if (this._syncApp()) {
            this._lastRawTitle = null;
            this._updateTitle();
        }
    }

    _syncApp() {
        const app = this._tracker.focus_app ??
            this._tracker.get_window_app(this._focusWindow);

        if (app === this._app)
            return false;

        this._app = app;
        const rawName = app ? app.get_name() : null;
        this._appPatterns = rawName ? getAppTitlePatterns(rawName) : null;

        // If the app exists but is excluded (e.g. gjs / com.* desktop helper),
        // mark patterns as null so _updateTitle clears the display.
        if (app && !this._appPatterns) {
            this._icon.gicon = null;
            this._menu.setApp(null);
            return true;
        }

        const gicon = app ? app.get_icon() : null;
        if (this._icon.gicon !== gicon)
            this._icon.gicon = gicon;

        this._menu.setApp(app);
        return true;
    }

    _updateTitle() {
        if (!this._focusWindow)
            return;

        // Excluded app (e.g. DING / gjs background window)
        if (this._app && !this._appPatterns) {
            this._clearDisplay();
            return;
        }

        const rawTitle = this._focusWindow.get_title();
        if (rawTitle === this._lastRawTitle)
            return;
        this._lastRawTitle = rawTitle;

        if (!rawTitle || rawTitle.includes('@!0,0')) {
            this._clearDisplay();
            return;
        }

        const trimmedTitle = rawTitle.trim();
        if (!trimmedTitle || EXCLUDED_PREFIX_RE.test(trimmedTitle)) {
            this._clearDisplay();
            return;
        }

        let displayText;
        if (this._appPatterns) {
            const appName = this._appPatterns.name;
            const cleanTitle = stripAppName(trimmedTitle, this._appPatterns);
            displayText = (!cleanTitle || cleanTitle === appName)
                ? appName
                : `${appName} - ${cleanTitle}`;
        } else {
            const dashIndex = Math.max(
                trimmedTitle.lastIndexOf(' - '),
                trimmedTitle.lastIndexOf(' — '));
            displayText = dashIndex !== -1
                ? trimmedTitle.substring(0, dashIndex)
                : trimmedTitle;
        }

        if (this._label.text !== displayText)
            this._label.text = displayText;

        this._hasValidTarget = true;
        this.reactive = true;
        if (!Main.overview.visible && !this.visible)
            this.show();
    }

    _clearDisplay() {
        this._hasValidTarget = false;
        this._lastRawTitle = null;
        if (this._label.text !== '')
            this._label.text = '';
        if (this._icon.gicon !== null)
            this._icon.gicon = null;
        this._app = null;
        this._appPatterns = null;
        this.reactive = false;
        if (this._menu.isOpen)
            this._menu.close({animate: false});
        this._menu.setApp(null);
        this.hide();
    }

    destroy() {
        this._disconnectWindow();
        this._tracker = null;
        this._app = null;
        this._appPatterns = null;
        super.destroy();
    }
});

export default class AppTitleExtension extends Extension {
    enable() {
        this._indicator = new AppTitleIndicator();
        Main.panel.addToStatusArea('window-title', this._indicator, -1, 'left');
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        _appInfoCache.clear();
    }
}
