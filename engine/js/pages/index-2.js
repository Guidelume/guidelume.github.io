// Page controller for index.html.

        try {
            // This is a first-paint hint. global.js awaits IndexedDB and replaces
            // it with the authoritative value before restoring any windows.
            const bootstrap = JSON.parse(localStorage.getItem("guidelume_desktop_bootstrap_v1"));
            const savedMemory = JSON.parse(localStorage.getItem("guidelume_desktop_memory"));
            const savedExperience = localStorage.getItem("guidelume_experience");
            const completed = typeof bootstrap?.completed === "boolean" ? bootstrap.completed : savedMemory?.onboarding?.completed === true
                || savedMemory?.settings?.onboardingComplete === true
                || (!savedMemory && ["interactive", "reader", "basic"].includes(savedExperience));
            document.documentElement.dataset.onboardingComplete = String(completed);
        } catch {
            document.documentElement.dataset.onboardingComplete = "false";
        }
    