import { composeEnvironment, normalizeEnvironmentSettings } from "./environment-presets.js";

const particleCounts = {
    low: { desktop: 22, compact: 16 },
    balanced: { desktop: 36, compact: 24 },
    high: { desktop: 54, compact: 32 }
};

const safeLayerName = name => /^[a-z0-9-]+$/i.test(name) ? name : "default";

export function createEnvironmentEffectManager({ container }) {
    let settings = normalizeEnvironmentSettings();
    let activeWeather = [];
    let activeAnimations = new Set();
    let weatherRotationTimer = 0;
    let weatherRotationIndex = -1;
    let renderVersion = 0;
    let resizeFrame = 0;
    const compactScreen = window.matchMedia("(max-width: 700px), (pointer: coarse)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const rootObserver = new MutationObserver(render);
    const taskbarObserver = new MutationObserver(render);
    const taskbar = document.querySelector(".taskbar");
    rootObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-reduced-motion"]
    });
    if (taskbar) taskbarObserver.observe(taskbar, { attributes: true, attributeFilter: ["class"] });

    function motionIsReduced() {
        return reducedMotion.matches || document.documentElement.dataset.reducedMotion === "true";
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

    function renderLighting(lightingLayers) {
        lightingLayers.forEach(name => {
            const layer = document.createElement("div");
            layer.className = `environment-lighting environment-lighting--${safeLayerName(name)}`;
            layer.setAttribute("aria-hidden", "true");
            container.append(layer);
        });
    }

    function renderAmbient(ambientLayers, shouldAnimate) {
        container?.classList.toggle("is-ambient-animated", shouldAnimate && !motionIsReduced());
        ambientLayers.forEach(name => {
            const layer = document.createElement("div");
            layer.className = `environment-atmosphere environment-atmosphere--${safeLayerName(name)}`;
            layer.setAttribute("aria-hidden", "true");
            container.append(layer);
        });
    }

    function renderDecorations(decorations) {
        decorations.forEach(decoration => {
            if (!decoration || typeof decoration.asset !== "string") return;
            const image = document.createElement("img");
            image.className = "environment-decoration";
            image.src = decoration.asset;
            image.alt = "";
            image.setAttribute("aria-hidden", "true");
            image.draggable = false;
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
            container.append(image);
        });
    }

    function animateParticle(element, keyframes, options, version, onFinish) {
        animate(element, keyframes, options, version, onFinish);
    }

    function startSplash(particle, impactX, impactY, width, height, version) {
        if (Math.random() > 0.32) {
            startRainStreak(particle, width, height, version);
            return;
        }

        particle.className = "environment-particle environment-particle-splash";
        particle.style.left = `${impactX}px`;
        particle.style.top = `${impactY}px`;
        particle.style.width = `${11 + Math.random() * 7}px`;
        particle.style.height = `${5 + Math.random() * 3}px`;

        animateParticle(
            particle,
            [
                { transform: "translate3d(-50%, 0, 0) scale(0.35)", opacity: 0.88 },
                { transform: "translate3d(-50%, -4px, 0) scale(1.08)", opacity: 0 }
            ],
            { duration: 210 + Math.random() * 140, easing: "ease-out", fill: "forwards" },
            version,
            () => startRainStreak(particle, width, height, version)
        );
    }

    function startRainStreak(particle, width, height, version) {
        if (version !== renderVersion || !activeWeather.includes("rain") || motionIsReduced()) return;

        particle.className = "environment-particle environment-particle-rain";
        const streakHeight = 28 + Math.random() * 18;
        const startX = Math.random() * width;
        // Start inside the cloud bank, with enough vertical spread that drops
        // don't appear to be emitted from a single line at the top edge.
        const startY = height * (-0.04 + Math.random() * 0.11);
        const impactY = height * (0.79 + Math.random() * 0.13);
        const maxDrift = Math.max(35, Math.min(125, width * 0.11));
        const drift = (Math.random() * 2 - 1) * maxDrift;
        const impactX = Math.max(0, Math.min(width, startX + drift));
        const travelY = Math.max(1, impactY - startY);
        const duration = 1500 + Math.random() * 1300;
        const opacity = 0.28 + Math.random() * 0.3;

        particle.style.left = `${startX}px`;
        particle.style.top = `${startY}px`;
        particle.style.width = `${1.8 + Math.random() * 1}px`;
        particle.style.height = `${streakHeight}px`;

        animateParticle(
            particle,
            [
                { transform: "translate3d(0, 0, 0)", opacity: 0 },
                { offset: 0.08, opacity },
                { offset: 0.84, opacity },
                { transform: `translate3d(${impactX - startX}px, ${travelY}px, 0)`, opacity: 0 }
            ],
            { duration, easing: "linear", fill: "forwards", delay: -Math.random() * duration },
            version,
            () => startSplash(particle, impactX, impactY, width, height, version)
        );
    }

    function renderWeather(weatherLayers, width, height, version) {
        if (document.hidden || motionIsReduced() || !weatherLayers.includes("rain")) return;
        const profile = particleCounts[settings.intensity] || particleCounts.balanced;
        const count = Math.min(compactScreen.matches ? profile.compact : profile.desktop, 80);
        const fragment = document.createDocumentFragment();

        for (let index = 0; index < count; index += 1) {
            const particle = document.createElement("span");
            particle.className = "environment-particle environment-particle-rain";
            fragment.append(particle);
            startRainStreak(particle, width, height, version);
        }

        container.append(fragment);
    }

    function render() {
        renderVersion += 1;
        clearLayers();
        if (!container) return;

        const { backdrop, weather, ambient, lighting, decorations, animateAmbient, intensity } = composeEnvironment(
            settings,
            weatherRotationIndex
        );
        activeWeather = weather;
        container.dataset.intensity = intensity;
        renderBackdrop(backdrop);
        renderAmbient(ambient, animateAmbient);
        renderLighting(lighting);
        renderDecorations(decorations);

        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!width || !height) return;
        renderWeather(weather, width, height, renderVersion);
    }

    function applySettings(nextSettings) {
        settings = normalizeEnvironmentSettings(nextSettings);
        window.clearInterval(weatherRotationTimer);
        weatherRotationTimer = 0;
        weatherRotationIndex = -1;

        const weatherForRotation = composeEnvironment({
            ...settings,
            rotation: { ...settings.rotation, enabled: false }
        }).weather;
        if (settings.sections.weather && settings.rotation.enabled && weatherForRotation.length) {
            weatherRotationIndex = 1;
            const intervalMatch = settings.rotation.interval.match(/^(\d+)(m|h)$/);
            const interval = intervalMatch
                ? Number(intervalMatch[1]) * (intervalMatch[2] === "h" ? 60 : 1) * 60_000
                : 60 * 60_000;
            weatherRotationTimer = window.setInterval(() => {
                weatherRotationIndex = (weatherRotationIndex + 1) % (weatherForRotation.length + 1);
                render();
            }, interval);
        }
        render();
    }

    function queueResizeRender() {
        if (resizeFrame) return;
        resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = 0;
            render();
        });
    }

    window.addEventListener("resize", queueResizeRender, { passive: true });
    document.addEventListener("visibilitychange", render);
    compactScreen.addEventListener?.("change", render);
    reducedMotion.addEventListener?.("change", render);

    return {
        applySettings,
        destroy() {
            window.removeEventListener("resize", queueResizeRender);
            document.removeEventListener("visibilitychange", render);
            compactScreen.removeEventListener?.("change", render);
            reducedMotion.removeEventListener?.("change", render);
            rootObserver.disconnect();
            taskbarObserver.disconnect();
            window.clearInterval(weatherRotationTimer);
            if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
            renderVersion += 1;
            clearLayers();
        }
    };
}
