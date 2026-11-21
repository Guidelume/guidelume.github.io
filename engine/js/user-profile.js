import {
    DEFAULT_PROFILE,
    MAX_DISPLAY_NAME_LENGTH,
    PROFILE_AVATARS,
    normalizeUserProfile
} from "./profile-data.js";

const carouselBindings = new WeakMap();

function renderAvatarChoices(container, selected, onSelect) {
    if (!container) return;
    carouselBindings.get(container)?.abort();
    const listeners = new AbortController();
    carouselBindings.set(container, listeners);
    container.replaceChildren();
    container.setAttribute("aria-roledescription", "carousel");
    const makeArrow = (direction, label, symbol) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "profile-avatar-arrow";
        button.dataset.avatarDirection = direction;
        button.setAttribute("aria-label", label);
        button.textContent = symbol;
        return button;
    };
    const previous = makeArrow("previous", "Previous planet", "❮");
    const next = makeArrow("next", "Next planet", "❯");
    const planet = document.createElement("figure"); planet.className = "profile-planet";
    const image = document.createElement("img"); image.alt = ""; image.draggable = false; image.width = 96; image.height = 96;
    const caption = document.createElement("figcaption"); caption.setAttribute("aria-live", "polite"); caption.setAttribute("aria-atomic", "true");
    const name = document.createElement("span"); name.dataset.avatarName = "";
    const count = document.createElement("span"); count.className = "profile-avatar-count";
    caption.append(name, count); planet.append(image, caption); container.append(previous, planet, next);
    let index = Math.max(0, PROFILE_AVATARS.findIndex(avatar => avatar.id === selected));
    function select(position, notify = true) {
        const before = container.dataset.selectedAvatar;
        index = (position + PROFILE_AVATARS.length) % PROFILE_AVATARS.length;
        const avatar = PROFILE_AVATARS[index];
        container.dataset.selectedAvatar = avatar.id;
        planet.dataset.avatar = avatar.id;
        // Only the displayed planet receives a source; hidden choices never
        // download until the visitor actually browses to them.
        if (image.getAttribute("src") !== avatar.src) image.src = avatar.src;
        name.textContent = avatar.label;
        count.textContent = `${index + 1} / ${PROFILE_AVATARS.length}`;
        if (notify && before !== avatar.id) onSelect(avatar.id);
    }
    previous.addEventListener("click", () => select(index - 1));
    next.addEventListener("click", () => select(index + 1));
    container.addEventListener("keydown", event => {
        const position = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: PROFILE_AVATARS.length - 1 }[event.key];
        if (position === undefined) return;
        event.preventDefault(); select(position);
    }, { signal: listeners.signal });
    select(index, false);
    return { select(id) { select(Math.max(0, PROFILE_AVATARS.findIndex(avatar => avatar.id === id)), false); } };
}

function selectedAvatar(container, fallback) {
    return container?.dataset.selectedAvatar || fallback;
}

export function initUserProfile({ memory, saveMemory, openWindow, closeStartMenu, isOnboardingInProgress }) {
    const startButton = document.querySelector("[data-profile-action]");
    const startAvatar = startButton?.querySelector("[data-profile-avatar]");
    const startName = startButton?.querySelector("[data-profile-name]");
    const setupName = document.querySelector("[data-setup-profile-name]");
    const setupAvatars = document.querySelector("[data-setup-profile-avatars]");
    const setupStatus = document.querySelector("[data-setup-profile-status]");
    const profileWindow = document.querySelector('[data-window="user-profile"]');
    const profileTitleIcon = profileWindow?.querySelector("[data-profile-title-avatar]");
    const profileName = profileWindow?.querySelector("[data-user-profile-name]");
    const profileAvatars = profileWindow?.querySelector("[data-user-profile-avatars]");
    const profileStatus = profileWindow?.querySelector("[data-user-profile-status]");
    const unsavedHint = profileWindow?.querySelector("[data-profile-unsaved]");

    memory.profile = normalizeUserProfile(memory.profile);
    let setupAvatar = memory.profile.avatar;
    let editedAvatar = memory.profile.avatar;
    let profileCarousel = null;
    let setupEditRevision = 0;
    let profileEditRevision = 0;

    const avatarFor = id => PROFILE_AVATARS.find(avatar => avatar.id === id) || PROFILE_AVATARS[0];
    function refreshStartMenu() {
        const visibleProfile = isOnboardingInProgress() ? DEFAULT_PROFILE : normalizeUserProfile(memory.profile);
        const avatarSrc = avatarFor(visibleProfile.avatar).src;
        if (startName) startName.textContent = visibleProfile.displayName;
        if (startAvatar) {
            startAvatar.src = avatarSrc;
            startAvatar.alt = "";
        }
        if (profileTitleIcon) profileTitleIcon.src = avatarSrc;
        const profileTaskbarIcon = document.querySelector('[data-taskbar-window="user-profile"] img');
        if (profileTaskbarIcon) profileTaskbarIcon.src = avatarSrc;
        if (startButton) startButton.setAttribute("aria-label", `User profile: ${visibleProfile.displayName}`);
    }

    if (setupName) {
        setupName.maxLength = MAX_DISPLAY_NAME_LENGTH;
        setupName.value = memory.profile.displayName;
    }
    const setupCarousel = renderAvatarChoices(setupAvatars, setupAvatar, id => { setupAvatar = id; setupEditRevision++; if (setupName) setupName.closest("[data-window]").dataset.syncDirty = "true"; });

    function markDraft(root, value = true) {
        if (root) root.dataset.syncDirty = String(value);
        if (root === profileWindow && unsavedHint) {
            unsavedHint.textContent = value ? "Unsaved changes. Save your profile before closing." : "Changes stay here until you save.";
            unsavedHint.dataset.unsaved = String(value);
            profileWindow.querySelector("[data-revert-user-profile]").disabled = !value;
            if (value && profileStatus) profileStatus.textContent = "";
        }
    }
    setupName?.addEventListener("input", () => { setupEditRevision++; markDraft(setupName.closest("[data-window]")); });
    profileName?.addEventListener("input", () => { profileEditRevision++; markDraft(profileWindow); });

    async function saveSetupProfile() {
        const revision = setupEditRevision;
        memory.profile = normalizeUserProfile({
            displayName: setupName?.value,
            avatar: selectedAvatar(setupAvatars, setupAvatar)
        });
        setupName.value = memory.profile.displayName;
        setupAvatar = memory.profile.avatar;
        const saved = await saveMemory();
        if (saved === true && revision === setupEditRevision) { markDraft(setupName.closest("[data-window]"), false); window.dispatchEvent(new Event("guidelume:interaction-ended")); }
        if (setupStatus) setupStatus.textContent = saved === true
            ? "Your profile is saved on this device."
            : "Your profile could not be saved in this browser. Try again when storage is available.";
        refreshStartMenu();
        return saved === true;
    }

    function loadProfileEditor() {
        const profile = normalizeUserProfile(memory.profile);
        if (profileName) {
            profileName.maxLength = MAX_DISPLAY_NAME_LENGTH;
            profileName.value = profile.displayName;
        }
        editedAvatar = profile.avatar;
        profileCarousel ||= renderAvatarChoices(profileAvatars, editedAvatar, id => {
            editedAvatar = id;
            profileEditRevision++;
            markDraft(profileWindow);
        });
        profileCarousel?.select(editedAvatar);
        if (profileStatus) profileStatus.textContent = "";
        markDraft(profileWindow, false);
    }

    // Restored open windows are opened before this controller is initialized.
    // Populate the editor once here as well as when it later receives focus.
    loadProfileEditor();
    profileWindow?.querySelector("[data-revert-user-profile]")?.addEventListener("click", () => {
        profileEditRevision++;
        loadProfileEditor();
        window.dispatchEvent(new Event("guidelume:interaction-ended"));
    });
    profileWindow?.addEventListener("windowfocus", () => {
        // The window manager emits windowfocus on every click inside a window, not only
        // when focus moves to it. Reload only when it actually receives focus so an
        // unsaved name edit survives clicking another avatar or the Save button.
        if (!profileWindow.classList.contains("is-focused") && profileWindow.dataset.syncDirty !== "true") loadProfileEditor();
    });
    profileWindow?.querySelector("[data-save-user-profile]")?.addEventListener("click", async () => {
        const revision = profileEditRevision;
        memory.profile = normalizeUserProfile({ displayName: profileName?.value, avatar: selectedAvatar(profileAvatars, editedAvatar) });
        if (profileName) profileName.value = memory.profile.displayName;
        editedAvatar = memory.profile.avatar;
        const saved = await saveMemory();
        if (saved === true && revision === profileEditRevision) { markDraft(profileWindow, false); window.dispatchEvent(new Event("guidelume:interaction-ended")); }
        refreshStartMenu();
        if (profileStatus) profileStatus.textContent = saved === true
            ? "Profile saved on this device."
            : "Profile updated for this visit, but could not be saved in this browser.";
    });

    startButton?.addEventListener("click", () => {
        closeStartMenu();
        openWindow(isOnboardingInProgress() ? "setup" : "user-profile");
    });
    refreshStartMenu();
    window.addEventListener("guidelume:conflict-resolved", event => {
        if (event.detail?.path?.[0] !== "profile") return;
        markDraft(profileWindow, false);
        if (setupName) markDraft(setupName.closest("[data-window]"), false);
    });

    return { saveSetupProfile, refreshStartMenu, refreshSharedState() {
        refreshStartMenu();
        if (profileWindow?.dataset.syncDirty !== "true") loadProfileEditor();
        if (setupName && setupName.closest("[data-window]").dataset.syncDirty !== "true") {
            setupName.value = memory.profile.displayName;
            setupAvatar = memory.profile.avatar;
            setupCarousel?.select(setupAvatar);
        }
    } };
}
