export function initToastNotifications({ container = document.querySelector("#crt") || document.body } = {}) {
    const toast = document.createElement("div");
    toast.className = "guidelume-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    toast.hidden = true;
    container.append(toast);

    let dismissTimer = 0;
    let hideTimer = 0;
    let revision = 0;

    function show(message, state = "success", { title, actionLabel, onAction, duration = 3600 } = {}) {
        const token = ++revision;
        let active = true;
        window.clearTimeout(dismissTimer);
        window.clearTimeout(hideTimer);
        toast.replaceChildren();
        if (title) {
            const heading = document.createElement("strong");
            heading.className = "toast-title";
            heading.textContent = title;
            toast.append(heading);
        }
        const content = document.createElement("span");
        content.textContent = message;
        toast.append(content);
        function dismiss() {
            if (revision !== token) return;
            active = false;
            window.clearTimeout(dismissTimer);
            toast.classList.remove("is-visible");
            hideTimer = window.setTimeout(() => { toast.hidden = true; }, 180);
        }
        if (actionLabel) {
            const action = document.createElement("button");
            action.type = "button";
            action.textContent = actionLabel;
            action.addEventListener("click", () => { dismiss(); onAction?.(); });
            toast.append(action);
        }
        toast.dataset.state = state;
        toast.setAttribute("role", state === "error" ? "alert" : "status");
        toast.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
        toast.hidden = false;
        requestAnimationFrame(() => { if (active && revision === token && !toast.hidden) toast.classList.add("is-visible"); });

        if (duration > 0) dismissTimer = window.setTimeout(dismiss, duration);
        return dismiss;
    }

    return {
        show,
        destroy() {
            revision += 1;
            window.clearTimeout(dismissTimer);
            window.clearTimeout(hideTimer);
            toast.remove();
        }
    };
}
