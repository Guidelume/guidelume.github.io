export function initConfirmationDialog() {
    const dialog = document.createElement("dialog");
    dialog.className = "guidelume-confirm-dialog";
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-labelledby", "guidelume-confirm-title");
    dialog.setAttribute("aria-describedby", "guidelume-confirm-intro guidelume-confirm-message");

    const content = document.createElement("div");
    content.className = "guidelume-confirm-dialog__content";
    const title = document.createElement("h2");
    title.id = "guidelume-confirm-title";
    const intro = document.createElement("p");
    intro.id = "guidelume-confirm-intro";
    intro.className = "guidelume-confirm-dialog__intro";
    const message = document.createElement("p");
    message.id = "guidelume-confirm-message";
    const actions = document.createElement("div");
    actions.className = "guidelume-confirm-dialog__actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "guidelume-confirm-dialog__button";
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "guidelume-confirm-dialog__button guidelume-confirm-dialog__button--danger";
    actions.append(cancelButton, confirmButton);
    content.append(title, intro, message, actions);
    dialog.append(content);
    (document.querySelector("#crt") || document.body).append(dialog);

    let finishCurrent = null;
    cancelButton.addEventListener("click", () => finishCurrent?.(false));
    confirmButton.addEventListener("click", () => finishCurrent?.(true));
    dialog.addEventListener("cancel", event => {
        event.preventDefault();
        finishCurrent?.(false);
    });

    return function confirmAction({ title: heading, intro: introduction = "", message: explanation, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = true, restoreFocusOnConfirm = true, signal }) {
        if (signal?.aborted) return Promise.resolve(false);
        finishCurrent?.(false);
        const returnFocus = document.activeElement;
        title.textContent = heading;
        intro.textContent = introduction;
        intro.hidden = !introduction;
        message.textContent = explanation;
        confirmButton.textContent = confirmLabel;
        confirmButton.classList.toggle("guidelume-confirm-dialog__button--danger", danger);
        cancelButton.textContent = cancelLabel;

        return new Promise(resolve => {
            let settled = false;
            const finish = result => {
                if (settled) return;
                settled = true;
                signal?.removeEventListener("abort", abort);
                finishCurrent = null;
                if (dialog.open) dialog.close();
                resolve(result);
                if (!result || restoreFocusOnConfirm) {
                    requestAnimationFrame(() => {
                        if (!document.querySelector("dialog[open]") && returnFocus?.isConnected && typeof returnFocus.focus === "function") {
                            returnFocus.focus({ preventScroll: true });
                        }
                    });
                }
            };
            const abort = () => finish(false);
            finishCurrent = finish;
            signal?.addEventListener("abort", abort, { once: true });
            dialog.showModal();
            cancelButton.focus();
        });
    };
}
