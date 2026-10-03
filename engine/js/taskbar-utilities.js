export function initTaskbarUtilities({ elements }) {
    const { taskbar, startButton, startMenu, taskbarClock, taskbarTime, taskbarDate } = elements;
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
        minute: "2-digit"
    });
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium"
    });
    const updateClock = () => {
        const now = new Date();
        taskbarClock.dateTime = now.toISOString();
        taskbarTime.textContent = timeFormatter.format(now);
        taskbarDate.textContent = dateFormatter.format(now);
    };
    updateClock();
    window.setTimeout(() => {
        updateClock();
        window.setInterval(updateClock, 60_000);
    }, 60_000 - (Date.now() % 60_000));

    window.addEventListener("resize", () => {
        if (!startMenu.hidden) {
            positionStartMenu();
        }
    });


    return closeStartMenu;
}
