export function initTaskbarUtilities({ elements }) {
    const { taskbar, startButton, startMenu, taskbarClock, taskbarTime, taskbarDate, fullscreenButton } = elements;
    const fullscreenHint = document.querySelector(".fullscreen-hint");
    let fullscreenHintDismissed = false;
    function positionStartMenu() {
        const rect = taskbar.getBoundingClientRect();
        startMenu.style.left = `${Math.max(8, rect.left)}px`;
        startMenu.style.maxHeight = `${Math.max(180, window.innerHeight - 32)}px`;
        if (taskbar.classList.contains("taskbar-top")) {
            startMenu.style.top = `${rect.bottom + 8}px`;
            startMenu.style.bottom = "auto";
        } else {
            startMenu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
            startMenu.style.top = "auto";
        }
    }

    function openStartMenu() {
        positionStartMenu();
        startMenu.hidden = false;
        startMenu.classList.remove("is-closing");
        startButton.setAttribute("aria-expanded", "true");
        startButton.classList.add("is-active");
        void startMenu.offsetWidth;
        startMenu.classList.add("is-open");
    }

    function closeStartMenu() {
        if (startMenu.hidden) {
            return;
        }
        startMenu.classList.remove("is-open");
        startMenu.classList.add("is-closing");
        startButton.setAttribute("aria-expanded", "false");
        startButton.classList.remove("is-active");
    }

    startMenu.addEventListener("animationend", event => {
        if (event.target === startMenu && event.animationName === "startMenuClose") {
            startMenu.hidden = true;
            startMenu.classList.remove("is-closing");
        }
    });

    startButton.addEventListener("click", () => {
        if (startMenu.hidden || startMenu.classList.contains("is-closing")) {
            openStartMenu();
        } else {
            closeStartMenu();
        }
    });

    document.addEventListener("pointerdown", event => {
        if (!startMenu.hidden && !startMenu.contains(event.target) && !startButton.contains(event.target)) {
            closeStartMenu();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeStartMenu();
        }
    });

    const timeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    });
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium"
    });
    let clockTimeout = 0;
    const updateClock = () => {
        const now = new Date();
        taskbarClock.dateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        taskbarTime.textContent = timeFormatter.format(now);
        taskbarDate.textContent = dateFormatter.format(now);
    };
    const scheduleClock = () => {
        window.clearTimeout(clockTimeout);
        if (document.hidden) return;
        updateClock();
        clockTimeout = window.setTimeout(scheduleClock, 60_000 - (Date.now() % 60_000));
    };
    document.addEventListener("visibilitychange", scheduleClock);
    scheduleClock();

    const updateFullscreenButton = () => {
        const fullscreen = Boolean(document.fullscreenElement);
        fullscreenButton?.setAttribute("aria-label", fullscreen ? "Exit fullscreen" : "Enter fullscreen");
        fullscreenButton?.classList.toggle("is-active", fullscreen);
        if (fullscreenHint) {
            const taskbarVisible = !taskbar.classList.contains("taskbar-hidden")
                && Boolean(fullscreenButton?.getClientRects().length);
            fullscreenHint.hidden = fullscreenHintDismissed || !fullscreen || !taskbarVisible;
            if (fullscreen && taskbarVisible && fullscreenButton) {
                const buttonRect = fullscreenButton.getBoundingClientRect();
                const hintRect = fullscreenHint.getBoundingClientRect();
                const left = Math.max(8, Math.min(buttonRect.left + buttonRect.width / 2 - hintRect.width / 2, window.innerWidth - hintRect.width - 8));
                fullscreenHint.style.left = `${left}px`;
                fullscreenHint.style.right = "auto";
                const maxTop = Math.max(8, window.innerHeight - hintRect.height - 8);
                if (taskbar.classList.contains("taskbar-top")) {
                    const top = Math.max(8, buttonRect.bottom + 8);
                    fullscreenHint.style.top = `${Math.min(top, maxTop)}px`;
                } else {
                    const top = buttonRect.top - hintRect.height - 8;
                    fullscreenHint.style.top = `${Math.max(8, Math.min(top, maxTop))}px`;
                }
                fullscreenHint.style.bottom = "auto";
            }
        }
    };
    fullscreenHint?.addEventListener("click", () => {
        fullscreenHintDismissed = true;
        fullscreenHint.hidden = true;
    });
    fullscreenHint?.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        fullscreenHintDismissed = true;
        fullscreenHint.hidden = true;
    });
    fullscreenButton?.addEventListener("click", async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
        } catch {
            fullscreenButton.classList.add("fullscreen-failed");
        }
    });
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    const taskbarObserver = new MutationObserver(updateFullscreenButton);
    taskbarObserver.observe(taskbar, { attributes: true, attributeFilter: ["class"] });
    updateFullscreenButton();

    window.addEventListener("resize", () => {
        if (!startMenu.hidden) {
            positionStartMenu();
        }
        if (document.fullscreenElement) updateFullscreenButton();
    });

    return closeStartMenu;
}
