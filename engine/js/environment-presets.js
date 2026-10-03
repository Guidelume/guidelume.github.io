export const environmentPresets = Object.freeze({
    "rainy-evening": Object.freeze({
        name: "Rainy Evening",
        composition: "scene",
        backdrop: "rainy-evening",
        layers: Object.freeze({
            ambient: Object.freeze(["cloud-bank", "ground-plane"]),
            lighting: Object.freeze([]),
            weather: Object.freeze(["rain"]),
            decorations: Object.freeze([])
        })
    })
});

export const weatherEffects = Object.freeze({
    rain: Object.freeze({ name: "Rain" })
});

export const environmentDecorations = Object.freeze({
    pumpkin: Object.freeze({ name: "Pumpkin" }),
    cobwebs: Object.freeze({ name: "Cobwebs" }),
    leaves: Object.freeze({ name: "Leaves" }),
    test: Object.freeze({
        name: "Test",
        asset: "./engine/dagaz.svg",
        anchor: "right-opposite-taskbar",
        width: 58
    })
});

export const seasonalThemes = Object.freeze({});

export const supportedEffectIntensities = Object.freeze(["low", "balanced", "high"]);
const supportedRotationIntervals = new Set(["30m", "1h", "3h", "6h", "12h"]);

const defaultEnvironment = {
    enabled: true,
    preset: "none",
    presets: [],
    sections: { weather: false, presets: false, decorations: false, themes: false },
    effects: { ambientAnimation: true },
    weather: [],
    suppressedWeather: [],
    decorations: [],
    themes: [],
    intensity: "balanced",
    rotation: { enabled: false, interval: "1h" }
};

export function normalizeEnvironmentSettings(value = {}, legacySettings = {}) {
    const saved = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const legacy = legacySettings && typeof legacySettings === "object" ? legacySettings : {};
    let preset = Object.hasOwn(environmentPresets, saved.preset) ? saved.preset : "none";
    const savedPresets = Array.isArray(saved.presets) ? saved.presets : [];

    // Migrate the first particle experiment, where rain was stored as a preset.
    if (preset === "none" && savedPresets.includes("rainy-evening")) preset = "rainy-evening";
    const presets = [...new Set([
        ...savedPresets.filter(id => Object.hasOwn(environmentPresets, id)),
        ...(preset === "none" ? [] : [preset])
    ])];
    const weatherSource = Array.isArray(saved.weather)
        ? saved.weather
        : (legacy.weather?.rain === true || savedPresets.includes("rain") ? ["rain"] : []);
    const weather = [...new Set(weatherSource.filter(id => Object.hasOwn(weatherEffects, id)))];
    const suppressedWeather = [...new Set(
        (Array.isArray(saved.suppressedWeather) ? saved.suppressedWeather : [])
            .filter(id => Object.hasOwn(weatherEffects, id))
    )];
    const decorations = [...new Set(
        (Array.isArray(saved.decorations) ? saved.decorations : [])
            .filter(id => Object.hasOwn(environmentDecorations, id))
    )];
    const themes = [...new Set(
        (Array.isArray(saved.themes) ? saved.themes : [])
            .filter(id => Object.hasOwn(seasonalThemes, id))
    )];
    const savedSections = saved.sections && typeof saved.sections === "object" ? saved.sections : {};
    const legacyEnabled = saved.enabled !== false;
    const sectionEnabled = (name, fallback) => legacyEnabled && (
        typeof savedSections[name] === "boolean" ? savedSections[name] : fallback
    );

    return {
        ...defaultEnvironment,
        ...saved,
        // The old top-level switch is folded into the independent section switches.
        enabled: true,
        preset,
        presets,
        sections: {
            weather: sectionEnabled("weather", weather.length > 0),
            presets: sectionEnabled("presets", presets.length > 0),
            decorations: sectionEnabled("decorations", decorations.length > 0),
            themes: sectionEnabled("themes", themes.length > 0)
        },
        effects: {
            ambientAnimation: saved.effects?.ambientAnimation !== false
        },
        weather,
        suppressedWeather,
        decorations,
        themes,
        intensity: supportedEffectIntensities.includes(saved.intensity)
            ? saved.intensity
            : supportedEffectIntensities.includes(legacy.effectsIntensity)
                ? legacy.effectsIntensity
                : "balanced",
        rotation: {
            ...defaultEnvironment.rotation,
            ...(saved.rotation && typeof saved.rotation === "object" ? saved.rotation : {}),
            enabled: saved.rotation?.enabled === true,
            interval: supportedRotationIntervals.has(saved.rotation?.interval)
                ? saved.rotation.interval
                : "1h"
        }
    };
}

export function composeEnvironment(settings, weatherRotationIndex = -1) {
    const environment = normalizeEnvironmentSettings(settings);
    const activePresets = environment.sections.presets
        ? environment.presets.map(id => environmentPresets[id]).filter(Boolean)
        : [];
    const ambient = new Set();
    const lighting = new Set();
    const decorations = environment.sections.decorations
        ? environment.decorations.map(id => environmentDecorations[id]).filter(item => item?.asset)
        : [];
    const seasonalThemeLayers = environment.sections.themes
        ? environment.themes.map(id => seasonalThemes[id]).filter(Boolean)
        : [];
    const weather = new Set(environment.sections.weather ? environment.weather : []);
    let backdrop = null;

    activePresets.forEach(preset => {
        if (preset.backdrop) backdrop = preset.backdrop;
        preset.layers.ambient?.forEach(layer => ambient.add(layer));
        preset.layers.lighting?.forEach(layer => lighting.add(layer));
        if (environment.sections.weather) {
            preset.layers.weather?.forEach(effect => weather.add(effect));
        }
        if (environment.sections.decorations && preset.layers.decorations) {
            decorations.push(...preset.layers.decorations);
        }
    });

    seasonalThemeLayers.forEach(theme => {
        if (theme.backdrop) backdrop = theme.backdrop;
        theme.layers?.ambient?.forEach(layer => ambient.add(layer));
        theme.layers?.lighting?.forEach(layer => lighting.add(layer));
        if (environment.sections.weather) theme.layers?.weather?.forEach(effect => weather.add(effect));
        if (environment.sections.decorations && theme.layers?.decorations) {
            decorations.push(...theme.layers.decorations);
        }
    });

    environment.suppressedWeather.forEach(effect => weather.delete(effect));
    let activeWeather = [...weather];
    if (weatherRotationIndex >= 0) {
        activeWeather = weatherRotationIndex === 0 || !activeWeather.length
            ? []
            : [activeWeather[(weatherRotationIndex - 1) % activeWeather.length]];
    }

    return {
        backdrop,
        ambient: [...ambient],
        lighting: [...lighting],
        weather: activeWeather,
        decorations,
        animateAmbient: environment.sections.presets && environment.effects.ambientAnimation,
        intensity: environment.intensity
    };
}
