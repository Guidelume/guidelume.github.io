export function initToastNotifications() {
    const toast = document.createElement("div");
    toast.className = "guidelume-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    toast.hidden = true;
    (document.querySelector("#crt") || document.body).append(toast);

    let dismissTimer = 0;
    let hideTimer = 0;

    function show(message, state = "success") {
        window.clearTimeout(dismissTimer);
        window.clearTimeout(hideTimer);
        toast.textContent = message;
        toast.dataset.state = state;
        toast.setAttribute("role", state === "error" ? "alert" : "status");
        toast.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
        toast.hidden = false;
        requestAnimationFrame(() => toast.classList.add("is-visible"));

        dismissTimer = window.setTimeout(() => {
            toast.classList.remove("is-visible");
            hideTimer = window.setTimeout(() => { toast.hidden = true; }, 180);
        }, 3600);
    }

    return { show };
}
