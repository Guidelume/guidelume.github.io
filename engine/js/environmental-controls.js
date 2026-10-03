import {
    environmentDecorations,
    environmentPresets,
    normalizeEnvironmentSettings,
    seasonalThemes,
    supportedEffectIntensities,
    weatherEffects
} from "./environment-presets.js";

export function initEnvironmentalControls({ memory, queueSave, effectManager, elements }) {
    const {
        sectionToggles,
        presetSelect,
        ambientAnimationToggle,
        weatherToggles,
        decorationToggles,
        themeToggles,
        intensityRadios,
        rotationToggle,
        rotationInterval,
        applyButton
    } = elements;
    const supportedRotationIntervals = new Set(["30m", "1h", "3h", "6h", "12h"]);
    let current = normalizeEnvironmentSettings(memory.settings.environment, memory.settings);

    if (presetSelect) {
        const baseOption = presetSelect.querySelector('option[value=""]') || new Option("Desktop Default", "");
        presetSelect.replaceChildren(baseOption);
        Object.entries(environmentPresets).forEach(([id, preset]) => {
            presetSelect.add(new Option(preset.name, id));
        });
    }

    function syncWeatherSelection() {
        weatherToggles.forEach(toggle => {
            toggle.checked = current.weather.includes(toggle.dataset.weatherEffect);
        });
    }

    function syncDisabledState() {
        const sectionIsEnabled = name => sectionToggles.some(toggle =>
            toggle.dataset.environmentSection === name && toggle.checked
        );
        const weatherEnabled = sectionIsEnabled("weather");
        const presetsEnabled = sectionIsEnabled("presets");
        const decorationsEnabled = sectionIsEnabled("decorations");
        const themesEnabled = sectionIsEnabled("themes");

        if (presetSelect) presetSelect.disabled = !presetsEnabled;
        if (ambientAnimationToggle) ambientAnimationToggle.disabled = !presetsEnabled;
        weatherToggles.forEach(toggle => {
            toggle.disabled = !weatherEnabled || !Object.hasOwn(weatherEffects, toggle.dataset.weatherEffect);
        });
        decorationToggles.forEach(toggle => {
            toggle.disabled = !decorationsEnabled || !Object.hasOwn(environmentDecorations, toggle.dataset.decoration)
                || !environmentDecorations[toggle.dataset.decoration].asset;
        });
        themeToggles.forEach(toggle => {
            toggle.disabled = !themesEnabled || !Object.hasOwn(seasonalThemes, toggle.dataset.seasonalTheme);
        });
        intensityRadios.forEach(radio => {
            radio.disabled = !weatherEnabled;
        });

        const availableWeather = new Set(weatherToggles
            .filter(toggle => toggle.checked && Object.hasOwn(weatherEffects, toggle.dataset.weatherEffect))
            .map(toggle => toggle.dataset.weatherEffect));
        const canRotateWeather = weatherEnabled && availableWeather.size > 0;
        if (rotationToggle) rotationToggle.disabled = !canRotateWeather;
        if (rotationInterval) rotationInterval.disabled = !canRotateWeather || !rotationToggle?.checked;
    }

    sectionToggles.forEach(toggle => {
        toggle.checked = current.sections[toggle.dataset.environmentSection] === true;
    });
    if (presetSelect) presetSelect.value = current.preset === "none" ? "" : current.preset;
    if (ambientAnimationToggle) ambientAnimationToggle.checked = current.effects.ambientAnimation;
    syncWeatherSelection();
    decorationToggles.forEach(toggle => {
        toggle.checked = current.decorations.includes(toggle.dataset.decoration);
    });
    themeToggles.forEach(toggle => {
        toggle.checked = current.themes.includes(toggle.dataset.seasonalTheme);
    });
    intensityRadios.forEach(radio => {
        radio.checked = radio.value === current.intensity;
    });
    if (rotationToggle) rotationToggle.checked = current.rotation.enabled;
    if (rotationInterval) rotationInterval.value = current.rotation.interval;

    sectionToggles.forEach(toggle => toggle.addEventListener("change", syncDisabledState));
    weatherToggles.forEach(toggle => toggle.addEventListener("change", syncDisabledState));
    decorationToggles.forEach(toggle => toggle.addEventListener("change", syncDisabledState));
    themeToggles.forEach(toggle => toggle.addEventListener("change", syncDisabledState));
    presetSelect?.addEventListener("change", syncDisabledState);
    ambientAnimationToggle?.addEventListener("change", syncDisabledState);
    rotationToggle?.addEventListener("change", syncDisabledState);
    syncDisabledState();
    effectManager.applySettings(current);

    applyButton?.addEventListener("click", () => {
        const sections = Object.fromEntries(sectionToggles.map(toggle => [
            toggle.dataset.environmentSection,
            toggle.checked
        ]));
        const preset = presetSelect?.value && Object.hasOwn(environmentPresets, presetSelect.value)
            ? presetSelect.value
            : "none";
        const weather = weatherToggles
            .filter(toggle => toggle.checked && Object.hasOwn(weatherEffects, toggle.dataset.weatherEffect))
            .map(toggle => toggle.dataset.weatherEffect);
        const presetWeather = environmentPresets[preset]?.layers.weather || [];
        const suppressedWeather = presetWeather.filter(effect => !weather.includes(effect));
        const decorations = decorationToggles
            .filter(toggle => toggle.checked && Object.hasOwn(environmentDecorations, toggle.dataset.decoration))
            .map(toggle => toggle.dataset.decoration);
        const themes = themeToggles
            .filter(toggle => toggle.checked && Object.hasOwn(seasonalThemes, toggle.dataset.seasonalTheme))
            .map(toggle => toggle.dataset.seasonalTheme);
        const intensity = intensityRadios.find(radio => radio.checked)?.value;
        const canRotateWeather = sections.weather && weather.length > 0;

        current = normalizeEnvironmentSettings({
            preset,
            presets: preset === "none" ? [] : [preset],
            sections,
            effects: { ambientAnimation: ambientAnimationToggle?.checked !== false },
            weather,
            suppressedWeather,
            decorations,
            themes,
            intensity: supportedEffectIntensities.includes(intensity) ? intensity : "balanced",
            rotation: {
                enabled: canRotateWeather && rotationToggle?.checked === true,
                interval: supportedRotationIntervals.has(rotationInterval?.value)
                    ? rotationInterval.value
                    : "1h"
            }
        });
        memory.settings.environment = current;
        effectManager.applySettings(current);
        queueSave();
        syncDisabledState();
    });
}
