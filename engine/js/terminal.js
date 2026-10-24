const files = {
    "apollo.txt": "Margaret Hamilton (1936–2026) led the team that created the onboard flight software for NASA's Apollo missions. Her careful engineering helped make the lunar landings possible. She died on September 30, 2026, at age 90. Remember the people whose thoughtful work makes remarkable journeys safer.",
    "grace-hopper.txt": "Grace Hopper helped make programming languages more accessible and popularized the term debugging. She believed that asking for forgiveness was often easier than getting permission to try a good idea.",
    "ada-lovelace.txt": "Ada Lovelace described how a machine might manipulate symbols as well as numbers. Her notes on the Analytical Engine imagined possibilities far beyond calculation."
};

const directories = {
    "": ["hello.txt", "unknown.bat", "tributes/"],
    tributes: ["apollo.txt", "grace-hopper.txt", "ada-lovelace.txt"]
};

const commands = ["help", "whoami", "dir", "ls", "cd", "clear", "reset"];
const maxOutputLines = 500;

export function initTerminal({ windowElement, blackwall, requestEasterEggUnlock, isEasterEggsUnlocked = () => false, getProfileName = () => "Visitor" }) {
    if (!windowElement) return;
    const output = windowElement.querySelector(".terminal-output");
    const content = windowElement.querySelector(".terminal-content");
    const form = windowElement.querySelector(".terminal-input-row");
    const input = windowElement.querySelector(".terminal-input");
    const promptName = windowElement.querySelector("[data-terminal-profile]");
    const promptPath = windowElement.querySelector("[data-terminal-path]");
    if (!output || !form || !input || !promptName || !promptPath) return;

    const listeners = new AbortController();
    let currentDirectory = "";
    const commandHistory = [];
    let historyIndex = 0;
    let historyDraft = "";

    function currentProfileName() {
        const name = getProfileName();
        return typeof name === "string" && name.trim() ? name.trim() : "Visitor";
    }

    function scrollToEnd() {
        output.scrollTop = output.scrollHeight;
    }

    function addLine(text = "", className = "") {
        const line = document.createElement("div");
        line.className = `terminal-line ${className}`.trim();
        line.textContent = text;
        output.append(line);
        while (output.childElementCount > maxOutputLines) {
            output.firstElementChild.remove();
        }
        scrollToEnd();
    }

    function updatePrompt() {
        promptName.textContent = currentProfileName();
        promptPath.textContent = currentDirectory ? `~/${currentDirectory}` : "~";
    }

    function resetTerminal() {
        currentDirectory = "";
        updatePrompt();
        output.replaceChildren();
        addLine("Connected to TOP-HOG-1, a very distant and probably harmless machine.", "terminal-muted");
        addLine('Type "help" to see what this terminal can do.', "terminal-muted");
    }

    function showHelp() {
        addLine("Commands: help, whoami, dir, cd <folder>, cd.., clear, reset");
        addLine("You can also type a .txt filename to read it.", "terminal-muted");
    }

    function suggestCommand(command) {
        if (command.length < 3) return null;
        const distance = (left, right) => {
            const row = Array.from({ length: right.length + 1 }, (_, index) => index);
            for (let i = 1; i <= left.length; i += 1) {
                let diagonal = row[0];
                row[0] = i;
                for (let j = 1; j <= right.length; j += 1) {
                    const previous = row[j];
                    row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
                    diagonal = previous;
                }
            }
            return row[right.length];
        };
        return commands.find(candidate => distance(command, candidate) === 1) || null;
    }

    function runCommand(rawCommand) {
        const commandLine = rawCommand.trim();
        if (!commandLine) return;
        addLine(`${currentProfileName()}@TOP-HOG-1:${currentDirectory ? `~/${currentDirectory}` : "~"}$ ${commandLine}`, "terminal-command");
        const [verb, ...argumentsList] = commandLine.split(/\s+/);
        let command = verb.toLowerCase();
        let argument = argumentsList.join(" ").replace(/^['"]|['"]$/g, "");
        if (command === "cd..") {
            command = "cd";
            argument = "..";
        }

        if (command === "clear") {
            output.replaceChildren();
            return true;
        }
        if (command === "reset") {
            resetTerminal();
            return true;
        }
        if (command === "help") {
            showHelp();
            return true;
        }
        if (command === "whoami") {
            addLine(currentProfileName());
            return true;
        }
        if (currentDirectory === "" && commandLine.toLowerCase() === "unknown.bat" && !isEasterEggsUnlocked()) {
            requestEasterEggUnlock?.(message => addLine(message));
            return true;
        }
        if (command === "dir" || command === "ls") {
            (directories[currentDirectory] || [])
                .filter(name => name !== "unknown.bat" || !isEasterEggsUnlocked())
                .forEach(name => addLine(name));
            return true;
        }
        if (command === "cd") {
            if (!argument || argument === "/" || argument === "~" || argument === "..") {
                currentDirectory = "";
            } else if (currentDirectory === "" && ["tributes", "tributes/"].includes(argument.toLowerCase())) {
                currentDirectory = "tributes";
            } else {
                addLine(`Folder not found: ${argument}`);
            }
            updatePrompt();
            return true;
        }
        const fileName = commandLine.toLowerCase();
        const fileAvailable = currentDirectory
            ? directories[currentDirectory]?.includes(fileName)
            : fileName === "hello.txt";
        if (!argumentsList.length && fileAvailable && (fileName === "hello.txt" || files[fileName])) {
            addLine(fileName === "hello.txt"
                ? `Hello, ${currentProfileName()}. This little terminal is part of the Guidelume workspace.`
                : files[fileName]);
            return true;
        }
        const suggestion = suggestCommand(command);
        if (suggestion) addLine(`Did you mean: ${suggestion}?`);
        else addLine('Command not found. Type "help" to see available commands.');
        return false;
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        if (blackwall.isLocked) return;
        const rawCommand = input.value;
        input.value = "";
        if (!blackwall.checkSubmission(rawCommand)) return;
        const command = rawCommand.trim();
        if (command) {
            commandHistory.push(command);
            historyIndex = commandHistory.length;
            historyDraft = "";
            blackwall.recordCommandResult(runCommand(command));
        }
    }, { signal: listeners.signal });
    windowElement.addEventListener("windowfocus", () => {
        updatePrompt();
        input.focus({ preventScroll: true });
    }, { signal: listeners.signal });
    content?.addEventListener("pointerdown", event => {
        if (event.target.closest("input, button, a, label, select, textarea")) return;
        window.requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }, { signal: listeners.signal });
    input.addEventListener("keydown", event => {
        if (event.key === "Escape") input.value = "";
        if (event.key === "ArrowUp" && commandHistory.length) {
            event.preventDefault();
            if (historyIndex === commandHistory.length) historyDraft = input.value;
            historyIndex = Math.max(0, historyIndex - 1);
            input.value = commandHistory[historyIndex];
        } else if (event.key === "ArrowDown" && commandHistory.length) {
            event.preventDefault();
            historyIndex = Math.min(commandHistory.length, historyIndex + 1);
            input.value = historyIndex === commandHistory.length
                ? historyDraft
                : commandHistory[historyIndex];
        }
    }, { signal: listeners.signal });
    resetTerminal();
    return {
        destroy() {
            listeners.abort();
        }
    };
}
