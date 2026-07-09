// achievements.js — persistent achievements: definitions, storage, unlock checks,
// an "unlocked" toast, and the viewer screen.
//
// A classic script sharing game.js's global scope (loaded right after it). game.js
// calls the record*/achievementsTick hooks below — all guarded on its side with
// `typeof ... === "function"`, so the game still runs if this file is missing (same
// optional-global style as debug.js). Progress lives in one localStorage blob.
(function () {
    const STORE_KEY = "growAFlowerAchievements";
    const ORDINARY_PLANTS = ["flower", "cactus", "sunflower", "orchid", "rose"];
    const ALL_HAZARDS = ["drought", "heat", "rain", "wind", "pests", "root-rot"];
    const SCORE_GOAL = 20000;

    // id, emoji, name, desc (hint), hidden (spoiler -> shows ??? until earned),
    // check(pg) -> true when earned, reading the progress blob (`pg`) built below.
    const ACHIEVEMENTS = [
        { id: "first-bloom", emoji: "\u{1F331}", name: "First Sprout",
          desc: "Grow your first plant to full bloom.",
          check: (pg) => pg.bloomedPlants.length >= 1 },
        { id: "green-thumb", emoji: "\u{1F33F}", name: "Green Thumb",
          desc: "Bloom all five ordinary plants: Flower, Cactus, Sunflower, Orchid and Rose.",
          check: (pg) => ORDINARY_PLANTS.every((id) => pg.bloomedPlants.includes(id)) },
        { id: "hard-won", emoji: "\u{1F335}", name: "Hard Won",
          desc: "Bloom a plant on Hard difficulty.",
          check: (pg) => pg.hardBloom },
        { id: "zen-gardener", emoji: "\u{1F343}", name: "Zen Gardener",
          desc: "Bloom a plant in Zen mode.",
          check: (pg) => pg.zenBloom },
        { id: "master-gardener", emoji: "\u{1F3C6}", name: "Master Gardener",
          desc: "Reach a score of " + SCORE_GOAL.toLocaleString() + " or more.",
          check: () => bestScoreSoFar() >= SCORE_GOAL },
        { id: "weathered", emoji: "\u{26C8}\u{FE0F}", name: "Weathered",
          desc: "Live through every hazard: drought, heat, rain, wind, pests and root rot.",
          check: (pg) => ALL_HAZARDS.every((h) => pg.weatherSeen.includes(h)) },
        { id: "the-unknown", emoji: "\u{1F441}\u{FE0F}", name: "The Unknown",
          desc: "Discover the plant that should not be.", hidden: true,
          check: (pg) => pg.secretFound },
        { id: "or-did-we", emoji: "\u{1F300}", name: "Or Did We?",
          desc: "Reach the secret finale.", hidden: true,
          check: (pg) => pg.secretFinale },
    ];

    function freshProgress() {
        return { unlocked: {}, bloomedPlants: [], weatherSeen: [],
                 hardBloom: false, zenBloom: false, secretFound: false, secretFinale: false };
    }
    // Tolerant of missing / corrupt / partial data (mirrors getBestScore): always
    // returns a well-formed blob so callers never have to null-check fields.
    function loadAchievements() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORE_KEY));
            if (!raw || typeof raw !== "object") return freshProgress();
            const pg = Object.assign(freshProgress(), raw);
            pg.unlocked = (raw.unlocked && typeof raw.unlocked === "object") ? raw.unlocked : {};
            pg.bloomedPlants = Array.isArray(raw.bloomedPlants) ? raw.bloomedPlants : [];
            pg.weatherSeen = Array.isArray(raw.weatherSeen) ? raw.weatherSeen : [];
            return pg;
        } catch (e) { return freshProgress(); }
    }
    function saveAchievements(pg) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(pg)); } catch (e) { /* ignore */ }
    }
    // Higher of the live run's score and the stored best, so the score achievement can
    // unlock mid-run and also counts scores earned before this feature existed.
    function bestScoreSoFar() {
        let live = 0, best = 0;
        try { if (typeof finalScore === "function") live = finalScore() || 0; } catch (e) {}
        try { if (typeof getBestScore === "function") best = getBestScore() || 0; } catch (e) {}
        return Math.max(live, best);
    }

    // Evaluate every not-yet-earned achievement against `pg`; mark newly-earned ones and
    // (unless silent) queue their toast. Returns whether anything changed. Caller saves.
    function evaluateUnlocks(pg, silent) {
        let changed = false;
        ACHIEVEMENTS.forEach((a) => {
            if (!pg.unlocked[a.id] && a.check(pg)) {
                pg.unlocked[a.id] = true;
                changed = true;
                if (!silent) queueToast(a);
            }
        });
        return changed;
    }
    function checkAchievements() {
        const pg = loadAchievements();
        if (evaluateUnlocks(pg)) saveAchievements(pg);
    }

    // --- Fact recorders (called from game.js hooks) ---
    function recordBloom(plantId, difficulty) {
        const pg = loadAchievements();
        if (plantId && !pg.bloomedPlants.includes(plantId)) pg.bloomedPlants.push(plantId);
        if (difficulty === "hard") pg.hardBloom = true;
        if (difficulty === "zen") pg.zenBloom = true;
        evaluateUnlocks(pg);
        saveAchievements(pg);
    }
    function recordSecretFound() {
        const pg = loadAchievements();
        pg.secretFound = true;
        evaluateUnlocks(pg);
        saveAchievements(pg);
    }
    function recordSecretFinale() {
        const pg = loadAchievements();
        pg.secretFinale = true;
        evaluateUnlocks(pg);
        saveAchievements(pg);
    }
    // Called each game tick: record any currently-active hazard and re-check unlocks
    // (also catches the score threshold) — one load + at-most-one save per tick.
    function achievementsTick() {
        const pg = loadAchievements();
        let changed = false;
        const active = [];
        if (typeof droughtTicks !== "undefined" && droughtTicks > 0) active.push("drought");
        if (typeof heatWaveTicks !== "undefined" && heatWaveTicks > 0) active.push("heat");
        if (typeof rainstormTicks !== "undefined" && rainstormTicks > 0) active.push("rain");
        if (typeof windTicks !== "undefined" && windTicks > 0) active.push("wind");
        if (typeof pestActive !== "undefined" && pestActive) active.push("pests");
        if (typeof fungalActive !== "undefined" && fungalActive) active.push("root-rot");
        active.forEach((h) => { if (!pg.weatherSeen.includes(h)) { pg.weatherSeen.push(h); changed = true; } });
        if (evaluateUnlocks(pg)) changed = true;
        if (changed) saveAchievements(pg);
    }

    // --- Unlock toast (one at a time; queued if several land together) ---
    let toastQueue = [];
    let toastActive = false;
    function queueToast(a) { toastQueue.push(a); if (!toastActive) runToast(); }
    function runToast() {
        const el = document.getElementById("achievement-toast");
        if (!el || toastQueue.length === 0) { toastActive = false; return; }
        toastActive = true;
        const a = toastQueue.shift();
        el.innerHTML =
            `<span class="at-emoji">${a.emoji}</span>` +
            `<span class="at-text"><span class="at-label">Achievement unlocked</span>${a.name}</span>`;
        el.classList.add("show");
        setTimeout(() => {
            el.classList.remove("show");
            setTimeout(runToast, 450); // let it fade out before the next
        }, 3600);
    }

    // --- Viewer screen ---
    function buildAchievementsScreen() {
        const list = document.getElementById("achievements-list");
        if (!list) return;
        const pg = loadAchievements();
        const earned = ACHIEVEMENTS.filter((a) => pg.unlocked[a.id]).length;
        const countEl = document.getElementById("achievements-count");
        if (countEl) countEl.textContent = `${earned} / ${ACHIEVEMENTS.length} earned`;
        list.innerHTML = "";
        ACHIEVEMENTS.forEach((a) => {
            const got = !!pg.unlocked[a.id];
            const hide = a.hidden && !got; // spoilery + not yet earned -> mask it
            const row = document.createElement("div");
            row.className = "achievement-row " + (got ? "unlocked" : "locked");
            row.innerHTML =
                `<span class="ach-emoji">${hide ? "\u{1F512}" : a.emoji}</span>` +
                `<span class="ach-body">` +
                    `<span class="ach-name">${hide ? "???" : a.name}</span>` +
                    `<span class="ach-desc">${hide ? "A hidden achievement — keep playing to reveal it." : a.desc}</span>` +
                `</span>` +
                `<span class="ach-check">${got ? "✓" : ""}</span>`;
            list.appendChild(row);
        });
    }
    function openAchievements() {
        buildAchievementsScreen();
        const menu = document.getElementById("menu-container");
        if (menu) menu.style.display = "none";
        if (typeof menuOpen !== "undefined") menuOpen = false;
        const c = document.getElementById("achievements-container");
        if (c) c.style.display = "block";
    }
    function closeAchievements() {
        const c = document.getElementById("achievements-container");
        if (c) c.style.display = "none";
    }

    // Expose the hooks + UI entry points to the shared global (bare names in game.js).
    window.recordBloom = recordBloom;
    window.recordSecretFound = recordSecretFound;
    window.recordSecretFinale = recordSecretFinale;
    window.achievementsTick = achievementsTick;
    window.checkAchievements = checkAchievements;
    window.buildAchievementsScreen = buildAchievementsScreen;
    window.openAchievements = openAchievements;
    window.closeAchievements = closeAchievements;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("achievements-btn");
        if (btn) btn.addEventListener("click", openAchievements);
        const close = document.getElementById("achievements-close-btn");
        if (close) close.addEventListener("click", closeAchievements);
        // Silent retroactive grant on load (e.g. score achievement from an old best),
        // so the toast only fires for genuinely new in-session unlocks.
        const pg = loadAchievements();
        if (evaluateUnlocks(pg, true)) saveAchievements(pg);
    });
})();
