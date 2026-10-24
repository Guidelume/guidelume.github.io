export const themePalettes = Object.freeze([
    { id: "amber", name: "Amber", isDefault: true, recommendedBackgroundId: "midnight" },
    { id: "blue", name: "Azure", recommendedBackgroundId: "slate" },
    { id: "violet", name: "Violet", recommendedBackgroundId: "plum" },
    { id: "green", name: "Verdant", recommendedBackgroundId: "forest" },
    { id: "crimson", name: "Crimson", recommendedBackgroundId: "graphite" },
    { id: "teal", name: "Teal", recommendedBackgroundId: "lagoon" },
    { id: "rose", name: "Rose", recommendedBackgroundId: "dusk" },
    { id: "silver", name: "Silver", recommendedBackgroundId: "garnet" }
]);

export const backgroundPalettes = Object.freeze([
    { id: "midnight", name: "Midnight", isDefault: true },
    { id: "slate", name: "Slate" },
    { id: "plum", name: "Plum" },
    { id: "forest", name: "Forest" },
    { id: "garnet", name: "Garnet" },
    { id: "lagoon", name: "Lagoon" },
    { id: "dusk", name: "Dusk" },
    { id: "graphite", name: "Graphite" }
]);

export const themeIds = Object.freeze(themePalettes.map(palette => palette.id));
export const backgroundIds = Object.freeze(backgroundPalettes.map(palette => palette.id));

export function isSupportedTheme(id) {
    return themeIds.includes(id);
}

export function isSupportedBackground(id) {
    return backgroundIds.includes(id);
}

export function themeName(id) {
    return themePalettes.find(palette => palette.id === id)?.name || themePalettes[0].name;
}

export function backgroundName(id) {
    return backgroundPalettes.find(palette => palette.id === id)?.name || backgroundPalettes[0].name;
}

function makeChoice(documentRef, { id, name, isDefault }, attribute, previewClass, swatchVariable) {
    const button = documentRef.createElement("button");
    button.type = "button";
    button.className = "color-choice";
    button.dataset[attribute] = id;
    button.setAttribute("aria-pressed", "false");

    const preview = documentRef.createElement("span");
    preview.className = previewClass;
    preview.setAttribute("aria-hidden", "true");
    preview.style.backgroundColor = `var(${swatchVariable})`;

    const label = documentRef.createElement("span");
    label.textContent = `${name}${isDefault ? " (default)" : ""}`;
    if (attribute === "background") label.dataset.backgroundLabel = "";

    button.append(preview, label);
    return button;
}

export function renderAppearanceChoices(root = document) {
    root.querySelectorAll("[data-theme-choice-list]").forEach(container => {
        container.replaceChildren(...themePalettes.map(palette =>
            makeChoice(root, palette, "color", `color-preview color-${palette.id}`, `--palette-${palette.id}-strong`)
        ));
    });
    root.querySelectorAll("[data-background-choice-list]").forEach(container => {
        container.replaceChildren(...backgroundPalettes.map(palette =>
            makeChoice(root, palette, "background", "background-preview", `--background-${palette.id}-swatch`)
        ));
    });
}

export function updateAppearanceChoiceState(root = document, themeId, backgroundId) {
    const theme = themePalettes.find(palette => palette.id === themeId) || themePalettes[0];
    root.querySelectorAll("[data-color]").forEach(button => {
        const selected = button.dataset.color === theme.id;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
    root.querySelectorAll("[data-background]").forEach(button => {
        const palette = backgroundPalettes.find(item => item.id === button.dataset.background);
        if (!palette) return;
        const selected = palette.id === backgroundId;
        const label = button.querySelector("[data-background-label]");
        const suffixes = [];
        if (palette.isDefault) suffixes.push("default");
        if (palette.id === theme.recommendedBackgroundId) suffixes.push("Recommended");
        if (label) label.textContent = `${palette.name}${suffixes.length ? ` (${suffixes.join(") (")})` : ""}`;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
}
