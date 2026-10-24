import {
    MAX_NOTE_LENGTH,
    MAX_NOTES,
    MAX_WIDGETS,
    createDefaultWidgetSettings,
    normalizeWidgetState,
    isSupportedLocale,
    isSupportedTimeZone,
    widgetTypes,
    validateWidgetState
} from "./widgets-data.js";
import { clampIconPosition, getDesktopBounds } from "./desktop-bounds.js";

const colors = [
    ["sunlight", "Sunlight"],
    ["mint", "Mint"],
    ["rose", "Rose"],
    ["lavender", "Lavender"]
];
const notePalettes = [
    ["classic", "Classic"],
    ["halloween", "Halloween"],
    ["christmas", "Christmas"],
    ["new-years", "New Year’s"]
];
const seasonalNotePalettes = new Set(notePalettes.slice(1).map(([palette]) => palette));
const sizes = [["small", "Small"], ["medium", "Medium"], ["large", "Large"]];
const appearances = [["glass", "Glass"], ["solid", "Solid"]];
const clockFormats = [["system", "System default"], ["12", "12 hour"], ["24", "24 hour"]];
const weekStarts = [["locale", "Use locale"], ["sunday", "Sunday"], ["monday", "Monday"]];

function makeId() {
    if (globalThis.crypto?.randomUUID) return `widget-${crypto.randomUUID()}`;
    return `widget-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function optionList(options, selected) {
    return options.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = value === selected;
        return option;
    });
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export function initWidgets({ memory, queueSave, saveMemory, openWindow, activateTab }) {
    const layer = document.querySelector("[data-desktop-widgets]");
    const pinnedLayer = document.querySelector("[data-pinned-widgets]") || layer;
    const manager = document.querySelector('[data-window="widgets"]');
    if (!layer || !manager) return null;

    const instanceList = manager.querySelector("[data-widget-instances]");
    const paletteContainer = manager.querySelector("[data-widget-palette-container]");
    const managerStatus = manager.querySelector("[data-widget-status]");
    const noteSaveTimers = new Map();
    const clockTimers = new Map();
    const calendarTimers = new Map();
    const widgetLocaleCache = new WeakMap();
    const clockFormatterCache = new WeakMap();
    const calendarFormatterCache = new WeakMap();
    let contextMenu = null;
    let topLayer = 10;
    memory.widgets = normalizeWidgetState(memory.widgets);

    const instances = () => memory.widgets.instances;
    const findWidget = id => instances().find(widget => widget.id === id);
    const save = () => {
        const saved = typeof saveMemory === "function" ? saveMemory() : (queueSave(), true);
        if (saved !== true) setStatus("This change remains available in this session, but browser storage could not save it.");
        return saved === true;
    };
    const setStatus = message => { if (managerStatus) managerStatus.textContent = message; };
    const effectiveNotePalette = () => {
        const activePalette = document.documentElement.dataset.seasonalTheme;
        return seasonalNotePalettes.has(activePalette) ? activePalette : memory.widgets.preferredNotePalette;
    };

    function syncNotePalette() {
        const palette = effectiveNotePalette();
        [...layer.querySelectorAll(".desktop-widget.widget-note"), ...pinnedLayer.querySelectorAll(".desktop-widget.widget-note")]
            .forEach(node => { node.dataset.notePalette = palette; });
    }

    function refreshAvailability() {
        manager.querySelectorAll("[data-widget-add]").forEach(button => {
            const type = button.dataset.widgetAdd;
            const currentCount = instances().filter(widget => widget.type === type).length;
            const alreadyActive = widgetTypes[type]?.singleton && currentCount > 0;
            const atLimit = type === "note" && currentCount >= MAX_NOTES;
            button.disabled = alreadyActive || atLimit || instances().length >= MAX_WIDGETS;
            button.textContent = alreadyActive ? "On this desktop"
                : atLimit ? "Note limit reached"
                    : `Add ${type === "note" ? "note" : type}`;
        });
        syncActivity();
    }

    function clearTimers(map) {
        map.forEach(timer => window.clearTimeout(timer));
        map.clear();
    }

    function syncActivity() {
        clearTimers(clockTimers);
        clearTimers(calendarTimers);
        if (document.hidden || layer.getClientRects().length === 0) return;
        [...layer.querySelectorAll(".desktop-widget[data-widget-type='clock']"), ...pinnedLayer.querySelectorAll(".desktop-widget[data-widget-type='clock']")].forEach(node => {
            const widget = findWidget(node.dataset.widgetId);
            if (widget) scheduleClock(widget, node);
        });
        [...layer.querySelectorAll(".desktop-widget[data-widget-type='calendar']"), ...pinnedLayer.querySelectorAll(".desktop-widget[data-widget-type='calendar']")].forEach(node => {
            const widget = findWidget(node.dataset.widgetId);
            if (widget) scheduleCalendar(widget, node);
        });
    }

    function localeFor(widget) {
        const value = widget.settings.locale;
        const cached = widgetLocaleCache.get(widget);
        if (cached?.value === value) return cached.locale;
        const locale = isSupportedLocale(value) ? value : (navigator.language || "en-US");
        widgetLocaleCache.set(widget, { value, locale });
        return locale;
    }

    function partsMap(parts) {
        return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    }

    function getClockFormatters(widget, locale) {
        const settings = widget.settings;
        const key = JSON.stringify([locale, settings.timeZone, settings.hourFormat, settings.showSeconds]);
        const cached = clockFormatterCache.get(widget);
        if (cached?.key === key) return cached.formatters;

        const requestedTimeZone = isSupportedTimeZone(settings.timeZone) ? settings.timeZone : "UTC";
        const cycle = settings.hourFormat === "12" ? "h12" : settings.hourFormat === "24" ? "h23" : undefined;
        let formatters;
        try {
            formatters = {
                timeZone: requestedTimeZone,
                parts: new Intl.DateTimeFormat("en-US", {
                    timeZone: requestedTimeZone,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hourCycle: "h23"
                }),
                readout: new Intl.DateTimeFormat(locale, {
                    timeZone: requestedTimeZone,
                    hour: "numeric",
                    minute: "2-digit",
                    ...(settings.showSeconds ? { second: "2-digit" } : {}),
                    ...(cycle ? { hourCycle: cycle } : {})
                })
            };
        } catch {
            formatters = {
                timeZone: "UTC",
                parts: new Intl.DateTimeFormat("en-US", {
                    timeZone: "UTC",
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    hourCycle: "h23"
                }),
                readout: new Intl.DateTimeFormat("en-US", {
                    timeZone: "UTC",
                    hour: "numeric",
                    minute: "2-digit"
                })
            };
        }
        clockFormatterCache.set(widget, { key, formatters });
        return formatters;
    }

    function getCalendarFormatters(widget, locale) {
        const cached = calendarFormatterCache.get(widget);
        if (cached?.locale === locale) return cached.formatters;

        const createFormatters = candidate => ({
            weekdayLong: new Intl.DateTimeFormat(candidate, { weekday: "long" }),
            monthLong: new Intl.DateTimeFormat(candidate, { month: "long" }),
            yearNumeric: new Intl.DateTimeFormat(candidate, { year: "numeric" }),
            fullDate: new Intl.DateTimeFormat(candidate, { dateStyle: "full" }),
            monthYear: new Intl.DateTimeFormat(candidate, { month: "long", year: "numeric" }),
            weekdayShortUTC: new Intl.DateTimeFormat(candidate, { weekday: "short", timeZone: "UTC" }),
            weekdayLongUTC: new Intl.DateTimeFormat(candidate, { weekday: "long", timeZone: "UTC" })
        });
        let formatters;
        try { formatters = createFormatters(locale); }
        catch { formatters = createFormatters("en-US"); }
        calendarFormatterCache.set(widget, { locale, formatters });
        return formatters;
    }

    function renderClock(widget, node) {
        const settings = widget.settings;
        const locale = localeFor(widget);
        const now = new Date();
        const { timeZone, parts, readout: readoutFormatter } = getClockFormatters(widget, locale);
        const values = partsMap(parts.formatToParts(now));
        const readout = readoutFormatter.format(now);
        const hour = Number(values.hour || 0) % 12;
        const minute = Number(values.minute || 0);
        const second = Number(values.second || 0);
        node.querySelector(".clock-hour-hand")?.style.setProperty("--hand-angle", `${(hour + minute / 60 + second / 3600) * 30}deg`);
        node.querySelector(".clock-minute-hand")?.style.setProperty("--hand-angle", `${(minute + second / 60) * 6}deg`);
        const secondsHand = node.querySelector(".clock-second-hand");
        if (secondsHand) {
            secondsHand.hidden = !settings.showSeconds;
            secondsHand.style.setProperty("--hand-angle", `${second * 6}deg`);
        }
        const readoutElement = node.querySelector(".clock-readout");
        if (readoutElement) {
            readoutElement.textContent = readout;
            readoutElement.setAttribute("aria-label", `${readout}, ${timeZone}`);
        }
        node.querySelector(".clock-face")?.setAttribute("aria-label", `Analogue clock showing ${readout} in ${timeZone}`);
    }

    function scheduleClock(widget, node) {
        renderClock(widget, node);
        const period = widget.settings.showSeconds ? 1000 : 60000;
        const now = Date.now();
        const delay = period - (now % period) + 24;
        clockTimers.set(widget.id, window.setTimeout(() => {
            if (!node.isConnected || document.hidden) return;
            scheduleClock(widget, node);
        }, delay));
    }

    function localeWeekStart(locale) {
        try {
            const localeInfo = new Intl.Locale(locale);
            const info = localeInfo.weekInfo || localeInfo.getWeekInfo?.();
            if (info?.firstDay) return info.firstDay % 7;
        } catch { /* Use the widely compatible regional fallback below. */ }
        const region = locale.match(/-([A-Za-z]{2}|\d{3})(?:-|$)/)?.[1]?.toUpperCase();
        return ["US", "CA", "JP", "PH", "IL", "MX", "BR"].includes(region) ? 0 : 1;
    }

    function calendarFirstDay(widget) {
        if (widget.settings.weekStart === "sunday") return 0;
        if (widget.settings.weekStart === "monday") return 1;
        return localeWeekStart(localeFor(widget));
    }

    const holidays = new Map([
        ["1-1", ["New Year's Day", "Neujahr"]],
        ["10-3", ["German Unity Day", "Tag der Deutschen Einheit"]],
        ["10-31", ["Halloween", "Halloween"]],
        ["12-24", ["Christmas Eve", "Heiligabend"]],
        ["12-25", ["Christmas Day", "1. Weihnachtstag"]],
        ["12-26", ["Boxing Day / Second Christmas Day", "2. Weihnachtstag"]],
        ["12-31", ["New Year's Eve", "Silvester"]]
    ]);

    function holidayFor(date, locale) {
        const labels = holidays.get(`${date.getMonth() + 1}-${date.getDate()}`);
        if (!labels) return "";
        return locale.toLowerCase().split("-")[0] === "de" ? labels[1] : labels[0];
    }

    function renderCalendar(widget, node, focusAction = null) {
        const root = node.querySelector(".calendar-widget-content");
        if (!root) return;
        const now = new Date();
        const locale = localeFor(widget);
        const formatters = getCalendarFormatters(widget, locale);
        if (widget.size === "small") {
            const weekday = formatters.weekdayLong.format(now);
            const month = formatters.monthLong.format(now);
            const year = formatters.yearNumeric.format(now);
            const spokenDate = formatters.fullDate.format(now);
            const card = element("div", "calendar-compact-card");
            card.setAttribute("role", "group");
            const holiday = holidayFor(now, locale);
            card.classList.toggle("has-holiday", Boolean(holiday));
            card.setAttribute("aria-label", holiday ? `${spokenDate} — ${holiday}` : spokenDate);
            if (holiday) card.title = holiday;
            card.append(element("span", "calendar-compact-weekday", weekday));
            card.append(element("span", "calendar-compact-day", String(now.getDate())));
            card.append(element("span", "calendar-compact-month-year", `${month} ${year}`));
            root.replaceChildren(card);
            if (focusAction) root.querySelector(`[data-calendar-action="${focusAction}"]`)?.focus();
            return;
        }
        const viewed = new Date(now.getFullYear(), now.getMonth() + widget.settings.monthOffset, 1);
        const monthTitle = formatters.monthYear.format(viewed);
        const header = element("div", "calendar-heading");
        const previous = element("button", "calendar-nav", "‹");
        previous.type = "button";
        previous.dataset.calendarAction = "previous";
        previous.setAttribute("aria-label", "Previous month");
        previous.disabled = widget.settings.monthOffset <= -1200;
        const title = element("h2", "calendar-month", monthTitle);
        const next = element("button", "calendar-nav", "›");
        next.type = "button";
        next.dataset.calendarAction = "next";
        next.setAttribute("aria-label", "Next month");
        next.disabled = widget.settings.monthOffset >= 1200;
        header.append(previous, title, next);
        const weekdayRow = element("div", "calendar-weekdays");
        weekdayRow.setAttribute("role", "row");
        const start = calendarFirstDay(widget);
        for (let index = 0; index < 7; index += 1) {
            const weekdayIndex = (start + index) % 7;
            const date = new Date(Date.UTC(2023, 0, 1 + weekdayIndex));
            const day = element("span", "", formatters.weekdayShortUTC.format(date));
            day.title = formatters.weekdayLongUTC.format(date);
            day.setAttribute("role", "columnheader");
            day.setAttribute("aria-label", day.title);
            weekdayRow.append(day);
        }
        const grid = element("div", "calendar-days");
        grid.setAttribute("role", "grid");
        grid.setAttribute("aria-label", monthTitle);
        const firstCell = new Date(viewed.getFullYear(), viewed.getMonth(), 1 - ((viewed.getDay() - start + 7) % 7));
        for (let index = 0; index < 42; index += 1) {
            if (index % 7 === 0) {
                const row = element("div", "calendar-week-row");
                row.setAttribute("role", "row");
                grid.append(row);
            }
            const date = new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + index);
            const cell = element("span", "calendar-day", String(date.getDate()));
            const isInMonth = date.getMonth() === viewed.getMonth();
            cell.classList.toggle("is-outside-month", !isInMonth);
            const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
            cell.classList.toggle("is-today", isToday);
            const spokenDate = formatters.fullDate.format(date);
            const holiday = holidayFor(date, locale);
            cell.classList.toggle("is-holiday", Boolean(holiday));
            cell.setAttribute("aria-label", holiday ? `${spokenDate} — ${holiday}` : spokenDate);
            if (holiday) cell.title = holiday;
            cell.setAttribute("role", "gridcell");
            if (isToday) cell.setAttribute("aria-current", "date");
            grid.lastElementChild.append(cell);
        }
        const todayButton = element("button", "calendar-today", "Today");
        todayButton.type = "button";
        todayButton.dataset.calendarAction = "today";
        todayButton.disabled = widget.settings.monthOffset === 0;
        root.replaceChildren(header, weekdayRow, grid, todayButton);
        if (focusAction) root.querySelector(`[data-calendar-action="${focusAction}"]`)?.focus();
    }

    function scheduleCalendar(widget, node) {
        renderCalendar(widget, node);
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
        calendarTimers.set(widget.id, window.setTimeout(() => {
            if (!node.isConnected || document.hidden) return;
            scheduleCalendar(widget, node);
        }, Math.max(1000, tomorrow.getTime() - now.getTime())));
    }

    function positionNode(widget, node, requestedPosition = null) {
        const rect = node.getBoundingClientRect();
        const positioningLayer = node.parentElement || layer;
        const width = positioningLayer.clientWidth || window.innerWidth;
        const height = positioningLayer.clientHeight || window.innerHeight;
        const layerRect = positioningLayer.getBoundingClientRect();
        const originX = layerRect.left + positioningLayer.clientLeft;
        const originY = layerRect.top + positioningLayer.clientTop;
        const position = clampIconPosition({
            ...rect,
            width: rect.width,
            height: rect.height,
            left: requestedPosition?.left ?? originX + widget.x * width,
            top: requestedPosition?.top ?? originY + widget.y * height
        }, getDesktopBounds());
        const x = position.left - originX;
        const y = position.top - originY;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        // Boundary recovery preserves the preferred saved position. Deliberate
        // dragging, keyboard movement, and pinning save the newly chosen place.
        if (requestedPosition) {
            widget.x = Math.max(0, Math.min(1, x / width));
            widget.y = Math.max(0, Math.min(1, y / height));
        }
    }

    function moveNodeToLayer(widget, node, targetLayer) {
        const beforeMove = node.getBoundingClientRect();
        targetLayer.append(node);

        positionNode(widget, node, beforeMove);
    }

    function addDragHandle(node, widget, label) {
        const handle = node.querySelector(".widget-drag-handle");
        if (!handle) return;
        handle.tabIndex = 0;
        handle.setAttribute("role", "button");
        handle.setAttribute("aria-label", `Move ${label}. Use arrow keys to reposition.`);
        let drag = null;
        handle.addEventListener("pointerdown", event => {
            if (drag || !event.isPrimary || event.button !== 0 || event.target.closest("button, input, select, textarea, a")) return;
            const rect = node.getBoundingClientRect();
            drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
            node.style.zIndex = String(++topLayer);
            handle.setPointerCapture?.(event.pointerId);
            document.body.style.userSelect = "none";
            event.preventDefault();
        });
        handle.addEventListener("keydown", event => {
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
            const current = findWidget(widget.id);
            if (!current) return;
            event.preventDefault();
            const step = event.shiftKey ? 32 : 12;
            const rect = node.getBoundingClientRect();
            const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
            const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
            positionNode(current, node, { left: rect.left + dx, top: rect.top + dy });
            save();
        });
        const move = event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const current = findWidget(widget.id);
            if (!current) return;
            positionNode(current, node, { left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY });
        };
        const finish = event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            drag = null;
            document.body.style.userSelect = "";
            save();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", finish);
        handle.addEventListener("pointercancel", finish);
        handle.addEventListener("lostpointercapture", finish);
    }

    function clockMarkup() {
        return `<div class="widget-clock-content">
            <div class="clock-face" role="img" aria-label="Analogue clock">
                <span class="clock-mark clock-mark-12">12</span><span class="clock-mark clock-mark-3">3</span>
                <span class="clock-mark clock-mark-6">6</span><span class="clock-mark clock-mark-9">9</span>
                <span class="clock-hand clock-hour-hand"></span><span class="clock-hand clock-minute-hand"></span>
                <span class="clock-hand clock-second-hand" hidden></span><span class="clock-pin"></span>
            </div><output class="clock-readout" aria-live="off"></output>
        </div>`;
    }

    function buildClock(widget, node) {
        node.innerHTML = `<div class="widget-drag-handle widget-titlebar"><span class="widget-title-mark">✦</span><span>LOCAL ORBIT</span><span class="widget-grip" aria-hidden="true">⠿</span></div>${clockMarkup()}`;
    }

    function buildCalendar(widget, node) {
        node.innerHTML = `<div class="widget-drag-handle widget-titlebar"><span class="widget-title-mark">▦</span><span>FIELD NOTES</span><span class="widget-grip" aria-hidden="true">⠿</span></div><div class="calendar-widget-content"></div>`;
        renderCalendar(widget, node);
        node.querySelector(".calendar-widget-content").addEventListener("click", event => {
            const button = event.target.closest("[data-calendar-action]");
            if (!button) return;
            const current = findWidget(widget.id);
            if (!current) return;
            const action = button.dataset.calendarAction;
            if (action === "today") current.settings.monthOffset = 0;
            else current.settings.monthOffset = Math.max(-1200, Math.min(1200, current.settings.monthOffset + (action === "next" ? 1 : -1)));
            renderCalendar(current, node, action);
            save();
        });
    }

    function buildNote(widget, node, index) {
        node.innerHTML = `<div class="widget-titlebar"><div class="widget-drag-handle widget-note-drag-handle"><span class="widget-title-mark">✎</span><span>SCRAP / ${String(index + 1).padStart(2, "0")}</span><span class="widget-save-state" aria-live="polite"></span><span class="widget-grip" aria-hidden="true">⠿</span></div><button type="button" class="widget-pin-toggle" aria-label="Pin Sticky Note above windows" title="Pin above windows" aria-pressed="false">📌</button></div><textarea class="sticky-note-text" maxlength="${MAX_NOTE_LENGTH}" aria-label="Sticky Note text" placeholder="Leave yourself a little reminder…"></textarea><p class="sticky-note-counter" aria-live="off" hidden></p>`;
        const pinButton = node.querySelector(".widget-pin-toggle");
        const updatePinControl = () => {
            const current = findWidget(widget.id);
            if (!current) return;
            node.dataset.pinned = String(current.pinned === true);
            pinButton.setAttribute("aria-pressed", String(current.pinned === true));
            pinButton.setAttribute("aria-label", current.pinned ? "Unpin Sticky Note" : "Pin Sticky Note above windows");
            pinButton.title = current.pinned ? "Pinned above windows" : "Pin above windows";
        };
        updatePinControl();
        pinButton.addEventListener("click", () => {
            const current = findWidget(widget.id);
            if (!current) return;
            current.pinned = current.pinned !== true;
            updatePinControl();
            moveNodeToLayer(current, node, current.pinned ? pinnedLayer : layer);
            save();
        });
        const textarea = node.querySelector("textarea");
        const noteCounter = node.querySelector(".sticky-note-counter");
        textarea.value = widget.settings.text;
        const updateNoteCounter = () => {
            const remaining = Math.max(0, MAX_NOTE_LENGTH - textarea.value.length);
            noteCounter.hidden = textarea.value.length <= 400;
            noteCounter.textContent = `${remaining} characters remaining`;
        };
        updateNoteCounter();
        textarea.addEventListener("input", () => {
            const current = findWidget(widget.id);
            if (!current) return;
            current.settings.text = textarea.value.slice(0, MAX_NOTE_LENGTH);
            if (textarea.value.length > MAX_NOTE_LENGTH) textarea.value = current.settings.text;
            updateNoteCounter();
            window.clearTimeout(noteSaveTimers.get(widget.id));
            noteSaveTimers.set(widget.id, window.setTimeout(() => {
                noteSaveTimers.delete(widget.id);
                const saved = typeof saveMemory === "function" ? saveMemory() : true;
                const message = saved === true ? "" : "Not saved";
                node.querySelector(".widget-save-state").textContent = message;
                if (saved !== true) setStatus("This note remains available in this session, but browser storage could not save it.");
            }, 320));
        });
    }

    function renderDesktop() {
        closeContextMenu();
        clearTimers(clockTimers);
        clearTimers(calendarTimers);
        layer.replaceChildren();
        if (pinnedLayer !== layer) pinnedLayer.replaceChildren();
        let noteIndex = 0;
        instances().forEach(widget => {
            const node = element("article", `desktop-widget widget-${widget.type} widget-size-${widget.size} widget-appearance-${widget.appearance}`);
            node.dataset.widgetId = widget.id;
            node.dataset.widgetType = widget.type;
            if (widget.type === "note") {
                node.dataset.noteColor = widget.settings.color;
                node.dataset.notePalette = effectiveNotePalette();
                node.dataset.pinned = String(widget.pinned === true);
                buildNote(widget, node, noteIndex++);
            } else if (widget.type === "clock") buildClock(widget, node);
            else buildCalendar(widget, node);
            node.addEventListener("contextmenu", event => {
                if (event.target.closest("textarea, input, select, button, a")) return;
                event.preventDefault();
                showContextMenu(widget, event.clientX, event.clientY);
            });
            node.addEventListener("pointerdown", () => { node.style.zIndex = String(++topLayer); }, { passive: true });
            (widget.type === "note" && widget.pinned === true ? pinnedLayer : layer).append(node);
            addDragHandle(node, widget, widgetTypes[widget.type].label);
            positionNode(widget, node);
        });
        layer.removeAttribute("aria-hidden");
        pinnedLayer.removeAttribute("aria-hidden");
        syncActivity();
    }

    function makeMenuButton(menu, label, action, { checked, disabled = false } = {}) {
        const button = element("button", "widget-menu-item", label);
        button.type = "button";
        button.setAttribute("role", checked === undefined ? "menuitem" : "menuitemcheckbox");
        if (checked !== undefined) button.setAttribute("aria-checked", String(checked));
        button.disabled = disabled;
        button.addEventListener("click", () => {
            action();
            closeContextMenu();
        });
        menu.append(button);
        return button;
    }

    function addMenuSeparator(menu) {
        menu.append(element("div", "widget-menu-separator"));
    }

    function showContextMenu(widget, x, y) {
        closeContextMenu();
        const menu = element("div", "widget-context-menu");
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", `${widgetTypes[widget.type].label} options`);
        contextMenu = { menu, widgetId: widget.id };
        if (widget.type === "clock") {
            makeMenuButton(menu, `${widget.settings.showSeconds ? "✓" : "　"} Show seconds hand`, () => {
                widget.settings.showSeconds = !widget.settings.showSeconds;
                renderDesktop();
                renderManager();
                save();
            }, { checked: widget.settings.showSeconds });
            makeMenuButton(menu, "Time zone and locale…", () => openWidgetSettings(widget.id, "timezone"));
            makeMenuButton(menu, "12/24-hour readout…", () => openWidgetSettings(widget.id, "hour-format"));
        } else if (widget.type === "calendar") {
            makeMenuButton(menu, "Return to current month", () => {
                widget.settings.monthOffset = 0;
                renderDesktop();
                renderManager();
                save();
            }, { disabled: widget.settings.monthOffset === 0 });
            addMenuSeparator(menu);
            makeMenuButton(menu, `Week starts: ${widget.settings.weekStart}`, () => openWidgetSettings(widget.id, "week-start"));
            makeMenuButton(menu, "Calendar preferences…", () => openWidgetSettings(widget.id, "calendar-locale"));
        } else {
            const colorMenu = element("div", "widget-menu-colors");
            colorMenu.setAttribute("role", "group");
            colorMenu.setAttribute("aria-label", "Sticky Note color");
            colors.forEach(([color, label]) => {
                const button = element("button", `widget-color-swatch swatch-${color}`);
                button.type = "button";
                button.title = label;
                button.setAttribute("aria-label", `${label} note`);
                button.setAttribute("aria-pressed", String(widget.settings.color === color));
                button.addEventListener("click", () => {
                    widget.settings.color = color;
                    renderDesktop();
                    renderManager();
                    save();
                    closeContextMenu();
                });
                colorMenu.append(button);
            });
            menu.append(colorMenu);
            makeMenuButton(menu, "Duplicate note", () => duplicateNote(widget));
            makeMenuButton(menu, "Clear note contents…", () => clearNote(widget));
        }
        addMenuSeparator(menu);
        makeMenuButton(menu, "Widget Settings…", () => openWidgetSettings(widget.id));
        document.body.append(menu);
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(window.innerWidth - rect.width - 8, x))}px`;
        menu.style.top = `${Math.max(8, Math.min(window.innerHeight - rect.height - 8, y))}px`;
        menu.querySelector("button:not(:disabled)")?.focus();
    }

    function closeContextMenu() {
        if (!contextMenu) return;
        contextMenu.menu.remove();
        contextMenu = null;
    }

    function openWidgetSettings(id, target = "size") {
        closeContextMenu();
        renderManager();
        activateTab?.("widgets-manage");
        openWindow("widgets");
        window.setTimeout(() => {
            const card = Array.from(instanceList.querySelectorAll("[data-widget-instance-card]")).find(item => item.dataset.widgetId === id);
            card?.scrollIntoView({ block: "center", behavior: document.documentElement.dataset.reducedMotion === "true" ? "auto" : "smooth" });
            const selectors = {
                timezone: "[data-widget-timezone]",
                "hour-format": "[data-widget-hour-format]",
                "week-start": "[data-widget-week-start]",
                "calendar-locale": "[data-widget-calendar-locale]",
                size: "[data-widget-size]"
            };
            card?.querySelector(selectors[target] || selectors.size)?.focus({ preventScroll: true });
        }, 0);
    }

    function duplicateNote(widget) {
        if (instances().filter(item => item.type === "note").length >= MAX_NOTES || instances().length >= MAX_WIDGETS) {
            setStatus(`You can keep up to ${MAX_NOTES} Sticky Notes.`);
            return;
        }
        const clone = structuredClone(widget);
        clone.id = makeId();
        clone.x = Math.min(0.9, widget.x + 0.035);
        clone.y = Math.min(0.9, widget.y + 0.045);
        instances().push(clone);
        renderDesktop();
        renderManager();
        save();
        setStatus("Sticky Note duplicated.");
    }

    function clearNote(widget) {
        if (!widget.settings.text) return;
        if (!window.confirm("Clear all text from this Sticky Note?")) return;
        widget.settings.text = "";
        renderDesktop();
        renderManager();
        save();
        setStatus("Sticky Note cleared.");
    }

    function createWidget(type) {
        if (!widgetTypes[type] || instances().length >= MAX_WIDGETS) {
            setStatus("The desktop has reached its widget limit.");
            return;
        }
        if (widgetTypes[type].singleton && instances().some(widget => widget.type === type)) {
            setStatus(`Only one ${widgetTypes[type].label} can be active. Remove it first to add it again.`);
            return;
        }
        if (type === "note" && instances().filter(widget => widget.type === "note").length >= MAX_NOTES) {
            setStatus(`You can keep up to ${MAX_NOTES} Sticky Notes.`);
            return;
        }
        const sameType = instances().filter(widget => widget.type === type).length;
        const basePositions = type === "clock" ? { x: 0.72, y: 0.08 }
            : type === "calendar" ? { x: 0.72, y: 0.48 }
                : { x: 0.46, y: 0.12 };
        const widget = {
            id: makeId(), type, x: Math.min(0.88, basePositions.x + sameType * 0.04),
            y: Math.min(0.78, basePositions.y + sameType * 0.045), size: "medium", appearance: "glass",
            ...(type === "note" ? { pinned: false } : {}),
            settings: createDefaultWidgetSettings(type)
        };
        instances().push(widget);
        renderDesktop();
        renderManager();
        save();
        setStatus(`${widgetTypes[type].label} added to the desktop.`);
    }

    function removeWidget(widget) {
        if (widget.type === "note" && widget.settings.text.trim()
            && !window.confirm("Remove this Sticky Note and permanently delete its text?")) return;
        if (widget.type !== "note"
            && !window.confirm(`Remove the ${widgetTypes[widget.type].label} from the desktop?`)) return;
        memory.widgets.instances = instances().filter(item => item.id !== widget.id);
        renderDesktop();
        renderManager();
        save();
        setStatus(`${widgetTypes[widget.type].label} removed.`);
    }

    function labelControl(labelText, control) {
        const label = element("label", "widget-setting-row");
        label.append(element("span", "", labelText), control);
        return label;
    }

    function selectControl(className, options, value, ariaLabel) {
        const select = element("select", "widget-setting-select");
        if (className) select.classList.add(className);
        select.setAttribute("aria-label", ariaLabel);
        select.append(...optionList(options, value));
        return select;
    }

    function textControl(className, value, ariaLabel, placeholder = "") {
        const input = element("input", "widget-setting-input");
        input.type = "text";
        if (className) input.classList.add(className);
        input.value = value;
        input.maxLength = 64;
        input.autocomplete = "off";
        input.spellcheck = false;
        input.setAttribute("aria-label", ariaLabel);
        input.placeholder = placeholder;
        return input;
    }

    function renderManager() {
        if (!instanceList) return;
        instanceList.replaceChildren();
        if (paletteContainer) {
            paletteContainer.replaceChildren();
            const paletteControl = element("section", "widget-palette-preference");
            paletteControl.append(element("h2", "", "Sticky Note palette"));
            const paletteSelect = selectControl("widget-note-palette", notePalettes, memory.widgets.preferredNotePalette, "Sticky Note palette");
            paletteSelect.dataset.widgetNotePalette = "true";
            paletteSelect.dataset.widgetManagement = "true";
            paletteControl.append(labelControl("Preferred palette", paletteSelect));
            const activePalette = document.documentElement.dataset.seasonalTheme;
            const paletteHelp = seasonalNotePalettes.has(activePalette)
                ? `${notePalettes.find(([palette]) => palette === activePalette)[1]} is temporarily applied by the active Seasonal Overwrite. Your preferred palette will return when it ends.`
                : "Seasonal Overwrites temporarily use their matching palette. Your preferred palette returns when the overwrite ends.";
            paletteControl.append(element("p", "widget-palette-help", paletteHelp));
            paletteContainer.append(paletteControl);
        }
        if (!instances().length) {
            instanceList.append(element("p", "widget-empty-state", "Your desktop is quiet. Add a widget from Gallery to give it a little company."));
            refreshAvailability();
            return;
        }
        instances().forEach(widget => {
            const card = element("article", "widget-instance-card");
            card.dataset.widgetInstanceCard = "true";
            card.dataset.widgetId = widget.id;
            const heading = element("div", "widget-instance-heading");
            const icon = element("span", `widget-gallery-mark mark-${widget.type}`, widget.type === "clock" ? "◷" : widget.type === "calendar" ? "▦" : "✎");
            const title = element("div", "widget-instance-title");
            title.append(element("h3", "", widget.type === "note" ? `Sticky Note ${instances().filter(item => item.type === "note").indexOf(widget) + 1}` : widgetTypes[widget.type].label));
            title.append(element("span", "widget-instance-id", `ID · ${widget.id.slice(0, 14)}`));
            const remove = element("button", "widget-remove-button", "Remove");
            remove.type = "button";
            remove.dataset.widgetRemove = widget.id;
            remove.addEventListener("click", () => removeWidget(widget));
            heading.append(icon, title, remove);
            const controls = element("div", "widget-instance-controls");
            controls.append(labelControl("Size", selectControl("", sizes, widget.size, "Widget size")));
            controls.lastElementChild.querySelector("select").dataset.widgetSize = widget.id;
            controls.append(labelControl("Appearance", selectControl("", appearances, widget.appearance, "Widget appearance")));
            controls.lastElementChild.querySelector("select").dataset.widgetAppearance = widget.id;

            if (widget.type === "clock") {
                const clockSettings = element("div", "widget-detail-controls");
                const locale = textControl("", widget.settings.locale, "Clock locale", "en-US");
                locale.dataset.widgetLocale = widget.id;
                const timezone = textControl("", widget.settings.timeZone, "IANA time zone", "Europe/Berlin");
                timezone.dataset.widgetTimezone = widget.id;
                clockSettings.append(labelControl("Locale", locale), labelControl("Time zone", timezone));
                clockSettings.append(labelControl("Readout", selectControl("widget-hour-format", clockFormats, widget.settings.hourFormat, "Clock readout format")));
                clockSettings.lastElementChild.querySelector("select").dataset.widgetHourFormat = widget.id;
                const secondsLabel = element("label", "widget-checkbox-row");
                const seconds = element("input");
                seconds.type = "checkbox";
                seconds.checked = widget.settings.showSeconds;
                seconds.dataset.widgetSeconds = widget.id;
                secondsLabel.append(seconds, element("span", "", "Show seconds hand"));
                clockSettings.append(secondsLabel);
                controls.append(clockSettings);
            } else if (widget.type === "calendar") {
                const calendarSettings = element("div", "widget-detail-controls");
                const locale = textControl("", widget.settings.locale, "Calendar locale", "en-US");
                locale.dataset.widgetCalendarLocale = widget.id;
                calendarSettings.append(labelControl("Locale", locale));
                calendarSettings.append(labelControl("Week starts", selectControl("widget-week-start", weekStarts, widget.settings.weekStart, "Calendar week start")));
                calendarSettings.lastElementChild.querySelector("select").dataset.widgetWeekStart = widget.id;
                controls.append(calendarSettings);
            } else {
                const colorSelect = selectControl("widget-note-color", colors, widget.settings.color, "Sticky Note color");
                colorSelect.dataset.widgetNoteColor = widget.id;
                controls.append(labelControl("Paper color", colorSelect));
            }
            card.append(heading, controls);
            instanceList.append(card);
        });
        refreshAvailability();
    }

    function updateWidget(id, edit, rerender = true) {
        const widget = findWidget(id);
        if (!widget) return;
        edit(widget);
        if (rerender) {
            renderDesktop();
            renderManager();
        }
        save();
    }

    function resetPositions() {
        const positions = { clock: { x: 0.72, y: 0.08 }, calendar: { x: 0.72, y: 0.48 }, note: { x: 0.46, y: 0.12 } };
        const noteCount = { clock: 0, calendar: 0, note: 0 };
        instances().forEach(widget => {
            const offset = noteCount[widget.type]++;
            const base = positions[widget.type];
            widget.x = Math.min(0.88, base.x + offset * 0.04);
            widget.y = Math.min(0.82, base.y + offset * 0.045);
        });
        renderDesktop();
        renderManager();
        save();
        setStatus("Widget positions restored to the desktop defaults.");
    }

    manager.querySelectorAll("[data-widget-add]").forEach(button => {
        button.addEventListener("click", () => createWidget(button.dataset.widgetAdd));
    });
    manager.querySelector("[data-widget-reset-layout]")?.addEventListener("click", resetPositions);

    manager.addEventListener("change", event => {
        const control = event.target;
        if (!(control instanceof HTMLElement)) return;
        if (control.hasAttribute("data-widget-note-palette")) {
            memory.widgets.preferredNotePalette = control.value;
            syncNotePalette();
            renderManager();
            save();
            return;
        }
        const id = control.dataset.widgetSize || control.dataset.widgetAppearance || control.dataset.widgetHourFormat
            || control.dataset.widgetSeconds || control.dataset.widgetTimezone || control.dataset.widgetLocale
            || control.dataset.widgetCalendarLocale || control.dataset.widgetWeekStart || control.dataset.widgetNoteColor;
        if (!id) return;
        const widget = findWidget(id);
        if (!widget) return;
        if (control.hasAttribute("data-widget-size")) widget.size = control.value;
        else if (control.hasAttribute("data-widget-appearance")) widget.appearance = control.value;
        else if (control.hasAttribute("data-widget-hour-format")) widget.settings.hourFormat = control.value;
        else if (control.hasAttribute("data-widget-seconds")) widget.settings.showSeconds = control.checked;
        else if (control.hasAttribute("data-widget-timezone")) {
            if (!isSupportedTimeZone(control.value.trim())) {
                control.setCustomValidity("Enter a supported IANA time zone, such as Europe/Berlin.");
                control.reportValidity();
                control.value = widget.settings.timeZone;
                control.setCustomValidity("");
                return;
            }
            widget.settings.timeZone = control.value.trim();
        } else if (control.hasAttribute("data-widget-locale") || control.hasAttribute("data-widget-calendar-locale")) {
            if (!isSupportedLocale(control.value.trim())) {
                control.setCustomValidity("Enter a valid locale tag, such as en-US or de-DE.");
                control.reportValidity();
                control.value = widget.settings.locale;
                control.setCustomValidity("");
                return;
            }
            widget.settings.locale = Intl.getCanonicalLocales(control.value.trim())[0];
        } else if (control.hasAttribute("data-widget-week-start")) widget.settings.weekStart = control.value;
        else if (control.hasAttribute("data-widget-note-color")) widget.settings.color = control.value;
        renderDesktop();
        renderManager();
        save();
    });

    manager.addEventListener("keydown", event => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type === "text") {
            event.preventDefault();
            event.target.blur();
        }
    });

    document.addEventListener("pointerdown", event => {
        if (contextMenu && !contextMenu.menu.contains(event.target)) closeContextMenu();
    });
    document.addEventListener("keydown", event => {
        if (!contextMenu) return;
        if (event.key === "Escape") {
            const widget = findWidget(contextMenu.widgetId);
            closeContextMenu();
            layer.querySelector(`[data-widget-id="${widget?.id}"] .widget-drag-handle`)?.focus();
            return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const menuButtons = Array.from(contextMenu.menu.querySelectorAll("button:not(:disabled)"));
        const current = menuButtons.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? menuButtons.length - 1
            : (current + (event.key === "ArrowDown" ? 1 : -1) + menuButtons.length) % menuButtons.length;
        event.preventDefault();
        menuButtons[next]?.focus();
    });

    let resizeFrame = 0;
    const resize = () => {
        if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = 0;
            [...layer.querySelectorAll(".desktop-widget"), ...pinnedLayer.querySelectorAll(".desktop-widget")].forEach(node => {
                const widget = findWidget(node.dataset.widgetId);
                if (widget) positionNode(widget, node);
            });
        });
    };
    window.addEventListener("resize", resize);
    const taskbar = document.querySelector(".taskbar");
    if (taskbar) {
        new MutationObserver(resize).observe(taskbar, { attributes: true, attributeFilter: ["class"] });
        new ResizeObserver(resize).observe(taskbar);
    }
    document.addEventListener("fullscreenchange", resize);
    document.addEventListener("visibilitychange", syncActivity);
    const seasonalObserver = new MutationObserver(() => {
        syncNotePalette();
        renderManager();
    });
    seasonalObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-seasonal-theme"] });

    window.addEventListener("pagehide", () => {
        noteSaveTimers.forEach(timer => window.clearTimeout(timer));
        noteSaveTimers.clear();
        if (typeof saveMemory === "function") saveMemory();
        clearTimers(clockTimers);
        clearTimers(calendarTimers);
        document.body.style.userSelect = "";
    }, { once: true });

    function applyRestoredState() {
        memory.widgets = normalizeWidgetState(memory.widgets);
        renderDesktop();
        renderManager();
        refreshAvailability();
    }

    renderDesktop();
    renderManager();
    refreshAvailability();

    return { render: applyRestoredState, applyRestoredState, refreshAvailability };
}

