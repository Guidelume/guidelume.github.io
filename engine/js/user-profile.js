import {
    DEFAULT_PROFILE,
    MAX_DISPLAY_NAME_LENGTH,
    PROFILE_AVATARS,
    normalizeUserProfile
} from "./profile-data.js";

function renderAvatarChoices(container, selected, onSelect) {
    if (!container) return;
    container.replaceChildren();
    PROFILE_AVATARS.forEach(avatar => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "profile-avatar-choice";
        button.dataset.avatar = avatar.id;
        button.setAttribute("aria-label", avatar.label);
        button.setAttribute("aria-pressed", String(avatar.id === selected));
        button.title = avatar.label;
        const image = document.createElement("img");
        image.src = avatar.src;
        image.alt = "";
        image.draggable = false;
        button.append(image);
        button.addEventListener("click", () => {
            container.querySelectorAll("[data-avatar]").forEach(choice => {
                choice.setAttribute("aria-pressed", String(choice.dataset.avatar === avatar.id));
            });
            onSelect(avatar.id);
        });
        container.append(button);
    });
}

function selectedAvatar(container, fallback) {
    return container?.querySelector("[data-avatar][aria-pressed='true']")?.dataset.avatar || fallback;
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
    const profilePreview = profileWindow?.querySelector("[data-user-profile-preview]");
    const profileAvatars = profileWindow?.querySelector("[data-user-profile-avatars]");
    const profileStatus = profileWindow?.querySelector("[data-user-profile-status]");

    memory.profile = normalizeUserProfile(memory.profile);
    let setupAvatar = memory.profile.avatar;
    let editedAvatar = memory.profile.avatar;

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
    renderAvatarChoices(setupAvatars, setupAvatar, id => { setupAvatar = id; });

    function saveSetupProfile() {
        memory.profile = normalizeUserProfile({
            displayName: setupName?.value,
            avatar: selectedAvatar(setupAvatars, setupAvatar)
        });
        setupName.value = memory.profile.displayName;
        setupAvatar = memory.profile.avatar;
        const saved = saveMemory();
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
        if (profilePreview) profilePreview.src = avatarFor(profile.avatar).src;
        renderAvatarChoices(profileAvatars, editedAvatar, id => {
            editedAvatar = id;
            if (profilePreview) profilePreview.src = avatarFor(id).src;
        });
        if (profileStatus) profileStatus.textContent = "";
    }

    // Restored open windows are opened before this controller is initialized.
    // Populate the editor once here as well as when it later receives focus.
    loadProfileEditor();
    profileWindow?.addEventListener("windowfocus", () => {
        // The window manager emits windowfocus on every click inside a window, not only
        // when focus moves to it. Reload only when it actually receives focus so an
        // unsaved name edit survives clicking another avatar or the Save button.
        if (!profileWindow.classList.contains("is-focused")) loadProfileEditor();
    });
    profileWindow?.querySelector("[data-save-user-profile]")?.addEventListener("click", () => {
        memory.profile = normalizeUserProfile({ displayName: profileName?.value, avatar: selectedAvatar(profileAvatars, editedAvatar) });
        if (profileName) profileName.value = memory.profile.displayName;
        editedAvatar = memory.profile.avatar;
        if (profilePreview) profilePreview.src = avatarFor(editedAvatar).src;
        const saved = saveMemory();
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

    return { saveSetupProfile, refreshStartMenu };
}
