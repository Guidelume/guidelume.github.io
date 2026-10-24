import { configurationCategories } from "./configuration-backup.js";
import { discoveryFlagForIcon } from "./discovery-registry.js";

// Presentation only: groups always resolve to the existing backup category IDs.
// Discoverable apps declare their discovery icon and meaningful retained data here.
const categoryGroups = [
    { id: "appearanceEnvironment", label: "Appearance & Environment", categories: ["appearance", "environment"] },
    { id: "accessibility", label: "Accessibility", categories: ["accessibility"] },
    { id: "desktopWindows", label: "Desktop & Windows", categories: ["desktopLayout", "windowLayout", "taskbar"] },
    { id: "widgets", label: "Widgets", categories: ["widgets"] },
    { id: "profileDocuments", label: "Profile & Documents", categories: ["profile", "documents"] },
    {
        id: "lookingGlass", label: "Looking Glass", categories: ["lookingGlass"],
        restoreWarning: "Restoring Looking Glass replaces all personal bookmarks, the last selected video, and library visibility."
    }
];

export function configurationCategoryGroups(memory, availableCategories) {
    const available = availableCategories && new Set(availableCategories.map(category => category.id));
    const hiddenCategories = [];
    const groups = [];
    for (const group of categoryGroups) {
        const flag = discoveryFlagForIcon(group.discoveryIcon);
        const hidden = Boolean(flag) && memory.settings[flag] !== true;
        const categories = group.categories
            .filter(id => available ? available.has(id) : !hidden || group.hasRetainedData(memory))
            .map(id => ({
                ...configurationCategories.find(category => category.id === id),
                hidden,
                restoreWarning: group.restoreWarning
            }));
        if (!categories.length) continue;
        if (hidden) hiddenCategories.push(...categories);
        else groups.push({ id: group.id, label: group.label, categories });
    }
    if (hiddenCategories.length) groups.push({
        id: "hiddenApplications",
        label: "Other application data",
        description: "Saved data from hidden applications is included by default. Their discoveries stay unchanged.",
        categories: hiddenCategories.map((category, index) => ({
            ...category,
            label: `Hidden application data${hiddenCategories.length > 1 ? ` ${index + 1}` : ""}`,
            restoreWarning: "Restoring hidden application data replaces its saved contents and preferences. Discovery state is kept."
        }))
    });
    return groups;
}

export function concealUndiscoveredCategoryNames(message, memory) {
    for (const group of categoryGroups) {
        const flag = discoveryFlagForIcon(group.discoveryIcon);
        if (!flag || memory.settings[flag] === true) continue;
        for (const id of group.categories) {
            const category = configurationCategories.find(category => category.id === id);
            message = message.replaceAll(category.label, "Hidden application data");
        }
    }
    return message;
}
