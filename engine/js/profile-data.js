export const PROFILE_AVATARS = Object.freeze([
    { id: "planet00", label: "Planet 00", src: "./engine/img/environment/profile/planet00.png" },
    { id: "planet02", label: "Planet 02", src: "./engine/img/environment/profile/planet02.png" },
    { id: "planet03", label: "Planet 03", src: "./engine/img/environment/profile/planet03.png" },
    { id: "planet04", label: "Planet 04", src: "./engine/img/environment/profile/planet04.png" },
    { id: "planet06", label: "Planet 06", src: "./engine/img/environment/profile/planet06.png" },
    { id: "planet07", label: "Planet 07", src: "./engine/img/environment/profile/planet07.png" },
    { id: "planet09", label: "Planet 09", src: "./engine/img/environment/profile/planet09.png" }
]);

export const DEFAULT_PROFILE = Object.freeze({ displayName: "Visitor", avatar: "planet00" });
export const MAX_DISPLAY_NAME_LENGTH = 24;

const avatarIds = new Set(PROFILE_AVATARS.map(avatar => avatar.id));

export function isProfileAvatar(value) {
    return typeof value === "string" && avatarIds.has(value);
}

export function normalizeUserProfile(value) {
    const name = typeof value?.displayName === "string"
        ? Array.from(value.displayName.trim()).slice(0, MAX_DISPLAY_NAME_LENGTH).join("").trim()
        : "";
    return {
        displayName: name || DEFAULT_PROFILE.displayName,
        avatar: isProfileAvatar(value?.avatar) ? value.avatar : DEFAULT_PROFILE.avatar
    };
}
