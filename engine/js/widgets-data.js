export const MAX_WIDGETS = 14;
export const MAX_NOTES = 12;
export const MAX_NOTE_LENGTH = 500;

export const widgetTypes = Object.freeze({
    clock: { label: "Analogue Clock", singleton: true },
    calendar: { label: "Calendar", singleton: true },
    note: { label: "Sticky Note", singleton: false }
});

export const widgetSizes = new Set(["small", "medium", "large"]);
export const widgetAppearances = new Set(["glass", "solid"]);
export const noteColors = new Set(["sunlight", "mint", "rose", "lavender"]);
export const notePalettes = new Set(["classic", "halloween", "christmas", "new-years"]);
export const clockHourFormats = new Set(["system", "12", "24"]);
export const calendarWeekStarts = new Set(["locale", "sunday", "monday"]);

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const finite = value => typeof value === "number" && Number.isFinite(value);
const defaultLocale = () => {
    try { return Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || "en-US"; }
    catch { return "en-US"; }
};
const defaultTimeZone = () => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch { return "UTC"; }
};

export function isSupportedLocale(value) {
    if (typeof value !== "string" || value.length < 2 || value.length > 64) return false;
    try { return Intl.getCanonicalLocales(value).length === 1; }
    catch { return false; }
}

export function isSupportedTimeZone(value) {
    if (typeof value !== "string" || value.length < 1 || value.length > 64) return false;
    try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
    } catch { return false; }
}

export function createDefaultWidgetSettings(type) {
    if (type === "clock") return {
        locale: defaultLocale(),
        timeZone: defaultTimeZone(),
        hourFormat: "system",
        showSeconds: false
    };
    if (type === "calendar") return { locale: defaultLocale(), weekStart: "locale", monthOffset: 0 };
    if (type === "note") return { color: "sunlight", text: "" };
    return {};
}

export function createDefaultWidgetState() {
    return { instances: [], preferredNotePalette: "classic" };
}

function assertKeys(value, allowed, label) {
    if (!isRecord(value)) throw new Error(`${label} must be an object.`);
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key) || ["__proto__", "prototype", "constructor"].includes(key)) {
            throw new Error(`${label} contains an unsupported property.`);
        }
    }
}

function enumValue(value, options, label) {
    if (typeof value !== "string" || !options.has(value)) throw new Error(`${label} has an unsupported value.`);
}

function validateInstance(instance) {
    assertKeys(instance, ["id", "type", "x", "y", "size", "appearance", "settings", "pinned"], "Widget instance");
    if (typeof instance.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(instance.id)) throw new Error("Widget IDs are invalid.");
    if (!own(widgetTypes, instance.type)) throw new Error("A widget type is unsupported.");
    if (!finite(instance.x) || instance.x < 0 || instance.x > 1 || !finite(instance.y) || instance.y < 0 || instance.y > 1) {
        throw new Error("Widget positions must be between 0 and 1.");
    }
    enumValue(instance.size, widgetSizes, "Widget size");
    enumValue(instance.appearance, widgetAppearances, "Widget appearance");
    if (instance.type !== "note" && own(instance, "pinned")) throw new Error("Only Sticky Notes can be pinned.");

    if (instance.type === "clock") {
        assertKeys(instance.settings, ["locale", "timeZone", "hourFormat", "showSeconds"], "Clock settings");
        if (!isSupportedLocale(instance.settings.locale)) throw new Error("Clock locale is invalid or unavailable.");
        if (!isSupportedTimeZone(instance.settings.timeZone)) throw new Error("Clock time zone is invalid or unavailable.");
        enumValue(instance.settings.hourFormat, clockHourFormats, "Clock hour format");
        if (typeof instance.settings.showSeconds !== "boolean") throw new Error("Clock seconds preference must be a boolean.");
    } else if (instance.type === "calendar") {
        assertKeys(instance.settings, ["locale", "weekStart", "monthOffset"], "Calendar settings");
        if (!isSupportedLocale(instance.settings.locale)) throw new Error("Calendar locale is invalid or unavailable.");
        enumValue(instance.settings.weekStart, calendarWeekStarts, "Calendar week start");
        if (!Number.isInteger(instance.settings.monthOffset) || instance.settings.monthOffset < -1200 || instance.settings.monthOffset > 1200) {
            throw new Error("Calendar month offset is outside the supported range.");
        }
    } else {
        if (own(instance, "pinned") && typeof instance.pinned !== "boolean") throw new Error("Sticky Note pin state must be a boolean.");
        assertKeys(instance.settings, ["color", "text"], "Sticky Note settings");
        enumValue(instance.settings.color, noteColors, "Sticky Note color");
        if (typeof instance.settings.text !== "string" || instance.settings.text.length > MAX_NOTE_LENGTH) {
            throw new Error("Sticky Note text is outside the supported length.");
        }
    }
}

export function validateWidgetState(value) {
    assertKeys(value, ["instances", "preferredNotePalette"], "Widgets");
    if (own(value, "preferredNotePalette")) enumValue(value.preferredNotePalette, notePalettes, "Sticky Note palette");
    if (!Array.isArray(value.instances) || value.instances.length > MAX_WIDGETS) {
        throw new Error("The widget collection is too large or malformed.");
    }
    const ids = new Set();
    const counts = { clock: 0, calendar: 0, note: 0 };
    for (const instance of value.instances) {
        validateInstance(instance);
        if (ids.has(instance.id)) throw new Error("Widget IDs must be unique.");
        ids.add(instance.id);
        counts[instance.type] += 1;
        if (widgetTypes[instance.type].singleton && counts[instance.type] > 1) {
            throw new Error(`Only one ${widgetTypes[instance.type].label} can be active.`);
        }
        if (instance.type === "note" && counts.note > MAX_NOTES) throw new Error("There are too many Sticky Notes.");
    }
    return value;
}

export function normalizeWidgetState(value) {
    if (!isRecord(value) || !Array.isArray(value.instances)) return createDefaultWidgetState();
    const instances = [];
    const seenIds = new Set();
    const counts = { clock: 0, calendar: 0, note: 0 };
    for (const candidate of value.instances) {
        if (instances.length >= MAX_WIDGETS || !isRecord(candidate)) continue;
        try {
            const normalizedCandidate = candidate.type === "note"
                ? {
                    ...candidate,
                    pinned: candidate.pinned === true,
                    settings: isRecord(candidate.settings) && typeof candidate.settings.text === "string"
                        ? { ...candidate.settings, text: candidate.settings.text.slice(0, MAX_NOTE_LENGTH) }
                        : candidate.settings
                }
                : candidate;
            validateInstance(normalizedCandidate);
            if (seenIds.has(candidate.id) || (widgetTypes[candidate.type].singleton && counts[candidate.type] >= 1)) continue;
            if (candidate.type === "note" && counts.note >= MAX_NOTES) continue;
            seenIds.add(candidate.id);
            counts[candidate.type] += 1;
            instances.push({
                id: candidate.id,
                type: candidate.type,
                x: candidate.x,
                y: candidate.y,
                size: candidate.size,
                appearance: candidate.appearance,
                ...(candidate.type === "note" ? { pinned: normalizedCandidate.pinned } : {}),
                settings: { ...normalizedCandidate.settings }
            });
        } catch {
            // Skip invalid local instances while keeping the rest of the workspace available.
        }
    }
    return {
        instances,
        preferredNotePalette: notePalettes.has(value.preferredNotePalette) ? value.preferredNotePalette : "classic"
    };
}

