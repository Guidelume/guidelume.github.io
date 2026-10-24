void import(new URL('../../../../engine/js/resource-lifecycle.js', document.currentScript.src).href).catch(() => {});
const noteDialog = document.getElementById('ea-note-modal');
const noteTrigger = document.querySelector('.note-trigger');
const noteClose = document.querySelector('.ea-modal-close');
noteTrigger?.addEventListener('click', () => noteDialog.showModal());
noteClose?.addEventListener('click', () => noteDialog.close());
noteDialog?.addEventListener('click', event => {
    if (event.target !== noteDialog) return;
    const box = noteDialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) noteDialog.close();
});
noteDialog?.addEventListener('close', () => noteTrigger?.focus());
