import { composeEnvironment, normalizeEnvironmentSettings } from "./environment-presets.js";

const particleCounts = {
    low: { desktop: 22, compact: 16 },
    balanced: { desktop: 36, compact: 24 },
    high: { desktop: 54, compact: 32 }
};

const safeLayerName = name => /^[a-z0-9-]+$/i.test(name) ? name : "default";

export function createEnvironmentEffectManager({ container, fontManager }) {
    let settings = normalizeEnvironmentSettings();
    let activeWeather = [];
    let rainEmergesFromClouds = false;
    let snowEmergesFromClouds = false;
    let activeAnimations = new Set();
    let weatherRotationTimer = 0;
    let weatherRotationDuration = 0;
    let rotationWeather = [];
    let weatherRotationIndex = -1;
    let renderVersion = 0;
    let resizeFrame = 0;
    let desktopWasOccluded = false;
    let seasonalAppearanceInitialized = false;
    let appliedSeasonalTheme = null;
    let appliedSeasonalAppearance = null;
    let newYearsCountdownTimer = 0;
    const newYearsCountdown = document.querySelector("#newYearsCountdown");
    const compactScreen = window.matchMedia("(max-width: 700px), (pointer: coarse)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rootObserver = new MutationObserver(() => {
        render();
        scheduleWeatherRotation();
    });
    const taskbarObserver = new MutationObserver(() => {
        const taskbarAtTop = taskbar?.classList.contains("taskbar-top") || false;
        if (taskbarAtTop === taskbarWasAtTop) return;
        taskbarWasAtTop = taskbarAtTop;
        render();
    });
    const windowObserver = new MutationObserver(() => {
        const desktopIsOccluded = windows.some(windowElement =>
            !windowElement.hidden && windowElement.classList.contains("is-maximized")
        );
        if (desktopIsOccluded === desktopWasOccluded) return;
        desktopWasOccluded = desktopIsOccluded;
        render();
    });
    const taskbar = document.querySelector(".taskbar");
    const windows = Array.from(document.querySelectorAll(".setup-window"));
    let taskbarWasAtTop = taskbar?.classList.contains("taskbar-top") || false;
    rootObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-reduced-motion"]
    });
    if (taskbar) taskbarObserver.observe(taskbar, { attributes: true, attributeFilter: ["class"] });
    windows.forEach(windowElement => windowObserver.observe(windowElement, {
        attributes: true,
        attributeFilter: ["class", "hidden"]
    }));

    function motionIsReduced() {
        return reducedMotion.matches || document.documentElement.dataset.reducedMotion === "true";
    }

    function hasEnvironmentOverride() {
        const presetActive = settings.sections.presets && settings.preset !== "none";
        return presetActive || (settings.sections.themes && settings.themes.length > 0);
    }

    function clearLayers() {
        activeAnimations.forEach(animation => {
            animation.onfinish = null;
            animation.cancel();
        });
        activeAnimations.clear();
        container?.replaceChildren();
    }

    function animate(element, keyframes, options, version, onFinish) {
        if (typeof element.animate !== "function") return;
        const animation = element.animate(keyframes, options);
        activeAnimations.add(animation);
        animation.onfinish = () => {
            activeAnimations.delete(animation);
            animation.onfinish = null;
            animation.cancel();
            if (version === renderVersion) onFinish?.();
        };
    }

    function renderBackdrop(backdrop) {
        if (!backdrop || !container) return;
        const layer = document.createElement("div");
        layer.className = `environment-backdrop environment-backdrop--${safeLayerName(backdrop)}`;
        layer.setAttribute("aria-hidden", "true");
        container.append(layer);
    }

    function applySeasonalAppearance(themeId, appearance) {
        const root = document.documentElement;
        const activeThemeId = themeId || null;
        if (root.dataset.seasonalTheme !== activeThemeId) {
            if (activeThemeId) root.dataset.seasonalTheme = activeThemeId;
            else delete root.dataset.seasonalTheme;
        }

        if (seasonalAppearanceInitialized
            && appliedSeasonalTheme === activeThemeId
            && appliedSeasonalAppearance === appearance) return;

        const iconMap = appearance?.icons || {};
        document.querySelectorAll("img[data-seasonal-icon]").forEach(image => {
            const baseSource = image.dataset.seasonalBaseSrc ?? image.getAttribute("src") ?? "";
            image.dataset.seasonalBaseSrc = baseSource;
            const source = iconMap[image.dataset.seasonalIcon] || baseSource;
            if (image.getAttribute("src") !== source) image.setAttribute("src", source);
        });
        seasonalAppearanceInitialized = true;
        appliedSeasonalTheme = activeThemeId;
        appliedSeasonalAppearance = appearance;
    }

    function renderLighting(lightingLayers) {
        lightingLayers.forEach(name => {
            const layer = document.createElement("div");
            layer.className = `environment-lighting environment-lighting--${safeLayerName(name)}`;
            layer.setAttribute("aria-hidden", "true");
            if (name === "rain-lanterns") {
                ["left", "center", "right"].forEach(position => {
                    const glow = document.createElement("span");
                    glow.className = `environment-lantern-glow environment-lantern-glow--${position}`;
                    layer.append(glow);
                });
            }
            if (name === "christmas-star-glow") {
                [
                    { x: 13, y: 18, ray: 14 },
                    { x: 29, y: 28, ray: 9 },
                    { x: 49, y: 12, ray: 12 },
                    { x: 70, y: 22, ray: 17 },
                    { x: 88, y: 15, ray: 10 }
                ].forEach(star => {
                    const sparkle = document.createElement("span");
                    sparkle.className = "christmas-star";
                    sparkle.style.left = `${star.x}%`;
                    sparkle.style.top = `${star.y}%`;
                    sparkle.style.setProperty("--star-ray", `${star.ray}px`);
                    sparkle.style.animationDelay = `${Math.random() * 5}s`;
                    layer.append(sparkle);
                });
            }
            if (name === "new-years-fireworks") {
                [
                    { x: 19, y: 27, size: 92, color: "#ffc780", duration: 25 },
                    { x: 77, y: 20, size: 104, color: "#c9a7ff", duration: 29 },
                    { x: 48, y: 37, size: 82, color: "#70ded3", duration: 34 },
                    { x: 63, y: 28, size: 112, color: "#ff91ae", duration: 38 }
                ].forEach((burst, index) => {
                    const firework = document.createElement("span");
                    firework.className = "new-years-firework";
                    firework.style.left = `${burst.x}%`;
                    firework.style.top = `${burst.y}%`;
                    firework.style.setProperty("--firework-size", `${burst.size}px`);
                    firework.style.setProperty("--firework-color", burst.color);
                    firework.style.animationDuration = `${burst.duration}s`;
                    // Start each loop at a different point so the sky is not empty
                    // for a full cycle after enabling the theme.
                    firework.style.animationDelay = `${-(burst.duration * (0.61 - index * 0.17 + Math.random() * 0.045))}s`;
                    for (let sparkIndex = 0; sparkIndex < 12; sparkIndex += 1) {
                        const spark = document.createElement("span");
                        spark.className = "new-years-firework__spark";
                        spark.style.setProperty("--spark-angle", `${sparkIndex * 30 + (Math.random() * 8 - 4)}deg`);
                        spark.style.setProperty("--spark-length", `${0.34 + Math.random() * 0.16}`);
                        spark.style.setProperty("--spark-width", `${1.3 + Math.random() * 1}px`);
                        firework.append(spark);
                    }
                    const core = document.createElement("span");
                    core.className = "new-years-firework__core";
                    firework.append(core);
                    layer.append(firework);
                });

                const confettiColors = ["#ffae75", "#ffd166", "#8ce0d2", "#d5b8ff", "#ff8fb5"];
                for (let index = 0; index < 7; index += 1) {
                    const confetti = document.createElement("span");
                    const duration = 14 + Math.random() * 10;
                    confetti.className = "new-years-confetti";
                    confetti.style.left = `${7 + Math.random() * 86}%`;
                    confetti.style.top = `${-12 + Math.random() * 30}%`;
                    confetti.style.setProperty("--confetti-color", confettiColors[index % confettiColors.length]);
                    confetti.style.setProperty("--confetti-width", `${3 + Math.random() * 2}px`);
                    confetti.style.setProperty("--confetti-height", `${8 + Math.random() * 6}px`);
                    confetti.style.setProperty("--confetti-drift", `${-90 + Math.random() * 180}px`);
                    confetti.style.animationDuration = `${duration}s`;
                    confetti.style.animationDelay = `${-Math.random() * duration}s`;
                    layer.append(confetti);
                }
            }
            container.append(layer);
        });
    }

    function syncNewYearsCountdown(isActive) {
        if (!newYearsCountdown) return;
        if (!isActive) {
            window.clearInterval(newYearsCountdownTimer);
            newYearsCountdownTimer = 0;
            newYearsCountdown.hidden = true;
            return;
        }

        newYearsCountdown.hidden = false;
        const updateCountdown = () => {
            const now = new Date();
            const targetYear = now.getFullYear() + 1;
            // Compare local calendar fields as if they were UTC so the display
            // counts civil days and clock time without adding a DST offset change.
            const targetWallTime = Date.UTC(targetYear, 0, 1);
            const currentWallTime = Date.UTC(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                now.getHours(),
                now.getMinutes(),
                now.getSeconds(),
                now.getMilliseconds()
            );
            const remaining = Math.max(0, targetWallTime - currentWallTime);
            const days = Math.floor(remaining / 86_400_000);
            const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
            const minutes = Math.floor((remaining % 3_600_000) / 60_000);
            const seconds = Math.floor((remaining % 60_000) / 1_000);
            newYearsCountdown.querySelector("[data-countdown-days]").textContent = String(days).padStart(2, "0");
            newYearsCountdown.querySelector("[data-countdown-hours]").textContent = String(hours).padStart(2, "0");
            newYearsCountdown.querySelector("[data-countdown-minutes]").textContent = String(minutes).padStart(2, "0");
            newYearsCountdown.querySelector("[data-countdown-seconds]").textContent = String(seconds).padStart(2, "0");
            newYearsCountdown.querySelector("[data-countdown-caption]").textContent = `until January 1, ${targetYear}`;
            newYearsCountdown.setAttribute("aria-label", `${days} days, ${hours} hours, ${minutes} minutes, and ${seconds} seconds until January 1, ${targetYear}`);
        };

        updateCountdown();
        window.clearInterval(newYearsCountdownTimer);
        newYearsCountdownTimer = document.hidden ? 0 : window.setInterval(updateCountdown, 1000);
    }

    function renderAmbient(ambientLayers, shouldAnimate) {
        container?.classList.toggle("is-ambient-animated", shouldAnimate && !motionIsReduced());
        container?.classList.toggle("is-motion-reduced", motionIsReduced());
        ambientLayers.forEach(name => {
            const layer = document.createElement("div");
            layer.className = `environment-atmosphere environment-atmosphere--${safeLayerName(name)}`;
            layer.setAttribute("aria-hidden", "true");
            if (name === "christmas-snowbank") {
                const driftTexture = document.createElement("span");
                driftTexture.className = "christmas-snowbank-texture";
                layer.append(driftTexture);
            }
            container.append(layer);
        });
    }

    function renderDecorations(decorations) {
        decorations
            .flatMap(decoration => decoration?.items || [decoration])
            .forEach(decoration => {
            if (!decoration || typeof decoration.asset !== "string") return;
            const image = document.createElement("img");
            image.className = "environment-decoration";
            image.src = decoration.asset;
            image.alt = "";
            image.setAttribute("aria-hidden", "true");
            image.draggable = false;
            if (typeof decoration.className === "string") {
                decoration.className.split(/\s+/).filter(name => /^[a-z0-9_-]+$/i.test(name))
                    .forEach(name => image.classList.add(name));
            }
            if (decoration.effect === "bat-flight") {
                const batCount = Math.random() < 0.28 ? 2 : 1;
                const cycle = 58 + Math.random() * 38;
                const flightHeight = () => `${Math.round(-24 + Math.random() * 48)}px`;
                const left = `${Math.max(0, Math.min(1, Number(decoration.x) || 0)) * 100}%`;
                const top = `${Math.max(0, Math.min(1, Number(decoration.y) || 0)) * 100}%`;
                image.style.setProperty("--bat-rise", flightHeight());
                image.style.setProperty("--bat-dip", flightHeight());
                image.style.left = left;
                image.style.top = top;
                if (Number.isFinite(decoration.width)) image.style.width = `${Math.max(1, decoration.width)}px`;
                image.style.animationDuration = `${cycle}s`;
                image.style.animationDelay = `-${Math.random() * cycle}s`;
                image.style.animationDirection = Math.random() < 0.5 ? "reverse" : "normal";
                container.append(image);

                if (batCount > 1) {
                    const secondBat = image.cloneNode();
                    secondBat.style.left = left;
                    secondBat.style.top = `${18 + Math.random() * 24}%`;
                    secondBat.style.width = `${Math.max(1, decoration.width * (0.58 + Math.random() * 0.2))}px`;
                    const secondCycle = 64 + Math.random() * 42;
                    secondBat.style.setProperty("--bat-rise", flightHeight());
                    secondBat.style.setProperty("--bat-dip", flightHeight());
                    secondBat.style.animationDuration = `${secondCycle}s`;
                    secondBat.style.animationDelay = `-${Math.random() * secondCycle}s`;
                    secondBat.style.animationDirection = Math.random() < 0.5 ? "reverse" : "normal";
                    container.append(secondBat);
                }
                return;
            }
            if (decoration.anchor === "right-opposite-taskbar") {
                const taskbarAtTop = document.querySelector(".taskbar")?.classList.contains("taskbar-top");
                image.classList.add("environment-decoration--opposite-taskbar");
                image.style.top = taskbarAtTop ? "auto" : "24px";
                image.style.bottom = taskbarAtTop ? "24px" : "auto";
            } else {
                image.style.left = `${Math.max(0, Math.min(1, Number(decoration.x) || 0)) * 100}%`;
                image.style.top = `${Math.max(0, Math.min(1, Number(decoration.y) || 0)) * 100}%`;
            }
            if (Number.isFinite(decoration.width)) {
                image.style.width = `${Math.max(1, decoration.width)}px`;
            }
            if (image.classList.contains("halloween-ground-decoration")) {
                const wrapper = document.createElement("span");
                wrapper.className = "halloween-ground-decoration-wrap";
                if (image.classList.contains("halloween-ground-decoration--pumpkin")) {
                    wrapper.classList.add("halloween-ground-decoration-wrap--pumpkin");
                }
                if (image.classList.contains("halloween-ground-decoration--lantern")) {
                    wrapper.classList.add("halloween-ground-decoration-wrap--lantern");
                }
                wrapper.setAttribute("aria-hidden", "true");
                wrapper.style.left = image.style.left;
                wrapper.style.top = image.style.top;
                if (Number.isFinite(decoration.width)) {
                    wrapper.style.width = `${Math.max(1, decoration.width)}px`;
                    image.style.width = "100%";
                }
                image.style.position = "relative";
                image.style.display = "block";
                image.style.maxWidth = "none";
                image.style.transform = "none";
                wrapper.append(image);
                container.append(wrapper);
            } else {
                container.append(image);
            }
            });
    }

    function animateParticle(element, keyframes, options, version, onFinish) {
        animate(element, keyframes, options, version, onFinish);
    }

    function startSplash(particle, impactX, impactY, width, height, version) {
        if (Math.random() > 0.46) {
            startRainStreak(particle, width, height, version);
            return;
        }

        const catchesLanternLight = Math.random() < 0.24;
        particle.className = "environment-particle environment-particle-splash";
        if (catchesLanternLight) particle.classList.add("environment-particle-splash--warm");
        particle.style.left = `${impactX}px`;
        particle.style.top = `${impactY}px`;
        particle.style.width = `${15 + Math.random() * 10}px`;
        particle.style.height = `${6 + Math.random() * 3}px`;

        animateParticle(
            particle,
            [
                { transform: "translate3d(-50%, 0, 0) scale(0.35)", opacity: 0.88 },
                { transform: "translate3d(-50%, -4px, 0) scale(1.08)", opacity: 0 }
            ],
            { duration: 540 + Math.random() * 100, easing: "ease-out", fill: "forwards" },
            version,
            () => startRainStreak(particle, width, height, version)
        );
    }

    function startRainStreak(particle, width, height, version) {
        if (version !== renderVersion || !activeWeather.includes("rain") || motionIsReduced()) return;

        particle.className = "environment-particle environment-particle-rain";
        const streakHeight = 22 + Math.random() * 44;
        const startX = Math.random() * width;
        // Rain enters above the viewport unless this scene has a cloud bank to emerge from.
        const startY = rainEmergesFromClouds
            ? height * (0.01 + Math.random() * 0.12)
            : height * (-0.18 + Math.random() * 0.08);
        // Keep impacts on the visible wet ground just above the bottom taskbar.
        const impactY = height * (0.82 + Math.random() * 0.08);
        const maxDrift = Math.max(42, Math.min(170, width * 0.15));
        const now = performance.now();
        const gustCycle = 22_000;
        const gustPhase = (now % gustCycle) / gustCycle;
        const gustEnvelope = gustPhase > 0.72
            ? Math.sin(((gustPhase - 0.72) / 0.28) * Math.PI)
            : 0;
        const gustDirection = Math.floor(now / gustCycle) % 2 === 0 ? 1 : -1;
        const breeze = (Math.random() * 2 - 1) * maxDrift * 0.18;
        const drift = breeze + gustDirection * gustEnvelope * maxDrift * 0.82;
        const impactX = Math.max(0, Math.min(width, startX + drift));
        const travelY = Math.max(1, impactY - startY);
        const streakAngle = -Math.atan2(drift, travelY) * (180 / Math.PI);
        const duration = 1200 + Math.random() * 1800;
        const opacity = 0.24 + Math.random() * 0.45;

        particle.style.left = `${startX}px`;
        particle.style.top = `${startY}px`;
        particle.style.width = `${1.4 + Math.random() * 1.5}px`;
        particle.style.height = `${streakHeight}px`;

        animateParticle(
            particle,
            [
                { transform: `translate3d(0, 0, 0) rotate(${streakAngle}deg)`, opacity: 0 },
                { offset: 0.08, opacity },
                { offset: 0.84, opacity },
                {
                    transform: `translate3d(${impactX - startX}px, ${travelY}px, 0) rotate(${streakAngle}deg)`,
                    opacity: 0
                }
            ],
            { duration, easing: "linear", fill: "forwards", delay: -Math.random() * duration },
            version,
            () => startSplash(particle, impactX, impactY, width, height, version)
        );
    }

    function startSnowflake(particle, width, height, version) {
        if (version !== renderVersion || !activeWeather.includes("snow") || motionIsReduced()) return;

        particle.className = "environment-particle environment-particle-snow";
        const startX = Math.random() * width;
        const startY = snowEmergesFromClouds
            ? height * Math.random() * 0.08
            : height * (-0.16 + Math.random() * 0.08);
        const impactY = height * (0.855 + Math.random() * 0.045);
        const sway = (Math.random() * 2 - 1) * Math.min(58, width * 0.055);
        const endX = Math.max(0, Math.min(width, startX + sway));
        const travelX = endX - startX;
        const travelY = Math.max(1, impactY - startY);
        const size = 1.8 + Math.random() * 5.5;
        const opacity = 0.28 + Math.random() * 0.5;
        const rotation = (Math.random() * 2 - 1) * 360;
        const duration = 7500 + Math.random() * 10_500;
        const blur = Math.random() * 0.8;
        const driftBias = (Math.random() * 2 - 1) * Math.min(13, width * 0.012);
        const at = (fraction, horizontalBias = 0) =>
            `translate3d(${travelX * fraction + horizontalBias}px, ${travelY * fraction}px, 0) rotate(${rotation * fraction}deg)`;

        particle.style.left = `${startX}px`;
        particle.style.top = `${startY}px`;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.filter = `blur(${blur}px)`;
        particle.style.opacity = "0";

        animateParticle(
            particle,
            [
                { transform: at(0), opacity: 0 },
                { offset: 0.16, transform: at(0.16, driftBias * 0.2), opacity: opacity * 0.58 },
                { offset: 0.31, transform: at(0.31, sway * 0.28 + driftBias), opacity },
                { offset: 0.53, transform: at(0.53, -sway * 0.2 - driftBias * 0.4), opacity: opacity * 0.95 },
                { offset: 0.74, transform: at(0.74, sway * 0.19 + driftBias * 0.55), opacity: opacity * 0.82 },
                { offset: 0.91, transform: at(0.91, -driftBias * 0.25), opacity: opacity * 0.32 },
                { transform: at(1), opacity: 0 }
            ],
            { duration, easing: "linear", fill: "both", delay: Math.random() * 1800 },
            version,
            () => startSnowLanding(particle, endX, impactY, width, height, version)
        );
    }

    function startSnowLanding(particle, impactX, impactY, width, height, version) {
        if (version !== renderVersion || !activeWeather.includes("snow") || motionIsReduced()) return;

        particle.className = "environment-particle environment-particle-snow-landing";
        particle.style.left = `${impactX}px`;
        particle.style.top = `${impactY}px`;
        particle.style.width = `${8 + Math.random() * 6}px`;
        particle.style.height = `${2 + Math.random() * 2}px`;
        particle.style.filter = `blur(${0.25 + Math.random() * 0.4}px)`;
        particle.style.opacity = "0";

        animateParticle(
            particle,
            [
                { transform: "translate3d(-50%, -50%, 0) scale(0.35)", opacity: 0 },
                { offset: 0.28, transform: "translate3d(-50%, -50%, 0) scale(0.8)", opacity: 0.36 },
                { transform: "translate3d(-50%, -50%, 0) scale(1.45)", opacity: 0 }
            ],
            { duration: 260 + Math.random() * 180, easing: "ease-out", fill: "both" },
            version,
            () => startSnowflake(particle, width, height, version)
        );
    }

    function renderWeather(weatherLayers, width, height, weatherIntensities, version) {
        const activeEffects = weatherLayers.filter(effect => effect === "rain" || effect === "snow");
        if (document.hidden || container.classList.contains("is-desktop-occluded") || motionIsReduced() || !activeEffects.length) return;
        const compact = compactScreen.matches;
        const desiredCounts = activeEffects.map(effect => {
            const profile = particleCounts[weatherIntensities[effect]] || particleCounts.balanced;
            return (compact ? profile.compact : profile.desktop) + (effect === "snow" ? 8 : 0);
        });
        const desiredTotal = desiredCounts.reduce((sum, count) => sum + count, 0);
        const totalBudget = Math.min(desiredTotal, 80);
        const scale = totalBudget / desiredTotal;
        const effectCounts = desiredCounts.map(count => Math.floor(count * scale));
        let remaining = totalBudget - effectCounts.reduce((sum, count) => sum + count, 0);
        for (let index = 0; remaining > 0; index = (index + 1) % effectCounts.length) {
            if (effectCounts[index] >= desiredCounts[index]) continue;
            effectCounts[index] += 1;
            remaining -= 1;
        }
        const fragment = document.createDocumentFragment();

        activeEffects.forEach((effect, effectIndex) => {
            for (let index = 0; index < effectCounts[effectIndex]; index += 1) {
                const particle = document.createElement("span");
                fragment.append(particle);
                if (effect === "rain") {
                    particle.className = "environment-particle environment-particle-rain";
                    startRainStreak(particle, width, height, version);
                } else {
                    particle.className = "environment-particle environment-particle-snow";
                    startSnowflake(particle, width, height, version);
                }
            }
        });

        container.append(fragment);
    }

    function render() {
        renderVersion += 1;
        clearLayers();
        if (!container) return;
        container.classList.toggle("is-page-hidden", document.hidden);
        const desktopOccluded = windows.some(windowElement =>
            !windowElement.hidden && windowElement.classList.contains("is-maximized")
        );
        desktopWasOccluded = desktopOccluded;
        container.classList.toggle("is-desktop-occluded", desktopOccluded);
        container.closest("#crt")?.classList.toggle("has-environment-override", hasEnvironmentOverride());

        const {
            backdrop,
            weather,
            ambient,
            lighting,
            decorations,
            seasonalTheme,
            appearance,
            animateAmbient,
            intensity,
            weatherIntensities
        } = composeEnvironment(
            settings,
            weatherRotationIndex
        );
        applySeasonalAppearance(seasonalTheme, appearance);
        syncNewYearsCountdown(seasonalTheme === "new-years");
        activeWeather = weather;
        rainEmergesFromClouds = ambient.includes("cloud-bank");
        snowEmergesFromClouds = ambient.includes("christmas-cloud-bank");
        container.dataset.intensity = intensity;
        renderBackdrop(backdrop);
        renderAmbient(ambient, animateAmbient);
        renderLighting(lighting);
        renderDecorations(decorations);

        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!width || !height) return;
        renderWeather(weather, width, height, weatherIntensities, renderVersion);
    }

    function applySettings(nextSettings) {
        const next = normalizeEnvironmentSettings(nextSettings);
        if (fontManager && document.documentElement.dataset.restorationState === "ready") {
            const { seasonalTheme } = composeEnvironment(next);
            return fontManager.transition("environment", { seasonalTheme }, () => commitSettings(next));
        }
        commitSettings(next);
    }

    function commitSettings(nextSettings) {
        settings = nextSettings;
        window.clearTimeout(weatherRotationTimer);
        weatherRotationTimer = 0;
        weatherRotationIndex = -1;

        const overrideActive = hasEnvironmentOverride();
        rotationWeather = !overrideActive && settings.sections.weather && settings.rotation.enabled
            ? composeEnvironment({
                ...settings,
                rotation: { ...settings.rotation, enabled: false }
            }).weather
            : [];
        if (rotationWeather.length) {
            weatherRotationIndex = 1;
            const intervalMatch = settings.rotation.interval.match(/^(\d+)(m|h)$/);
            weatherRotationDuration = intervalMatch
                ? Number(intervalMatch[1]) * (intervalMatch[2] === "h" ? 60 : 1) * 60_000
                : 60 * 60_000;
        } else {
            rotationWeather = [];
        }
        render();
        scheduleWeatherRotation();
    }

    function scheduleWeatherRotation() {
        window.clearTimeout(weatherRotationTimer);
        weatherRotationTimer = 0;
        if (document.hidden || motionIsReduced() || !rotationWeather.length) return;
        weatherRotationTimer = window.setTimeout(() => {
            weatherRotationTimer = 0;
            weatherRotationIndex = settings.rotation.includeClear
                ? (weatherRotationIndex + 1) % (rotationWeather.length + 1)
                : (weatherRotationIndex % rotationWeather.length) + 1;
            render();
            scheduleWeatherRotation();
        }, weatherRotationDuration);
    }

    function handleVisibilityChange() {
        container?.classList.toggle("is-page-hidden", document.hidden);
        syncNewYearsCountdown(settings.sections.themes && settings.themes.includes("new-years"));
        if (document.hidden) {
            window.clearTimeout(weatherRotationTimer);
            window.clearInterval(newYearsCountdownTimer);
            if (newYearsCountdown) newYearsCountdown.hidden = true;
            weatherRotationTimer = 0;
            render();
            return;
        }
        render();
        scheduleWeatherRotation();
    }

    function handleMotionPreferenceChange() {
        render();
        scheduleWeatherRotation();
    }

    function queueResizeRender() {
        if (resizeFrame) return;
        resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = 0;
            render();
        });
    }

    window.addEventListener("resize", queueResizeRender, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    compactScreen.addEventListener?.("change", render);
    reducedMotion.addEventListener?.("change", handleMotionPreferenceChange);

    return {
        applySettings,
        destroy() {
            fontManager?.cancelTransitions?.("environment");
            window.removeEventListener("resize", queueResizeRender);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            compactScreen.removeEventListener?.("change", render);
            reducedMotion.removeEventListener?.("change", handleMotionPreferenceChange);
            rootObserver.disconnect();
            taskbarObserver.disconnect();
            windowObserver.disconnect();
            window.clearTimeout(weatherRotationTimer);
            if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
            renderVersion += 1;
            clearLayers();
            container?.closest("#crt")?.classList.remove("has-environment-override");
        }
    };
}
