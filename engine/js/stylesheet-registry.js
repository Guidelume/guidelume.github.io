const cssUrl = file => new URL(`../css/${file}`, import.meta.url).href;

// Array order is the original index.html cascade order, including lazy sheets.
// Dependencies describe what must be ready, independently of cascade order.
export const stylesheets = [
    { id: "global", href: cssUrl("global-v2.css"), dependencies: ["fonts", "accessible-fonts"] },
    { id: "taskbar", href: cssUrl("taskbar.css"), dependencies: ["global"] },
    { id: "windows", href: cssUrl("windows.css"), dependencies: ["global"] },
    { id: "notepad", href: cssUrl("notepad.css"), dependencies: ["windows"] },
    { id: "backup-restore", href: cssUrl("backup-restore.css"), dependencies: ["windows"] },
    { id: "developer-vault", href: cssUrl("developer-vault.css"), dependencies: ["windows"] },
    { id: "terminal", href: cssUrl("terminal.css"), dependencies: ["windows", "blackwall"] },
    { id: "blackwall", href: cssUrl("blackwall.css"), dependencies: ["global"] },
    { id: "setup-options", href: cssUrl("setup-options.css"), dependencies: ["windows"] },
    { id: "environment", href: cssUrl("environment.css"), dependencies: ["global"] },
    { id: "widgets", href: cssUrl("widgets.css"), dependencies: ["windows", "setup-options"] },
    { id: "mods", href: cssUrl("mods.css"), dependencies: ["windows", "setup-options"] },
    { id: "looking-glass", href: cssUrl("looking-glass.css"), dependencies: ["windows"] },
    { id: "tabs", href: cssUrl("tabs.css"), dependencies: ["windows"] },
    { id: "fonts", href: cssUrl("fonts.css"), dependencies: [] },
    { id: "accessible-fonts", href: cssUrl("accessible-fonts.css"), dependencies: ["fonts"] }
];

export const stylesheetGroups = {
    // Blackwall can open from desktop actions without Terminal. Controls, tabs,
    // widgets and environment rules are shared by startup UI and saved settings.
    desktop: ["global", "taskbar", "windows", "blackwall", "setup-options", "environment", "widgets", "tabs", "fonts", "accessible-fonts"],
    documents: ["notepad"],
    "backup-restore": ["backup-restore"],
    "developer-vault": ["developer-vault"],
    terminal: ["terminal"],
    mods: ["mods"],
    "looking-glass": ["looking-glass"]
};

// Application IDs belong here; launchers and markup need no stylesheet paths.
export const windowStyleGroups = {
    readme: "documents",
    changelog: "documents",
    "progress-report-01": "documents",
    "backup-restore": "backup-restore",
    "developer-vault": "developer-vault",
    terminal: "terminal",
    "mod-one-for-the-road": "mods",
    "looking-glass": "looking-glass"
};
