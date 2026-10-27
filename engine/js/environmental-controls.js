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
        presetToggles,
        ambientAnimationToggle,
        weatherToggles,
        decorationToggles,
        themeToggles,
        weatherIntensityRadios,
        weatherModeRadios,
        rotationClearToggle,
        rotationInterval,
        weatherSection,
        decorationSection,
        applyButton,
        applyStatus
    } = elements;
    const supportedRotationIntervals = new Set(["30m", "1h", "3h", "6h", "12h"]);
    let current = normalizeEnvironmentSettings(memory.settings.environment, memory.settings);
    const applyDock = applyButton?.closest(".environmental-apply-dock");
    const applyScroller = applyButton?.closest(".setup-content");

    const selectedPreset = () => presetToggles.find(toggle =>
        toggle.checked && Object.hasOwn(environmentPresets, toggle.dataset.environmentPreset)
    )?.dataset.environmentPreset || "none";
    const selectedThemes = () => themeToggles
        .filter(toggle => toggle.checked && Object.hasOwn(seasonalThemes, toggle.dataset.seasonalTheme))
        .map(toggle => toggle.dataset.seasonalTheme);
    const overrideIsActive = () => selectedPreset() !== "none" || selectedThemes().length > 0;
    const labelFor = toggle => toggle?.closest("label")?.querySelector("span")?.textContent?.trim()
        || toggle?.dataset.environmentPreset
        || toggle?.dataset.seasonalTheme
        || "";

    function updateApplyPreview() {
        if (!applyStatus) return;
        const selectedPresetToggle = presetToggles.find(toggle => toggle.checked);
        const selectedThemeToggle = themeToggles.find(toggle => toggle.checked);
        if (selectedPresetToggle) {
            applyStatus.textContent = `Environment preset ${labelFor(selectedPresetToggle)} selected — don’t forget to apply.`;
        } else if (selectedThemeToggle) {
            applyStatus.textContent = `Seasonal theme ${labelFor(selectedThemeToggle)} selected — don’t forget to apply.`;
        } else {
            applyStatus.textContent = "Settings changed — don’t forget to apply.";
        }
    }

    function syncApplyDockPosition() {
        if (!applyDock || !applyScroller) return;
        const activePanel = applyScroller.querySelector(".environment-tab-panel:not([hidden])");
        if (!activePanel) return;
        const isAtBottom = activePanel.scrollTop + activePanel.clientHeight >= activePanel.scrollHeight - 2;
        applyDock.classList.toggle("is-at-bottom", isAtBottom);
    }

    presetToggles.forEach(toggle => {
        toggle.checked = current.sections.presets && current.preset === toggle.dataset.environmentPreset;
    });
    themeToggles.forEach(toggle => {
        toggle.checked = current.sections.themes && current.themes.includes(toggle.dataset.seasonalTheme);
    });
    if (selectedPreset() !== "none") themeToggles.forEach(toggle => { toggle.checked = false; });
    if (presetToggles.some(toggle => toggle.checked)) {
        presetToggles.filter(toggle => toggle.checked).slice(1).forEach(toggle => { toggle.checked = false; });
    } else if (themeToggles.some(toggle => toggle.checked)) {
        themeToggles.filter(toggle => toggle.checked).slice(1).forEach(toggle => { toggle.checked = false; });
    }

    sectionToggles.forEach(toggle => {
        toggle.checked = current.sections[toggle.dataset.environmentSection] === true;
    });
    if (ambientAnimationToggle) ambientAnimationToggle.checked = current.effects.ambientAnimation;
    weatherToggles.forEach(toggle => {
        toggle.checked = current.weather.includes(toggle.dataset.weatherEffect);
    });
    decorationToggles.forEach(toggle => {
        toggle.checked = current.decorations.includes(toggle.dataset.decoration);
    });
    weatherIntensityRadios.forEach(radio => {
        radio.checked = radio.value === current.weatherIntensities[radio.dataset.weatherIntensity];
    });
    weatherModeRadios.forEach(radio => {
        radio.checked = radio.value === (current.rotation.enabled ? "rotate" : "together");
    });
    if (rotationClearToggle) rotationClearToggle.checked = current.rotation.includeClear;
    if (rotationInterval) rotationInterval.value = current.rotation.interval;

    function syncDisabledState() {
        const overrideActive = overrideIsActive();
        const sectionIsEnabled = name => sectionToggles.some(toggle =>
            toggle.dataset.environmentSection === name && toggle.checked
        );
        const weatherEnabled = !overrideActive && sectionIsEnabled("weather");
        const decorationsEnabled = !overrideActive && sectionIsEnabled("decorations");

        sectionToggles.forEach(toggle => {
            toggle.disabled = overrideActive;
        });
        weatherToggles.forEach(toggle => {
            toggle.disabled = !weatherEnabled || !Object.hasOwn(weatherEffects, toggle.dataset.weatherEffect);
        });
        decorationToggles.forEach(toggle => {
            const decoration = environmentDecorations[toggle.dataset.decoration];
            toggle.disabled = !decorationsEnabled || !Object.hasOwn(environmentDecorations, toggle.dataset.decoration)
                || !(decoration?.asset || decoration?.items?.some(item => item.asset));
        });
        themeToggles.forEach(toggle => {
            toggle.disabled = !Object.hasOwn(seasonalThemes, toggle.dataset.seasonalTheme);
        });
        presetToggles.forEach(toggle => {
            toggle.disabled = selectedThemes().length > 0
                || !Object.hasOwn(environmentPresets, toggle.dataset.environmentPreset);
        });
        const weatherSelection = weatherToggles
            .filter(toggle => toggle.checked && Object.hasOwn(weatherEffects, toggle.dataset.weatherEffect))
            .map(toggle => toggle.dataset.weatherEffect);
        weatherIntensityRadios.forEach(radio => {
            const effectSelected = weatherSelection.includes(radio.dataset.weatherIntensity);
            radio.disabled = !weatherEnabled || !effectSelected;
        });

        const canChoosePlayback = weatherEnabled && weatherSelection.length > 0;
        weatherModeRadios.forEach(radio => {
            radio.disabled = !canChoosePlayback;
        });
        const rotating = weatherModeRadios.some(radio => radio.checked && radio.value === "rotate");
        const canRotateWeather = canChoosePlayback && rotating;
        if (rotationClearToggle) rotationClearToggle.disabled = !canRotateWeather;
        if (rotationInterval) rotationInterval.disabled = !canRotateWeather;
        weatherSection?.classList.toggle("is-overridden", overrideActive);
        decorationSection?.classList.toggle("is-overridden", overrideActive);
        weatherSection?.setAttribute("aria-disabled", String(overrideActive));
        decorationSection?.setAttribute("aria-disabled", String(overrideActive));
    }

    function handleOverrideChange(changedToggle) {
        if (changedToggle.checked) {
            [...presetToggles, ...themeToggles].forEach(toggle => {
                if (toggle !== changedToggle) toggle.checked = false;
            });
        }
        syncDisabledState();
    }

    sectionToggles.forEach(toggle => toggle.addEventListener("change", syncDisabledState));
    weatherToggles.forEach(toggle => toggle.addEventListener("change", syncDisabledState));
    decorationToggles.forEach(toggle => toggle.addEventListener("change", syncDisabledState));
    presetToggles.forEach(toggle => toggle.addEventListener("change", () => handleOverrideChange(toggle)));
    themeToggles.forEach(toggle => toggle.addEventListener("change", () => handleOverrideChange(toggle)));
    ambientAnimationToggle?.addEventListener("change", syncDisabledState);
    weatherModeRadios.forEach(radio => radio.addEventListener("change", syncDisabledState));

    [
        ...sectionToggles,
        ...presetToggles,
        ...weatherToggles,
        ...decorationToggles,
        ...themeToggles,
        ...weatherIntensityRadios,
        ...weatherModeRadios,
        ambientAnimationToggle,
        rotationClearToggle,
        rotationInterval
    ].filter(Boolean).forEach(control => control.addEventListener("change", () => {
        updateApplyPreview();
    }));

    syncDisabledState();
    syncApplyDockPosition();
    applyScroller?.querySelectorAll(".environment-tab-panel").forEach(panel => {
        panel.addEventListener("scroll", syncApplyDockPosition, { passive: true });
    });
    applyScroller?.addEventListener("tabchange", syncApplyDockPosition);
    window.addEventListener("resize", syncApplyDockPosition);
    effectManager.applySettings(current);

    let applyRevision = 0;
    applyButton?.addEventListener("click", async () => {
        const revision = ++applyRevision;
        const preset = selectedPreset();
        const themes = selectedThemes();
        const weather = weatherToggles
            .filter(toggle => toggle.checked && Object.hasOwn(weatherEffects, toggle.dataset.weatherEffect))
            .map(toggle => toggle.dataset.weatherEffect);
        const decorations = decorationToggles
            .filter(toggle => toggle.checked && Object.hasOwn(environmentDecorations, toggle.dataset.decoration))
            .map(toggle => toggle.dataset.decoration);
        const sections = Object.fromEntries(sectionToggles.map(toggle => [
            toggle.dataset.environmentSection,
            toggle.checked
        ]));
        sections.presets = preset !== "none";
        sections.themes = themes.length > 0;
        const weatherIntensities = Object.fromEntries(
            Object.keys(weatherEffects).map(effect => [
                effect,
                weatherIntensityRadios.find(radio => radio.dataset.weatherIntensity === effect && radio.checked)?.value
                    || current.weatherIntensities[effect]
            ])
        );
        const rotationEnabled = weatherModeRadios.some(radio => radio.checked && radio.value === "rotate");

        current = normalizeEnvironmentSettings({
            preset,
            presets: preset === "none" ? [] : [preset],
            sections,
            effects: { ambientAnimation: ambientAnimationToggle?.checked !== false },
            weather,
            suppressedWeather: [],
            decorations,
            themes,
            weatherIntensities: Object.fromEntries(Object.entries(weatherIntensities).map(([effect, intensity]) => [
                effect,
                supportedEffectIntensities.includes(intensity) ? intensity : "balanced"
            ])),
            rotation: {
                enabled: rotationEnabled,
                includeClear: rotationClearToggle?.checked !== false,
                interval: supportedRotationIntervals.has(rotationInterval?.value)
                    ? rotationInterval.value
                    : "1h"
            }
        });
        memory.settings.environment = current;
        const applied = effectManager.applySettings(current);
        queueSave();
        syncDisabledState();
        if (applied && typeof applied.then === "function") {
            if (applyStatus) applyStatus.textContent = "Preparing environmental settings…";
            if (await applied === false) return;
        }
        if (revision === applyRevision && applyStatus) applyStatus.textContent = "Environmental settings applied.";
    });

    return {
        applyRestoredSettings(value) {
            current = normalizeEnvironmentSettings(value);
            memory.settings.environment = current;
            presetToggles.forEach(toggle => {
                toggle.checked = current.sections.presets && current.preset === toggle.dataset.environmentPreset;
            });
            themeToggles.forEach(toggle => {
                toggle.checked = current.sections.themes && current.themes.includes(toggle.dataset.seasonalTheme);
            });
            sectionToggles.forEach(toggle => {
                toggle.checked = current.sections[toggle.dataset.environmentSection] === true;
            });
            if (ambientAnimationToggle) ambientAnimationToggle.checked = current.effects.ambientAnimation;
            weatherToggles.forEach(toggle => { toggle.checked = current.weather.includes(toggle.dataset.weatherEffect); });
            decorationToggles.forEach(toggle => { toggle.checked = current.decorations.includes(toggle.dataset.decoration); });
            weatherIntensityRadios.forEach(radio => {
                radio.checked = radio.value === current.weatherIntensities[radio.dataset.weatherIntensity];
            });
            weatherModeRadios.forEach(radio => { radio.checked = radio.value === (current.rotation.enabled ? "rotate" : "together"); });
            if (rotationClearToggle) rotationClearToggle.checked = current.rotation.includeClear;
            if (rotationInterval) rotationInterval.value = current.rotation.interval;
            effectManager.applySettings(current);
            syncDisabledState();
            updateApplyPreview();
            queueSave();
        }
    };
}
