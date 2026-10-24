// Volume I identity and navigation. Installation routes are alternatives.
(() => {
    const pages = Object.freeze({
        'intro.html': {
            label: 'Introduction',
            number: '1',
            group: 'Main Guide',
            previous: null,
            next: 'setup.html'
        },
        'setup.html': {
            label: 'Setup',
            number: '2',
            group: 'Main Guide',
            previous: 'intro.html',
            next: 'paths.html'
        },
        'paths.html': {
            label: 'Branching Paths',
            number: '3',
            group: 'Main Guide',
            previous: 'setup.html',
            next: null
        },
        'manual.html': {
            label: 'Manual Installation',
            number: '3A',
            group: 'Main Guide',
            previous: 'paths.html',
            next: 'finish.html',
            branch: 'manual'
        },
        'elfroot.html': {
            label: 'Elfroot Installation',
            number: '3B',
            group: 'Main Guide',
            previous: 'paths.html',
            next: 'finish.html',
            branch: 'elfroot'
        },
        'finish.html': {
            label: 'Finish',
            number: '4',
            group: 'Main Guide',
            previous: 'paths.html',
            next: null
        },
        'appearance.html': {
            label: 'Appearance',
            number: '5',
            group: 'Main Guide',
            previous: 'finish.html',
            next: null,
            optional: true
        },
        'questions.html': {
            label: 'FAQ',
            group: 'Appendices',
            previous: null,
            next: 'changelog.html'
        },
        'changelog.html': {
            label: 'Changelog',
            group: 'Appendices',
            previous: 'questions.html',
            next: 'credits.html'
        },
        'credits.html': {
            label: 'Credits',
            group: 'Appendices',
            previous: 'changelog.html',
            next: null
        }
    });
    const branchKey = 'twfg:volume-1:installation-path';
    const branchFiles = Object.freeze({
        manual: 'manual.html',
        elfroot: 'elfroot.html'
    });
    let selectedBranch = null;
    try {
        selectedBranch = sessionStorage.getItem(branchKey);
    } catch {}
    if (!Object.hasOwn(branchFiles, selectedBranch)) selectedBranch = null;
    function selectBranch(branch) {
        if (!Object.hasOwn(branchFiles, branch)) return;
        selectedBranch = branch;
        try {
            sessionStorage.setItem(branchKey, branch);
        } catch {}
    }
    function route(file) {
        const page = pages[file];
        if (!page) return { previous: null, next: null };
        return {
            previous: file === 'finish.html'
                ? (branchFiles[selectedBranch] || 'paths.html')
                : page.previous,
            next: page.next
        };
    }
    window.TWFG = Object.freeze({
        name: "The Warden's Field Guide",
        volume: 'Volume I: Ferelden',
        lastUpdated: 'October 2026',
        version: 'v0.1',
        pages,
        route,
        selectBranch,
        get selectedBranch() {
            return selectedBranch;
        }
    });
    const currentFile = location.pathname.split('/').pop();
    if (pages[currentFile]?.branch) selectBranch(pages[currentFile].branch);
    document.querySelectorAll('[data-guide-updated]').forEach(element => {
        element.textContent = `${TWFG.lastUpdated} · ${TWFG.version}`;
    });
})();
