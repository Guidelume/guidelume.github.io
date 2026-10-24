import {
    environmentDecorations,
    environmentPresets,
    normalizeEnvironmentSettings,
    seasonalThemes,
    supportedEffectIntensities,
    weatherEffects
} from "./environment-presets.js";
import { MAX_NOTE_LENGTH, normalizeWidgetState, notePalettes, validateWidgetState } from "./widgets-data.js";
import { DEFAULT_PROFILE, isProfileAvatar, MAX_DISPLAY_NAME_LENGTH, normalizeUserProfile } from "./profile-data.js";
import { normalizeDocumentOverrides, validateDocumentOverrides } from "./document-registry.js";
import { normalizeLookingGlassState, validateLookingGlassState } from "./looking-glass-data.js";
import { discoveryFlagForIcon, findDiscovery } from "./discovery-registry.js";
import { backgroundIds, themeIds } from "./appearance-palettes.js";
import { binaryStringToBytes } from "./base64.js";

export const CONFIGURATION_VERSION = 6;
export const CONFIGURATION_PREFIX = "GUIDELUME-6:";
const LEGACY_CONFIGURATION_PREFIXES = ["GUIDELUME-5:", "GUIDELUME-4:", "GUIDELUME-3:", "GUIDELUME-2:", "GUIDELUME-1:"];
export const MAX_CONFIGURATION_BYTES = 256 * 1024;

export const configurationCategories = Object.freeze([
    { id: "appearance", label: "Appearance" },
    { id: "accessibility", label: "Accessibility" },
    { id: "environment", label: "Environment" },
    { id: "desktopLayout", label: "Desktop layout" },
    { id: "windowLayout", label: "Window layout" },
    { id: "taskbar", label: "Taskbar" },
    { id: "widgets", label: "Widgets" },
    { id: "profile", label: "Profile" },
    { id: "documents", label: "Documents" },
    { id: "lookingGlass", label: "Looking Glass" }
]);

const categoryIds = new Set(configurationCategories.map(category => category.id));
const knownExportableIcons = icons => icons.filter(icon => icon.exportable !== false);
const exportableIcons = (icons, memory) => knownExportableIcons(icons).filter(icon => {
    const flag = discoveryFlagForIcon(icon.id);
    return !flag || memory.settings[flag] === true;
});
const configurationMigrations = new Map();
configurationMigrations.set(1, value => ({ ...value, formatVersion: 2 }));
configurationMigrations.set(2, value => {
    const categories = isRecord(value.categories) ? value.categories : {};
    if (!own(categories, "widgets") || !isRecord(categories.widgets)) return { ...value, formatVersion: 3 };
    return {
        ...value,
        formatVersion: 3,
        categories: {
            ...categories,
            widgets: {
                ...categories.widgets,
                preferredNotePalette: own(categories.widgets, "preferredNotePalette")
                    ? categories.widgets.preferredNotePalette : "classic"
            }
        }
    };
});
configurationMigrations.set(3, value => {
    const categories = isRecord(value.categories) ? value.categories : {};
    const widgets = categories.widgets;
    const migratedWidgets = isRecord(widgets) && Array.isArray(widgets.instances)
        ? {
            ...widgets,
            instances: widgets.instances.map(instance => instance?.type === "note"
                ? { ...instance, pinned: instance.pinned === true }
                : instance)
        }
        : widgets;
    return {
        ...value,
        formatVersion: 4,
        categories: own(categories, "widgets") ? { ...categories, widgets: migratedWidgets } : categories
    };
});
configurationMigrations.set(4, value => ({ ...value, formatVersion: 5 }));
configurationMigrations.set(5, value => ({ ...value, formatVersion: 6 }));
const themes = new Set(themeIds);
const backgrounds = new Set(backgroundIds);
const sizes = new Set(["small", "default", "large", "extra-large"]);
const bool = value => typeof value === "boolean";
const finite = value => typeof value === "number" && Number.isFinite(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function assertKeys(value, allowed, label) {
    if (!isRecord(value)) throw new Error(`${label} must be an object.`);
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key) || ["__proto__", "prototype", "constructor"].includes(key)) {
            throw new Error(`${label} contains an unsupported property.`);
        }
    }
}

function enumValue(value, choices, label) {
    if (typeof value !== "string" || !choices.has(value)) throw new Error(`${label} has an unsupported value.`);
}

function validateEnvironment(value) {
    const keys = ["enabled", "preset", "presets", "sections", "effects", "weather", "suppressedWeather", "decorations", "themes", "intensity", "weatherIntensities", "rotation"];
    assertKeys(value, keys, "Environment settings");
    if (own(value, "enabled") && !bool(value.enabled)) throw new Error("Environment enabled must be a boolean.");
    if (own(value, "preset") && value.preset !== "none" && !own(environmentPresets, value.preset)) throw new Error("Environment preset is unsupported.");
    for (const key of ["presets", "weather", "suppressedWeather", "decorations", "themes"]) {
        if (!own(value, key)) continue;
        const registry = key === "presets" ? environmentPresets
            : key === "weather" || key === "suppressedWeather" ? weatherEffects
                : key === "decorations" ? environmentDecorations : seasonalThemes;
        if (!Array.isArray(value[key]) || value[key].length > 32
            || value[key].some(item => typeof item !== "string" || !own(registry, item))) {
            throw new Error(`Environment ${key} contains unsupported values.`);
        }
    }
    if (own(value, "sections")) {
        assertKeys(value.sections, ["weather", "presets", "decorations", "themes"], "Environment sections");
        Object.values(value.sections).forEach(item => { if (!bool(item)) throw new Error("Environment sections must be booleans."); });
    }
    if (own(value, "effects")) {
        assertKeys(value.effects, ["ambientAnimation"], "Environment effects");
        if (own(value.effects, "ambientAnimation") && !bool(value.effects.ambientAnimation)) throw new Error("Ambient animation must be a boolean.");
    }
    if (own(value, "intensity")) enumValue(value.intensity, new Set(supportedEffectIntensities), "Environment intensity");
    if (own(value, "weatherIntensities")) {
        assertKeys(value.weatherIntensities, Object.keys(weatherEffects), "Weather intensities");
        Object.values(value.weatherIntensities).forEach(item => enumValue(item, new Set(supportedEffectIntensities), "Weather intensity"));
    }
    if (own(value, "rotation")) {
        assertKeys(value.rotation, ["enabled", "interval", "includeClear"], "Environment rotation");
        if (own(value.rotation, "enabled") && !bool(value.rotation.enabled)) throw new Error("Rotation enabled must be a boolean.");
        if (own(value.rotation, "includeClear") && !bool(value.rotation.includeClear)) throw new Error("Rotation includeClear must be a boolean.");
        if (own(value.rotation, "interval") && !new Set(["30m", "1h", "3h", "6h", "12h"]).has(value.rotation.interval)) throw new Error("Rotation interval is unsupported.");
    }
}

function validateConfiguration(value, knownIcons, knownWindows) {
    assertKeys(value, ["formatVersion", "categories"], "Configuration");
    if (value.formatVersion !== CONFIGURATION_VERSION) throw new Error("This configuration version is not supported.");
    assertKeys(value.categories, [...categoryIds], "Configuration categories");
    const data = value.categories;
    if (own(data, "appearance")) {
        assertKeys(data.appearance, ["theme", "background"], "Appearance");
        if (own(data.appearance, "theme")) enumValue(data.appearance.theme, themes, "Theme");
        if (own(data.appearance, "background")) enumValue(data.appearance.background, backgrounds, "Background");
    }
    if (own(data, "accessibility")) {
        assertKeys(data.accessibility, ["crtEffects", "brandingVisible", "textSize", "iconSize", "independentSizes", "reducedMotion", "accessibleFonts"], "Accessibility");
        for (const key of ["crtEffects", "brandingVisible", "independentSizes", "reducedMotion", "accessibleFonts"]) {
            if (own(data.accessibility, key) && !bool(data.accessibility[key])) throw new Error(`${key} must be a boolean.`);
        }
        for (const key of ["textSize", "iconSize"]) if (own(data.accessibility, key)) enumValue(data.accessibility[key], sizes, key);
    }
    if (own(data, "environment")) validateEnvironment(data.environment);
    if (own(data, "desktopLayout")) {
        assertKeys(data.desktopLayout, knownIcons, "Desktop layout");
        Object.values(data.desktopLayout).forEach(position => {
            assertKeys(position, ["x", "y"], "Desktop icon position");
            if (!finite(position.x) || !finite(position.y) || position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) {
                throw new Error("Desktop icon positions must be between 0 and 1.");
            }
        });
    }
    if (own(data, "windowLayout")) {
        assertKeys(data.windowLayout, knownWindows, "Window layout");
        Object.values(data.windowLayout).forEach(layout => {
            assertKeys(layout, ["x", "y", "width", "height"], "Window layout entry");
            for (const key of ["x", "y"]) if (own(layout, key) && (!finite(layout[key]) || layout[key] < 0 || layout[key] > 1)) throw new Error("Window positions must be between 0 and 1.");
            for (const key of ["width", "height"]) if (own(layout, key) && (!Number.isInteger(layout[key]) || layout[key] < 240 || layout[key] > 5000)) throw new Error("Window sizes are outside the supported range.");
        });
    }
    if (own(data, "taskbar")) {
        assertKeys(data.taskbar, ["position", "pinned", "order"], "Taskbar");
        if (own(data.taskbar, "position")) enumValue(data.taskbar.position, new Set(["top", "bottom"]), "Taskbar position");
        for (const key of ["pinned", "order"]) {
            if (!own(data.taskbar, key)) continue;
            if (!Array.isArray(data.taskbar[key]) || data.taskbar[key].length > knownWindows.length
                || data.taskbar[key].some(id => typeof id !== "string" || !knownWindows.includes(id))
                || new Set(data.taskbar[key]).size !== data.taskbar[key].length) throw new Error(`Taskbar ${key} contains unsupported values.`);
        }
    }
    if (own(data, "widgets")) {
        if (isRecord(data.widgets) && Array.isArray(data.widgets.instances)) {
            data.widgets = {
                ...data.widgets,
                instances: data.widgets.instances.map(instance => instance?.type === "note"
                    ? {
                        ...instance,
                        pinned: instance.pinned === true,
                        settings: isRecord(instance.settings) && typeof instance.settings.text === "string"
                            ? { ...instance.settings, text: instance.settings.text.slice(0, MAX_NOTE_LENGTH) }
                            : instance.settings
                    }
                    : instance)
            };
        }
        validateWidgetState(data.widgets);
        if (!own(data.widgets, "preferredNotePalette")) throw new Error("Sticky Note palette is missing from Widgets.");
    }
    if (own(data, "profile")) {
        assertKeys(data.profile, ["displayName", "avatar"], "Profile");
        if (typeof data.profile.displayName !== "string"
            || Array.from(data.profile.displayName.trim()).length > MAX_DISPLAY_NAME_LENGTH) {
            throw new Error("Profile display name is invalid.");
        }
        if (!isProfileAvatar(data.profile.avatar)) throw new Error("Profile avatar is unsupported.");
        data.profile = normalizeUserProfile(data.profile);
    }
    if (own(data, "documents")) data.documents = validateDocumentOverrides(data.documents);
    if (own(data, "lookingGlass")) data.lookingGlass = validateLookingGlassState(data.lookingGlass);
    if (Object.keys(data).length === 0) throw new Error("Choose at least one category to import.");
    return value;
}

function migrateConfiguration(value) {
    if (!isRecord(value) || !Number.isInteger(value.formatVersion)) {
        throw new Error("Configuration version is missing or invalid.");
    }
    if (value.formatVersion > CONFIGURATION_VERSION) throw new Error("This configuration version is not supported.");
    let migrated = value;
    while (migrated.formatVersion < CONFIGURATION_VERSION) {
        const migration = configurationMigrations.get(migrated.formatVersion);
        if (!migration) throw new Error("This configuration version is not supported.");
        migrated = migration(migrated);
        if (!isRecord(migrated) || !Number.isInteger(migrated.formatVersion)) {
            throw new Error("Configuration migration failed.");
        }
    }
    return migrated;
}

export function isVaultDiscoveryCode(value) {
    return findDiscovery(value)?.id === "developer-vault";
}

export function createConfiguration(memory, selectedCategories, knownIcons, knownWindows) {
    const categories = {};
    const selected = new Set(selectedCategories);
    if (selected.has("appearance")) categories.appearance = {
        theme: memory.settings.theme,
        background: memory.settings.background
    };
    if (selected.has("accessibility")) categories.accessibility = {
        crtEffects: memory.settings.crtEffects,
        brandingVisible: memory.settings.brandingVisible,
        textSize: memory.settings.textSize,
        iconSize: memory.settings.iconSize,
        independentSizes: memory.settings.independentSizes,
        reducedMotion: memory.settings.reducedMotion,
        accessibleFonts: memory.settings.accessibleFonts === true
    };
    if (selected.has("environment")) categories.environment = normalizeEnvironmentSettings(memory.settings.environment);
    if (selected.has("desktopLayout")) {
        categories.desktopLayout = Object.fromEntries(exportableIcons(knownIcons, memory).map(icon => [icon.id, {
            x: Math.max(0, Math.min(1, Number.isFinite(memory.icons[icon.id]?.x) ? memory.icons[icon.id].x : icon.x)),
            y: Math.max(0, Math.min(1, Number.isFinite(memory.icons[icon.id]?.y) ? memory.icons[icon.id].y : icon.y))
        }]));
    }
    if (selected.has("windowLayout")) categories.windowLayout = Object.fromEntries(knownWindows.map(id => {
        const saved = memory.windows[id] || {};
        const toPixels = value => {
            if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
            const match = typeof value === "string" && value.match(/^\s*(\d+(?:\.\d+)?)px\s*$/i);
            return match ? Math.round(Number(match[1])) : undefined;
        };
        const layout = {};
        if (Number.isFinite(saved.x)) layout.x = Math.max(0, Math.min(1, saved.x));
        if (Number.isFinite(saved.y)) layout.y = Math.max(0, Math.min(1, saved.y));
        const width = toPixels(saved.width);
        const height = toPixels(saved.height);
        if (width >= 240 && width <= 5000) layout.width = width;
        if (height >= 240 && height <= 5000) layout.height = height;
        return [id, layout];
    }));
    if (selected.has("taskbar")) categories.taskbar = {
        position: memory.settings.taskbar,
        pinned: memory.pinnedTaskbar.filter(id => knownWindows.includes(id)),
        order: memory.taskbarOrder.filter(id => knownWindows.includes(id))
    };
    if (selected.has("widgets")) categories.widgets = normalizeWidgetState(memory.widgets);
    if (selected.has("profile")) categories.profile = normalizeUserProfile(memory.profile || DEFAULT_PROFILE);
    if (selected.has("documents")) categories.documents = normalizeDocumentOverrides(memory.documents);
    if (selected.has("lookingGlass")) categories.lookingGlass = normalizeLookingGlassState(memory.lookingGlass);
    const configuration = { formatVersion: CONFIGURATION_VERSION, categories };
    validateConfiguration(configuration, knownExportableIcons(knownIcons).map(icon => icon.id), knownWindows);
    return configuration;
}

// Both download formats use the same compact UTF-8 payload and import size limit.
export function serializeConfiguration(configuration) {
    const bytes = new TextEncoder().encode(JSON.stringify(configuration));
    if (bytes.length > MAX_CONFIGURATION_BYTES) {
        throw new Error(`These settings exceed the ${MAX_CONFIGURATION_BYTES / 1024} KiB backup limit. Select fewer categories and try again.`);
    }
    return bytes;
}

export function encodeConfiguration(configuration) {
    const bytes = serializeConfiguration(configuration);
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return `${CONFIGURATION_PREFIX}${btoa(binary)}`;
}

export function decodeConfigurationCode(code, knownIcons, knownWindows) {
    if (typeof code !== "string") throw new Error("Configuration code is too large.");
    const trimmedCode = code.trim();
    if (trimmedCode.length > MAX_CONFIGURATION_BYTES * 2) throw new Error("Configuration code is too large.");
    const prefix = [CONFIGURATION_PREFIX, ...LEGACY_CONFIGURATION_PREFIXES].find(candidate => trimmedCode.startsWith(candidate));
    if (!prefix) throw new Error("This configuration code has an unknown prefix.");
    try {
        const encoded = trimmedCode.slice(prefix.length);
        const binary = atob(encoded);
        if (btoa(binary) !== encoded) throw new Error("Configuration code is not canonical Base64.");
        if (binary.length > MAX_CONFIGURATION_BYTES) throw new Error("Configuration is too large.");
        const bytes = binaryStringToBytes(binary);
        return parseConfiguration(new TextDecoder("utf-8", { fatal: true }).decode(bytes), knownIcons, knownWindows);
    } catch (error) {
        throw new Error(error.message?.includes("too large") ? error.message : "Configuration code is malformed or corrupted.");
    }
}

export function parseConfiguration(json, knownIcons, knownWindows) {
    if (typeof json !== "string" || new TextEncoder().encode(json).length > MAX_CONFIGURATION_BYTES) throw new Error("Configuration file is too large.");
    let parsed;
    try { parsed = JSON.parse(json); } catch { throw new Error("The configuration is not valid JSON."); }
    const configuration = migrateConfiguration(parsed);
    const iconIds = knownExportableIcons(knownIcons).map(icon => icon.id);
    // Older backups may contain positions for shortcuts now inside Unfinished.
    if (isRecord(configuration.categories?.desktopLayout)) {
        for (const id of ["looking-glass", "twfg"]) {
            if (!iconIds.includes(id)) delete configuration.categories.desktopLayout[id];
        }
    }
    return validateConfiguration(configuration, iconIds, knownWindows);
}

export function configurationPreview(configuration, memory) {
    const data = configuration.categories;
    const changes = {};
    const accessibilityLabels = {
        crtEffects: "CRT effects",
        brandingVisible: "Logo and tagline",
        textSize: "Text size",
        iconSize: "Icon size",
        independentSizes: "Independent sizing",
        reducedMotion: "Reduced motion",
        accessibleFonts: "Accessible font"
    };
    if (data.appearance) changes.appearance = [
        data.appearance.theme !== undefined && data.appearance.theme !== memory.settings.theme ? "Theme" : null,
        data.appearance.background !== undefined && data.appearance.background !== memory.settings.background ? "Background" : null
    ].filter(Boolean);
    if (data.accessibility) changes.accessibility = Object.keys(data.accessibility)
        .filter(key => data.accessibility[key] !== memory.settings[key])
        .map(key => accessibilityLabels[key] || key);
    if (data.environment) changes.environment = ["Environmental preferences"];
    if (data.desktopLayout) changes.desktopLayout = ["Desktop icon positions"];
    if (data.windowLayout) changes.windowLayout = ["Window positions and sizes"];
    if (data.taskbar) changes.taskbar = ["Taskbar position and pinned items"];
    if (data.widgets) {
        const noteCount = data.widgets.instances.filter(instance => instance.type === "note").length;
        changes.widgets = [
            "Widget positions, sizes, and preferences",
            `${noteCount} Sticky Note${noteCount === 1 ? "" : "s"} with saved contents`,
            `Sticky Note palette: ${data.widgets.preferredNotePalette || "classic"}`
        ];
    }
    if (data.profile) {
        const current = normalizeUserProfile(memory.profile);
        const profile = normalizeUserProfile(data.profile);
        changes.profile = [
            profile.displayName !== current.displayName ? `Display name: ${profile.displayName}` : null,
            profile.avatar !== current.avatar ? "Profile avatar" : null
        ].filter(Boolean);
    }
    if (data.documents) {
        const count = Object.keys(data.documents).length;
        changes.documents = [count
            ? `${count} locally edited document${count === 1 ? "" : "s"}`
            : "No saved document edits; importing this category clears current local edits"];
    }
    if (data.lookingGlass) changes.lookingGlass = [
        `${data.lookingGlass.bookmarks.length} personal bookmarks`,
        "Last selected video and library visibility"
    ];
    return changes;
}

export function applyConfiguration(memory, configuration, selectedCategories, { knownIcons, knownWindows, viewport }) {
    const data = configuration.categories;
    const selected = new Set(selectedCategories);
    // Untouched objects are still used by live widget handlers. Keep their
    // identity and stage only the categories being changed.
    const next = { ...memory };
    if (["appearance", "accessibility", "environment", "taskbar"].some(id => selected.has(id) && data[id])) {
        next.settings = { ...memory.settings };
    }
    if (selected.has("appearance") && data.appearance) Object.assign(next.settings, data.appearance);
    if (selected.has("accessibility") && data.accessibility) Object.assign(next.settings, data.accessibility);
    if (selected.has("environment") && data.environment) next.settings.environment = normalizeEnvironmentSettings(data.environment);
    if (selected.has("desktopLayout") && data.desktopLayout) {
        next.icons = { ...memory.icons };
        const placed = [];
        knownIcons.forEach(icon => {
            const position = data.desktopLayout[icon.id];
            if (!position) {
                const reservedPosition = next.icons[icon.id] || { x: icon.x, y: icon.y };
                const maxX = Math.max(0, 1 - (icon.width || 140) / viewport.width);
                const maxY = Math.max(0, 1 - (icon.height || 100) / viewport.height);
                placed.push({
                    x: Math.max(0, Math.min(maxX, reservedPosition.x)),
                    y: Math.max(0, Math.min(maxY, reservedPosition.y)),
                    width: icon.width || 140,
                    height: icon.height || 100
                });
                return;
            }
            if (position) {
                const iconWidth = icon.width || 140;
                const iconHeight = icon.height || 100;
                const maxX = Math.max(0, 1 - iconWidth / viewport.width);
                const maxY = Math.max(0, 1 - iconHeight / viewport.height);
                const clamp = candidate => ({
                    x: Math.max(0, Math.min(maxX, candidate.x)),
                    y: Math.max(0, Math.min(maxY, candidate.y))
                });
                const candidates = [clamp(position), clamp({ x: icon.x, y: icon.y })];
                for (let row = 0; row < 8; row += 1) {
                    for (let column = 0; column < 8; column += 1) {
                        candidates.push(clamp({ x: column / 7, y: row / 7 }));
                    }
                }
                const candidate = candidates.find(item => placed.every(other => {
                    const overlapX = Math.max(0, Math.min(item.x * viewport.width + iconWidth, other.x * viewport.width + other.width)
                        - Math.max(item.x * viewport.width, other.x * viewport.width));
                    const overlapY = Math.max(0, Math.min(item.y * viewport.height + iconHeight, other.y * viewport.height + other.height)
                        - Math.max(item.y * viewport.height, other.y * viewport.height));
                    return !(overlapX > Math.min(iconWidth, other.width) * 0.25
                        && overlapY > Math.min(iconHeight, other.height) * 0.25);
                })) || candidates[0];
                next.icons[icon.id] = candidate;
                placed.push({ x: candidate.x, y: candidate.y, width: iconWidth, height: iconHeight });
            }
        });
    }
    if (selected.has("windowLayout") && data.windowLayout) {
        next.windows = { ...memory.windows };
        knownWindows.forEach(id => {
            const layout = data.windowLayout[id];
            if (!layout) return;
            const existing = next.windows[id] || {};
            const result = { ...existing };
            const width = (layout.width ?? Number.parseFloat(result.width)) || 760;
            const height = (layout.height ?? Number.parseFloat(result.height)) || 560;
            const restoredWidth = Math.min(width, Math.max(240, viewport.width - 32));
            const restoredHeight = Math.min(height, Math.max(240, viewport.height - 64));
            const xMargin = Math.min(0.5, (Math.min(restoredWidth, viewport.width) / 2 + 16) / viewport.width);
            const yMargin = Math.min(0.5, (Math.min(restoredHeight, viewport.height) / 2 + 16) / viewport.height);
            if (layout.x !== undefined) result.x = Math.max(xMargin, Math.min(1 - xMargin, layout.x));
            if (layout.y !== undefined) result.y = Math.max(yMargin, Math.min(1 - yMargin, layout.y));
            if (layout.width !== undefined) result.width = `${restoredWidth}px`;
            if (layout.height !== undefined) result.height = `${restoredHeight}px`;
            next.windows[id] = result;
        });
    }
    if (selected.has("taskbar") && data.taskbar) {
        if (data.taskbar.position !== undefined) next.settings.taskbar = data.taskbar.position;
        const available = id => {
            const flag = discoveryFlagForIcon(id);
            return !flag || next.settings[flag] === true;
        };
        if (data.taskbar.pinned !== undefined) next.pinnedTaskbar = data.taskbar.pinned.filter(available);
        if (data.taskbar.order !== undefined) next.taskbarOrder = data.taskbar.order.filter(available);
    }
    if (selected.has("widgets") && data.widgets) next.widgets = structuredClone(data.widgets);
    if (selected.has("profile") && data.profile) next.profile = normalizeUserProfile(data.profile);
    if (selected.has("documents") && data.documents) next.documents = normalizeDocumentOverrides(data.documents);
    if (selected.has("lookingGlass") && data.lookingGlass) next.lookingGlass = normalizeLookingGlassState(data.lookingGlass);
    Object.assign(memory, next);
}
