// Desktop objects reuse the taskbar's menu styling and native button behavior.
export function initDesktopContextMenu() {
    const menu = document.createElement("div");
    menu.className = "taskbar-context-menu desktop-context-menu";
    menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Desktop actions");
    menu.hidden = true; document.body.append(menu);
    let opener = null;
    function close(restoreFocus = false) {
        if (menu.hidden) return;
        menu.hidden = true;
        if (restoreFocus && opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
        opener = null;
    }
    function show({ x, y, target, actions, label = "Desktop actions" }) {
        close(); opener = target;
        menu.setAttribute("aria-label", label);
        menu.replaceChildren(...actions.map(action => {
            const button = document.createElement("button");
            button.type = "button"; button.className = "taskbar-context-menu-item";
            button.setAttribute("role", action.checked === undefined ? "menuitem" : "menuitemcheckbox"); button.textContent = action.label;
            if (action.checked !== undefined) button.setAttribute("aria-checked", String(action.checked));
            button.disabled = action.disabled === true;
            button.addEventListener("click", () => { close(true); void action.run?.(); });
            return button;
        }));
        window.dispatchEvent(new CustomEvent("guidelume:context-menu-open", { detail: { menu } }));
        menu.hidden = false;
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(x, innerWidth - rect.width - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(y, innerHeight - rect.height - 8))}px`;
        menu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
    }
    menu.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.key === "Tab") { close(true); return; }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...menu.querySelectorAll("button:not(:disabled)")];
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
            : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus();
    });
    document.addEventListener("pointerdown", event => { if (!menu.contains(event.target)) close(); }, true);
    document.addEventListener("focusin", event => { if (!menu.contains(event.target)) close(); });
    window.addEventListener("blur", () => close());
    window.addEventListener("resize", () => close());
    window.addEventListener("guidelume:context-menu-open", event => { if (event.detail?.menu !== menu) close(); });
    window.addEventListener("guidelume:context-menu-preference", () => close());
    return { show, close, element: menu };
}
