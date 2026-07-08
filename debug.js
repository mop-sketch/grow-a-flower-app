// debug.js — dev-only playtesting panel.
//
// Completely inert unless enabled with `?debug=1` in the URL (which is then
// remembered in localStorage so it survives the page reloads that Restart does).
// Turn it off again with `?debug=0`. It ships harmlessly in the bundle — a normal
// player never sets the flag, so none of this code runs for them.
//
// It reaches into game.js's globals (growthStage, water, debugGodMode, …) and
// functions (resetTendingState, onFertilizer, …). That works because both are
// plain classic scripts sharing one global scope, and debug.js loads last.
(function () {
    const params = new URLSearchParams(location.search);
    if (params.get("debug") === "1") localStorage.setItem("growAFlowerDebug", "1");
    if (params.get("debug") === "0") localStorage.removeItem("growAFlowerDebug");
    if (localStorage.getItem("growAFlowerDebug") !== "1") return;

    // Skip the intro tutorial while playtesting.
    localStorage.setItem("growAFlowerTutorialSeen", "true");

    document.addEventListener("DOMContentLoaded", buildPanel);

    function ensureStarted() {
        const diff = document.getElementById("difficulty-container");
        if (diff && getComputedStyle(diff).display !== "none") startGame("easy");
    }

    function showHealthRow() {
        document.getElementById("health-row").style.display = "flex";
        document.body.classList.add("health-active");
    }

    function buildPanel() {
        // Suppress contextual tips while playtesting — they pause the tick loop.
        if (typeof maybeShowTip === "function") window.maybeShowTip = function () {};
        tutorialActive = false;

        const style = document.createElement("style");
        style.textContent = `
            #debug-panel{position:fixed;top:8px;left:8px;z-index:99999;font-family:monospace;
                background:rgba(20,20,25,0.9);color:#eee;border:1px solid #556;border-radius:8px;
                padding:8px;width:172px;max-height:94vh;overflow:auto;font-size:11px;line-height:1.35;}
            #debug-panel h4{margin:7px 0 3px;font-size:10px;color:#8fd;letter-spacing:.5px;text-transform:uppercase;}
            #debug-panel .row{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:2px;}
            #debug-panel button{flex:1 1 auto;min-width:38px;background:#334;color:#eee;border:1px solid #667;
                border-radius:5px;padding:4px 5px;font:inherit;cursor:pointer;}
            #debug-panel button:hover{background:#456;}
            #debug-panel .hdr{display:flex;justify-content:space-between;align-items:center;
                font-weight:bold;color:#fd8;margin-bottom:4px;}
            #debug-panel.collapsed .body{display:none;}
        `;
        document.head.appendChild(style);

        const panel = document.createElement("div");
        panel.id = "debug-panel";
        panel.innerHTML = `
            <div class="hdr"><span>🐛 DEBUG</span>
                <button id="dbg-collapse" style="flex:0 0 auto;min-width:22px;">–</button></div>
            <div class="body">
              <h4>Start difficulty</h4><div class="row" id="dbg-start"></div>
              <h4>Grow</h4><div class="row" id="dbg-grow"></div>
              <h4>Play as plant</h4><div class="row" id="dbg-plants"></div>
              <h4>Force event</h4><div class="row" id="dbg-events"></div>
              <h4>Toggles</h4><div class="row" id="dbg-toggles"></div>
            </div>`;
        document.body.appendChild(panel);

        const mk = (parent, label, fn) => {
            const b = document.createElement("button");
            b.textContent = label;
            b.onclick = fn;
            document.getElementById(parent).appendChild(b);
            return b;
        };

        document.getElementById("dbg-collapse").onclick = () => {
            panel.classList.toggle("collapsed");
            document.getElementById("dbg-collapse").textContent =
                panel.classList.contains("collapsed") ? "+" : "–";
        };

        // --- Start ---
        [["Easy", "easy"], ["Med", "medium"], ["Hard", "hard"]].forEach(([label, d]) =>
            mk("dbg-start", label, () => startGame(d)));

        // --- Grow ---
        mk("dbg-grow", "+1 Stage", () => {
            ensureStarted(); dead = false;
            if (growthStage < FINAL_STAGE) { growthStage += 1; fertilizer = 0; }
            updateStatus();
        });
        mk("dbg-grow", "Late phase", () => {
            ensureStarted(); dead = false;
            if (growthStage < 3) growthStage = 3;
            updateStatus();
        });
        mk("dbg-grow", "Bloom now", () => {
            ensureStarted(); dead = false;
            growthStage = FINAL_STAGE - 1;
            const [lo, hi] = safeZone(); const mid = (lo + hi) / 2;
            water = mid; sunlight = mid; warmth = mid;
            fertilizer = fertThreshold();
            onFertilizer();
        });

        // --- Play as plant ---
        [STARTER_PLANT, ...PLANT_POOL, SECRET_PLANT].forEach((p) =>
            mk("dbg-plants", p.id === "secret" ? "Secret" : p.name, () => {
                ensureStarted();
                resetTendingState(p);
            }));

        // --- Force event (ignores the plant's hazard list, so you can see any of them) ---
        const wd = () => settings.weather_duration || 4;
        mk("dbg-events", "Drought", () => { ensureStarted(); droughtTicks = wd(); updateStatus(); });
        mk("dbg-events", "Root rot", () => { ensureStarted(); fungalActive = true; showHealthRow(); updateStatus(); });
        mk("dbg-events", "Wind", () => { ensureStarted(); windTicks = 3; updateStatus(); });
        mk("dbg-events", "Pests", () => { ensureStarted(); pestActive = true; showHealthRow(); updateStatus(); });
        mk("dbg-events", "Heat", () => { ensureStarted(); heatWaveTicks = wd(); updateStatus(); });
        mk("dbg-events", "Rain", () => { ensureStarted(); rainstormTicks = wd(); updateStatus(); });

        // --- Toggles ---
        const godBtn = mk("dbg-toggles", "God: OFF", () => {
            debugGodMode = !debugGodMode;
            godBtn.textContent = "God: " + (debugGodMode ? "ON" : "OFF");
            godBtn.style.background = debugGodMode ? "#265" : "#334";
        });
        const speeds = [["1x", 1000], ["2x", 500], ["4x", 250], ["0.5x", 2000]];
        let si = 0;
        const speedBtn = mk("dbg-toggles", "Speed: 1x", () => {
            si = (si + 1) % speeds.length;
            debugTickMs = speeds[si][1];
            speedBtn.textContent = "Speed: " + speeds[si][0];
            if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
            startLoop();
        });
        mk("dbg-toggles", "Restart", () => onRestart());
    }
})();
