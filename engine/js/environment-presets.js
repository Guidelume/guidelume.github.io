export const environmentPresets = Object.freeze({
    "rainy-evening": Object.freeze({
        name: "Rainy Evening",
        composition: "scene",
        backdrop: "rainy-evening",
        intensity: "balanced",
        layers: Object.freeze({
            ambient: Object.freeze(["cloud-bank", "ground-plane"]),
            lighting: Object.freeze(["distant-lightning", "rain-lanterns"]),
            weather: Object.freeze(["rain"]),
            decorations: Object.freeze([])
        })
    })
});

export const weatherEffects = Object.freeze({
    rain: Object.freeze({ name: "Rain" }),
    snow: Object.freeze({ name: "Snow" })
});

export const environmentDecorations = Object.freeze({
    pumpkin: Object.freeze({
        name: "Pumpkin",
        asset: "./engine/img/environment/halloween/pumpkin.png",
        x: 0.12,
        y: 0.84,
        width: 94,
        className: "halloween-ground-decoration halloween-ground-decoration--pumpkin"
    }),
    cobwebs: Object.freeze({
        name: "Cobwebs",
        items: Object.freeze([
            Object.freeze({
                asset: "./engine/img/environment/halloween/cobweb-corner-1-empty.png",
                x: 0.02,
                y: 0.035,
                width: 190,
                className: "halloween-cobweb"
            }),
            Object.freeze({
                asset: "./engine/img/environment/halloween/cobweb-corner-1-empty.png",
                x: 0.98,
                y: 0.035,
                width: 190,
                className: "halloween-cobweb halloween-cobweb--flipped"
            })
        ])
    }),
    leaves: Object.freeze({ name: "Leaves" }),
    test: Object.freeze({
        name: "Test",
        asset: "./engine/dagaz.svg",
        anchor: "right-opposite-taskbar",
        width: 58
    })
});

export const seasonalThemes = Object.freeze({
    "new-years": Object.freeze({
        name: "New Year’s",
        backdrop: "new-years-midnight",
        intensity: "low",
        layers: Object.freeze({
            ambient: Object.freeze(["new-years-horizon-haze", "new-years-skyline"]),
            lighting: Object.freeze(["new-years-fireworks"]),
            weather: Object.freeze([]),
            decorations: Object.freeze([])
        })
    }),
    christmas: Object.freeze({
        name: "Christmas",
        backdrop: "christmas-eve",
        intensity: "balanced",
        appearance: Object.freeze({
            icons: Object.freeze({
                folder: "./engine/img/environment/holidays/doc_folder_christmas.svg",
                environment: "./engine/img/environment/holidays/doc_env_christmas.svg",
                terminal: "./engine/img/environment/holidays/doc_term_christmas.svg",
                text: "./engine/img/environment/holidays/doc_text_christmas.svg"
            })
        }),
        layers: Object.freeze({
            ambient: Object.freeze([
                "christmas-cloud-bank",
                "christmas-distance-haze",
                "christmas-village-lights",
                "christmas-snowbank"
            ]),
            lighting: Object.freeze(["christmas-star-glow"]),
            weather: Object.freeze(["snow"]),
            decorations: Object.freeze([])
        })
    }),
    halloween: Object.freeze({
        name: "Halloween",
        backdrop: "halloween-night",
        intensity: "low",
        appearance: Object.freeze({
            icons: Object.freeze({
                folder: "./engine/img/environment/halloween/doc_folder_spooky.svg",
                environment: "./engine/img/environment/halloween/doc_env_spooky.svg",
                terminal: "./engine/img/environment/halloween/doc_term_spooky.svg",
                text: "./engine/img/environment/halloween/doc_text_spooky.svg"
            })
        }),
        layers: Object.freeze({
            ambient: Object.freeze(["ground-plane", "halloween-horizon", "halloween-mist"]),
            lighting: Object.freeze(["halloween-moonlight"]),
            weather: Object.freeze(["rain"]),
            decorations: Object.freeze([
                Object.freeze({
                    asset: "./engine/img/environment/halloween/cobweb-corner-1-empty.png",
                    x: 0.02,
                    y: 0.035,
                    width: 190,
                    className: "halloween-cobweb"
                }),
                Object.freeze({
                    asset: "./engine/img/environment/halloween/cobweb-corner-1-empty.png",
                    x: 0.98,
                    y: 0.035,
                    width: 190,
                    className: "halloween-cobweb halloween-cobweb--flipped"
                }),
                Object.freeze({
                    asset: "./engine/img/environment/halloween/pumpkin.png",
                    x: 0.12,
                    y: 0.84,
                    width: 94,
                    className: "halloween-ground-decoration halloween-ground-decoration--pumpkin"
                }),
                Object.freeze({
                    asset: "./engine/img/environment/halloween/lantern.png",
                    x: 0.88,
                    y: 0.83,
                    width: 86,
                    className: "halloween-ground-decoration halloween-ground-decoration--lantern"
                }),
                Object.freeze({
                    asset: "./engine/img/environment/halloween/bat.png",
                    x: 0,
                    y: 0.27,
                    width: 68,
                    className: "halloween-bat",
                    effect: "bat-flight"
                })
            ])
        })
    })
});

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
    weatherIntensities: { rain: "balanced", snow: "balanced" },
    rotation: { enabled: false, interval: "1h", includeClear: true }
};

export function normalizeEnvironmentSettings(value = {}, legacySettings = {}) {
    const saved = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const legacy = legacySettings && typeof legacySettings === "object" ? legacySettings : {};
    let preset = Object.hasOwn(environmentPresets, saved.preset) ? saved.preset : "none";
    const savedPresets = Array.isArray(saved.presets) ? saved.presets : [];

    // Migrate the first particle experiment, where rain was stored as a preset.
    if (preset === "none" && savedPresets.includes("rainy-evening")) preset = "rainy-evening";
    const presets = preset === "none" ? [] : [preset];
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
    )].slice(0, 1);
    const savedSections = saved.sections && typeof saved.sections === "object" ? saved.sections : {};
    const legacyEnabled = saved.enabled !== false;
    const sectionEnabled = (name, fallback) => legacyEnabled && (
        typeof savedSections[name] === "boolean" ? savedSections[name] : fallback
    );

    const fallbackIntensity = supportedEffectIntensities.includes(saved.intensity)
        ? saved.intensity
        : supportedEffectIntensities.includes(legacy.effectsIntensity)
            ? legacy.effectsIntensity
            : "balanced";
    const savedWeatherIntensities = saved.weatherIntensities && typeof saved.weatherIntensities === "object"
        ? saved.weatherIntensities
        : {};

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
        intensity: fallbackIntensity,
        weatherIntensities: {
            rain: supportedEffectIntensities.includes(savedWeatherIntensities.rain)
                ? savedWeatherIntensities.rain
                : fallbackIntensity,
            snow: supportedEffectIntensities.includes(savedWeatherIntensities.snow)
                ? savedWeatherIntensities.snow
                : fallbackIntensity
        },
        rotation: {
            ...defaultEnvironment.rotation,
            ...(saved.rotation && typeof saved.rotation === "object" ? saved.rotation : {}),
            enabled: saved.rotation?.enabled === true,
            includeClear: saved.rotation?.includeClear !== false,
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
    const activeThemes = activePresets.length === 0 && environment.sections.themes
        ? environment.themes.map(id => seasonalThemes[id]).filter(Boolean)
        : [];
    const overrideActive = activePresets.length > 0 || activeThemes.length > 0;
    // Keep manual choices saved, but let an active preset or theme own the rendered layers.
    const ambient = new Set();
    const lighting = new Set();
    const decorations = !overrideActive && environment.sections.decorations
        ? environment.decorations
            .map(id => environmentDecorations[id])
            .flatMap(item => item?.items || (item?.asset ? [item] : []))
        : [];
    const weather = new Set(!overrideActive && environment.sections.weather ? environment.weather : []);
    let backdrop = null;

    activePresets.forEach(preset => {
        if (preset.backdrop) backdrop = preset.backdrop;
        preset.layers.ambient?.forEach(layer => ambient.add(layer));
        preset.layers.lighting?.forEach(layer => lighting.add(layer));
        preset.layers.weather?.forEach(effect => weather.add(effect));
        if (preset.layers.decorations) {
            decorations.push(...preset.layers.decorations);
        }
    });

    activeThemes.forEach(theme => {
        if (theme.backdrop) backdrop = theme.backdrop;
        theme.layers?.ambient?.forEach(layer => ambient.add(layer));
        theme.layers?.lighting?.forEach(layer => lighting.add(layer));
        theme.layers?.weather?.forEach(effect => weather.add(effect));
        if (theme.layers?.decorations) {
            decorations.push(...theme.layers.decorations);
        }
    });

    if (!overrideActive) environment.suppressedWeather.forEach(effect => weather.delete(effect));
    let activeWeather = [...weather];
    if (weatherRotationIndex >= 0) {
        activeWeather = weatherRotationIndex === 0 || !activeWeather.length
            ? []
            : [activeWeather[(weatherRotationIndex - 1) % activeWeather.length]];
    }

    const configuredOverrideIntensity = activeThemes[0]?.intensity || activePresets[0]?.intensity;
    const overrideIntensity = supportedEffectIntensities.includes(configuredOverrideIntensity)
        ? configuredOverrideIntensity
        : "balanced";
    const weatherIntensities = overrideActive
        ? { rain: overrideIntensity, snow: overrideIntensity }
        : environment.weatherIntensities;
    return {
        backdrop,
        ambient: [...ambient],
        lighting: [...lighting],
        weather: activeWeather,
        decorations,
        seasonalTheme: activeThemes.length ? environment.themes[0] : null,
        appearance: activeThemes[0]?.appearance || null,
        animateAmbient: environment.effects.ambientAnimation,
        weatherIntensities,
        intensity: overrideActive ? overrideIntensity : environment.weatherIntensities.rain
    };
}
