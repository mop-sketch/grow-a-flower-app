// Grow a Flower — game logic.
// Ported from the original PyScript main.py to plain JavaScript so the game
// runs with no Python runtime (small, instant, offline-friendly).

const HIGH_SCORE_KEY = "growAFlowerBest";
const SAVE_KEY = "growAFlowerSave"; // in-progress game snapshot (survives app close)

let water = 50;
let fertilizer = 0;
let sunlight = 50;
let growthStage = 0;
let dead = false;
let eyesSettled = false;    // one-shot guard: eyes ease to centre once on death
let heatWaveTicks = 0;
let rainstormTicks = 0;
let droughtTicks = 0;
let windTicks = 0;
let fungalActive = false;
let health = 100;
let pestActive = false;
let warmthButtonShown = false;
let warmth = 50;
let mysteryMenu = false;
let menuOpen = false;
let score = 0;
let scoreSaved = false;
let tutorialActive = false; // set by tutorial.js; pauses the decay loop
let entityRevealActive = false; // brief dramatic hold when the secret entity first appears
let gameStarted = false;    // true once a difficulty is chosen (a tending game is live)
let currentDifficulty = "easy"; // the chosen difficulty key, for saving/restoring
let debugGodMode = false;   // set by debug.js (?debug=1): meters/health never kill
let debugTickMs = 1000;     // set by debug.js: tick speed (fast-forward / slow-mo)

const upgrades = { decay: 0, fertilizer: 0, safe_zone: 0, weather: 0 };
let currentUpgradeChoices = [];

// Difficulty presets. "easy" matches the original tuning.
// "medium" is overall harsher. "hard" is the same as medium except plants
// take longer to advance through each stage (slower fertilizer, higher thresholds).
// "zen" sits below easy: a relaxed, hard-to-fail mode for players who just want
// to grow — slow decay, wide death margin, rare/mild events, low score payoff.
// `death_margin` is how close to the edges a meter can get before it kills the
// plant (die at <=margin or >=100-margin); bigger margin on zen = more buffer.
const DIFFICULTIES = {
    zen: {
        decay: 1,
        fert_gen: 4,
        weather_intensity: 2,
        event_chance: 0.004,
        weather_duration: 3,
        pest_drain: 2,
        fert_threshold_start: 25,
        fert_threshold: 60,
        score_mult: 0.5,
        death_margin: 10,
    },
    easy: {
        decay: 2,
        fert_gen: 3,
        weather_intensity: 4,
        event_chance: 0.01,
        weather_duration: 4,
        pest_drain: 3,
        fert_threshold_start: 30,
        fert_threshold: 70,
        score_mult: 1.0,
        death_margin: 20,
    },
    medium: {
        decay: 3,
        fert_gen: 2,
        weather_intensity: 5,
        event_chance: 0.018,
        weather_duration: 5,
        pest_drain: 4,
        fert_threshold_start: 30,
        fert_threshold: 70,
        score_mult: 1.5,
        death_margin: 20,
    },
    hard: {
        decay: 3,
        fert_gen: 1,
        weather_intensity: 5,
        event_chance: 0.018,
        weather_duration: 5,
        pest_drain: 4,
        fert_threshold_start: 45,
        fert_threshold: 95,
        score_mult: 2.0,
        death_margin: 20,
    },
};
// Active tuning. Replaced when the player picks a difficulty; defaults to easy.
let settings = DIFFICULTIES.easy;

function mod(key, fallback) {
    return currentPlant.modifiers?.[key] ?? fallback;
}

// Does the current plant face this real-world hazard? Events only spawn for
// hazards in the plant's list (see PLANT_POOL).
function hasHazard(id) {
    return (currentPlant.hazards || []).includes(id);
}

// The stage-3+ late phase reuses the same 4th-meter machinery (a meter that
// decays and must be tapped back into the safe zone), re-skinned per climate.
const LATE_PHASES = {
    winter: { meterLabel: "Warmth\u{1F525}", btnLabel: "Warmth", bodyClass: "winter", btnClass: "",
              tip: "It's getting cold! Tap Warmth to keep your plant from freezing - keep it inside the safe zone too.",
              deathMsg: "Plant froze in the cold" },
    heat:   { meterLabel: "Humidity\u{1F4A6}", btnLabel: "Humidify", bodyClass: "heat-season", btnClass: "humidify-button",
              tip: "Heat season! The air dries out fast - tap Humidify to keep moisture in the safe zone.",
              deathMsg: "Plant wilted in the heat" },
    eldritch: { meterLabel: "Sanity\u{1F300}", btnLabel: "Focus", bodyClass: "eldritch", btnClass: "eldritch-button",
              tip: "Reality is thinning. Tap Focus to hold your Sanity in the safe zone.",
              deathMsg: "Your mind slipped into the bloom" },
};
// Every stage-3+ phase class, so switching plants/phases never leaves one stuck.
const PHASE_CLASSES = ["winter", "heat-season", "eldritch"];
function latePhase() {
    return LATE_PHASES[currentPlant.latePhase] || LATE_PHASES.winter;
}

// Death flavour for the secret (eldritch) plant — a random one shows each death,
// mixing corrupted-signal / the entity addressing you / ominous lore.
const SECRET_DEATH_MSGS = [
    "It stops watching. So do you.",
    "You were only ever the soil.",
    "The eyes close. Something else opens.",
    "The vines recede. The garden forgets you.",
    "What grew here should not have. It knows that now.",
    "Your mind slipped into the bloom.",
    "ERROR: entity has left the soil.",
    "SIGNAL LOST. Entity unresponsive.",
];
const SECRET_GERMINATE_FAIL_MSGS = [
    "The seed refused to wake.",
    "It chose not to grow. Not for you.",
];
const pickMsg = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Every event / late-phase body class, cleared together when the tending view
// is hidden (menus, win screen) so no ambience overlay lingers.
const AMBIENCE_CLASSES = ["winter", "heat-season", "heat-wave", "rainstorm", "drought", "wind", "fungal"];
function clearAmbience() {
    document.body.classList.remove(...AMBIENCE_CLASSES);
}

// On death the eyes should drift to a centred, dead stare rather than snap there.
// Chromium jumps a transform straight to its base the instant an animation is
// removed, so a CSS transition can't ease it. Instead, FLIP it in JS: read each
// wandering group's current transform, pin it inline (killing the loop without a
// jump), force a reflow, then transition that pinned value to centre/open.
function settleEyesToCentre() {
    const groups = document.querySelectorAll(".eye-shape, .eye-drift, .eye-look");
    // Pin each group where it currently is. Setting animation:none first is what
    // lets the inline transform stick (a running CSS animation outranks inline).
    groups.forEach((el) => {
        const current = getComputedStyle(el).transform;
        el.style.animation = "none";
        el.style.transition = "none";
        el.style.transform = current === "none" ? "none" : current;
    });
    // Let the pinned start commit for a frame (offsetWidth can't force a reflow on
    // SVG <g>, so use rAF), then ease each to centre / eye-open.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        groups.forEach((el) => {
            el.style.transition = "transform 1.6s ease-out";
            el.style.transform = "none";
        });
    }));
}

// Undo settleEyesToCentre so a fresh plant's eyes wander again.
function resetEyeSettle() {
    document.querySelectorAll(".eye-shape, .eye-drift, .eye-look").forEach((el) => {
        el.style.transition = "";
        el.style.animation = "";
        el.style.transform = "";
    });
    eyesSettled = false;
}

function fertThreshold() {
    const base = growthStage === 0 ? settings.fert_threshold_start : settings.fert_threshold;
    // Fertilizer is capped at 100 wherever it's generated, so a threshold above
    // that can never be met and the plant gets stuck forever. This bit Rose on
    // Hard (95 base + 15 fertThresholdDelta = 110). Clamp so it's always reachable.
    return Math.min(base + mod("fertThresholdDelta", 0), 100);
}

function safeZone() {
    const widen = mod("safeZoneDelta", 0);
    const safeMin = Math.max(35 - upgrades.safe_zone * 5 - widen, 20);
    const safeMax = Math.min(65 + upgrades.safe_zone * 5 + widen, 80);
    return [safeMin, safeMax];
}

function finalScore() {
    return Math.round(score * settings.score_mult * mod("scoreMult", 1));
}

function getBestScore() {
    const stored = localStorage.getItem(HIGH_SCORE_KEY);
    if (stored === null) return 0;
    const n = parseInt(stored, 10);
    return Number.isNaN(n) ? 0 : n;
}

function updateScoreDisplay() {
    const scoreEl = document.getElementById("score");
    if (scoreEl !== null) {
        scoreEl.innerHTML = `Score: ${finalScore()} &nbsp;&nbsp; Best: ${getBestScore()}`;
    }
}

function saveHighScore() {
    if (scoreSaved) return;
    scoreSaved = true;
    if (finalScore() > getBestScore()) {
        localStorage.setItem(HIGH_SCORE_KEY, String(finalScore()));
    }
}

// --- Save / restore in-progress game -----------------------------------------
// Persists a snapshot of the live tending state so leaving the app (or the phone
// powering off) doesn't lose progress. Only saved during active tending; cleared
// on death / win / restart. See restoreSavedGame() (run on load).
function findPlantById(id) {
    if (id === STARTER_PLANT.id) return STARTER_PLANT;
    if (id === SECRET_PLANT.id) return SECRET_PLANT;
    return PLANT_POOL.find((p) => p.id === id) || STARTER_PLANT;
}

function saveGame() {
    // Only persist a live, restorable tending state (not menus, death, or a win).
    if (!gameStarted || dead || sequenceComplete || growthStage >= FINAL_STAGE || mysteryMenu) return;
    try {
        // Note: the plant-sequence counters (picksRemaining / grownPlantIds /
        // sequenceComplete) are intentionally NOT saved — progress toward the secret
        // plant shouldn't carry across sessions, so reopening keeps the current plant
        // but restarts the countdown to the secret.
        localStorage.setItem(SAVE_KEY, JSON.stringify({
            v: 1,
            difficulty: currentDifficulty,
            plantId: currentPlant.id,
            water, sunlight, warmth, fertilizer, growthStage, health, score,
            heatWaveTicks, rainstormTicks, droughtTicks, windTicks,
            pestActive, fungalActive,
            upgrades: { ...upgrades },
        }));
    } catch (e) { /* storage unavailable/full: skip */ }
}

function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

// Rebuild a saved tending game on load. Returns true if a game was restored.
function restoreSavedGame() {
    let snap;
    try { snap = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    if (!snap || snap.v !== 1 || !DIFFICULTIES[snap.difficulty]) { clearSave(); return false; }
    const plant = findPlantById(snap.plantId);
    // Guard: only restore mid-tending (not a finished/blank snapshot).
    if (snap.sequenceComplete || snap.growthStage >= plant.stages.length - 1) { clearSave(); return false; }

    currentDifficulty = snap.difficulty;
    settings = DIFFICULTIES[currentDifficulty];
    gameStarted = true;
    document.getElementById("difficulty-container").style.display = "none";
    // resetTendingState builds the correct plant DOM (controls, ambience class,
    // buttons, flower@stage0) and starts the loop; then we overlay saved progress.
    resetTendingState(plant);
    water = snap.water; sunlight = snap.sunlight; warmth = snap.warmth;
    fertilizer = snap.fertilizer; growthStage = snap.growthStage; health = snap.health;
    score = snap.score; dead = false;
    heatWaveTicks = snap.heatWaveTicks; rainstormTicks = snap.rainstormTicks;
    droughtTicks = snap.droughtTicks; windTicks = snap.windTicks;
    pestActive = snap.pestActive; fungalActive = snap.fungalActive;
    Object.keys(upgrades).forEach((k) => { upgrades[k] = (snap.upgrades && snap.upgrades[k]) || 0; });
    // picksRemaining / grownPlantIds / sequenceComplete are deliberately left at their
    // fresh defaults (resetTendingState already marked the current plant as grown), so
    // the countdown to the secret plant restarts rather than carrying over.

    // Stage- and event-dependent UI the fresh reset doesn't cover.
    document.getElementById("flower-image").src = STAGES[growthStage];
    if (growthStage >= 3) applyLatePhaseUI();
    if (pestActive || fungalActive) {
        document.getElementById("health-row").style.display = "flex";
        document.body.classList.add("health-active");
    }
    if (fungalActive) {
        document.getElementById("drain-btn").style.display = "block";
        document.body.classList.add("drain-active");
    }
    if (plant === SECRET_PLANT) {
        const ambience = document.getElementById("ambience-audio");
        ambience.volume = 0.5;
        try { ambience.play(); } catch (e) { /* autoplay may wait for a tap */ }
        document.getElementById("music-audio").src = "music and images/Unknown-creature-music.mp3";
    }
    updateStatus();
    return true;
}

const UPGRADE_INFO = {
    decay: ["Slow Decay", "Water, sunlight & warmth decay −0.5/tick per level"],
    fertilizer: ["Boost Fertilizer", "Fertilizer generation +1/tick per level"],
    safe_zone: ["Widen Safe Zone", "Fertilizer safe zone expands 5% per level"],
    weather: ["Weather Shield", "Heat wave & rainstorm intensity −1/tick per level"],
};
const MAX_UPGRADE_LEVEL = 3;

// Every plant's art follows the same 7-stage naming convention inside its own
// flower/<id>/ folder (plus a DeadPlant.png for the death state).
function plantStages(id) {
    return [
        `flower/${id}/Seed.png`,
        `flower/${id}/Sprout.png`,
        `flower/${id}/Seedling.png`,
        `flower/${id}/YoungPlant.png`,
        `flower/${id}/OlderPlant.png`,
        `flower/${id}/Budding.png`,
        `flower/${id}/Flowering.png`,
    ];
}

// Each plant only faces the real-world problems it actually struggles with
// (`hazards`), and its stage-3+ late phase is themed to its climate (`latePhase`:
// "winter" = cold/frost, "heat" = drought/heat season). See mechanics in tick().
const STARTER_PLANT = { id: "flower", name: "Flower",
    stages: [
        "flower/Seed.png",
        "flower/Sprout.png",
        "flower/Seedling.png",
        "flower/YoungPlant.png",
        "flower/OlderPlant.png",
        "flower/Budding.png",
        "flower/Flowering.png",
    ],
    deadImage: "flower/DeadPlant.png",
    hazards: ["heat", "rain", "pests"], latePhase: "winter", artScale: 0.82 };

// `artScale` shrinks the wide "bush" plants so they don't dwarf the thin
// "stalk" plants (sunflower/rose/secret keep the default 1). See .flower-scale.
const PLANT_POOL = [
    { id: "cactus", name: "Cactus", stages: plantStages("cactus"), deadImage: "flower/cactus/DeadPlant.png",
      desc: "Loves sun & heat, barely needs water. But overwatering rots its roots.",
      hazards: ["rain", "fungal"], latePhase: "heat", artScale: 0.85,
      modifiers: { waterDecayMult: 0.4, sunDecayMult: 1.6, fungalDrainMult: 1.5 } },
    { id: "sunflower", name: "Sunflower", stages: plantStages("sunflower"), deadImage: "flower/sunflower/DeadPlant.png",
      desc: "Fast bloom in full sun. Thirsty and top-heavy — storms knock it over.",
      hazards: ["heat", "drought", "wind", "pests"], latePhase: "heat",
      modifiers: { fertGenMult: 1.25, weatherIntensityMult: 1.4 } },
    { id: "orchid", name: "Orchid", stages: plantStages("orchid"), deadImage: "flower/orchid/DeadPlant.png",
      desc: "+50% score, but fussiest of all: narrow safe zone, rots or dries out easily.",
      hazards: ["fungal", "drought", "pests"], latePhase: "winter", artScale: 0.85,
      modifiers: { scoreMult: 1.5, safeZoneDelta: -8, eventChanceMult: 1.3 } },
    { id: "rose", name: "Rose", stages: plantStages("rose"), deadImage: "flower/rose/DeadPlant.png",
      desc: "Thorns cut pest damage in half, but black-spot fungus plagues it. Slow to bloom.",
      hazards: ["fungal", "pests", "rain"], latePhase: "winter",
      modifiers: { pestDrainMult: 0.5, fertThresholdDelta: 15 } },
];
// Off-tone finale — not "hardest," just wrong. Score payoff is the highest in
// the game, but growth feels unstable and the ambience turns unsettling.
// No dedicated art yet, so it reuses the starter flower's images/dead state.
const SECRET_PLANT = { id: "secret", name: "???", stages: plantStages("secret"), deadImage: "flower/secret/DeadPlant.png",
    hazards: ["heat", "rain", "pests", "drought", "fungal", "wind"], latePhase: "eldritch",
    modifiers: { scoreMult: 2.0 } };

let STAGES = STARTER_PLANT.stages;
let FINAL_STAGE = STAGES.length - 1;
let currentPlant = STARTER_PLANT;
let picksRemaining = 2; // starter + 2 picked plants (3 total) before the secret event
let grownPlantIds = new Set();
let sequenceComplete = false;

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function advanceStage() {
    if (growthStage < FINAL_STAGE) {
        growthStage += 1;
        fertilizer = 0;
        score += 500;
        const growAudio = document.getElementById("grow-audio");
        growAudio.currentTime = 0;
        growAudio.play();
    }
}

function showUpgradeMenu() {
    const available = Object.keys(upgrades).filter((k) => upgrades[k] < MAX_UPGRADE_LEVEL);
    shuffle(available);
    currentUpgradeChoices = available.slice(0, 3);
    clearAmbience();

    const cardIds = ["upgrade-option", "upgrade-option1", "upgrade-option2"];
    cardIds.forEach((cardId, i) => {
        const card = document.getElementById(cardId);
        if (i < currentUpgradeChoices.length) {
            const key = currentUpgradeChoices[i];
            const [name, desc] = UPGRADE_INFO[key];
            const level = upgrades[key];
            const stars = "★".repeat(level) + "☆".repeat(MAX_UPGRADE_LEVEL - level);
            card.innerHTML =
                `<h3 style="margin:0 0 4px 0;color:#000000;font-size:14px;">${name}</h3>` +
                `<div style="color:#654321;font-size:18px;margin-bottom:6px;">${stars}</div>` +
                `<p style="color:#000000;font-size:11px;margin:0 0 4px 0;text-align:center;">${desc}</p>` +
                `<p style="color:#ffffff;font-size:11px;margin:0 0 10px 0;">Level ${level} → ${level + 1}</p>` +
                `<button class="upgrade-button" id="upgrade-btn-${i}">Choose</button>`;
            card.style.display = "flex";
            card.style.flexDirection = "column";
            card.style.alignItems = "center";
            card.style.justifyContent = "center";
            card.style.padding = "10px";
            const btn = document.getElementById(`upgrade-btn-${i}`);
            btn.onclick = () => selectUpgrade(i);
        } else {
            card.innerHTML = "";
            card.style.display = "none";
        }
    });

    document.getElementById("upgrade-container").style.display = "block";
    mysteryMenu = true;
}

function selectUpgrade(index) {
    if (index < currentUpgradeChoices.length) {
        const key = currentUpgradeChoices[index];
        upgrades[key] = Math.min(upgrades[key] + 1, MAX_UPGRADE_LEVEL);
    }
    mysteryMenu = false;
    document.getElementById("upgrade-container").style.display = "none";
    startLoop();
}

// Push the current plant's per-plant size scale to the .flower-scale wrapper.
// Set the transform directly (this WebView doesn't re-resolve scale(var(...))
// when the custom property changes at runtime).
function applyArtScale() {
    const el = document.querySelector(".flower-scale");
    if (el) el.style.transform = `scale(${currentPlant.artScale ?? 1})`;
}

// Resets tending state and swaps in a new plant, without a full page reload —
// a lighter-weight version of onRestart() that keeps the plant sequence going.
function resetTendingState(plant) {
    currentPlant = plant;
    grownPlantIds.add(plant.id);
    STAGES = plant.stages;
    FINAL_STAGE = STAGES.length - 1;
    applyArtScale();

    water = 50;
    sunlight = 50;
    warmth = 50;
    fertilizer = 0;
    growthStage = 0;
    dead = false;
    entityRevealActive = false; // beginSecretPlant re-arms this right after, if it's the secret plant
    health = 100;
    heatWaveTicks = 0;
    rainstormTicks = 0;
    droughtTicks = 0;
    windTicks = 0;
    pestActive = false;
    fungalActive = false;
    warmthButtonShown = false;
    // Each new plant starts fresh — upgrades earned on the previous plant don't carry over.
    Object.keys(upgrades).forEach((k) => { upgrades[k] = 0; });

    document.body.classList.remove("winter", "heat-season", "eldritch", "eldritch-plant", "heat-wave", "rainstorm", "drought", "wind", "fungal", "spring", "health-active", "warmth-active", "plant-dead");
    resetEyeSettle(); // clear any death-settle inline styles so eyes wander afresh
    // The eldritch plant warps the whole scene for its entire growth (every entry path).
    if (plant.latePhase === "eldritch") document.body.classList.add("eldritch-plant");
    document.getElementById("controls-container").style.display = "";
    document.getElementById("health-row").style.display = "";
    document.getElementById("warmth-row").style.display = "";
    document.getElementById("warmth-btn").style.display = "";
    document.getElementById("warmth-btn").classList.remove("humidify-button", "eldritch-button");
    document.getElementById("drain-btn").style.display = "none";
    document.body.classList.remove("drain-active");
    document.getElementById("lore-btn").innerText = " ???"; // reset until this plant blooms
    document.getElementById("sun-btn").style.left = "";
    document.getElementById("water-btn").style.left = "";
    document.getElementById("flower-image").src = STAGES[0];

    startLoop();
    updateStatus();
}

function showPlantChoiceMenu() {
    const candidates = PLANT_POOL.filter((p) => !grownPlantIds.has(p.id));
    shuffle(candidates);
    const choices = candidates.slice(0, 2);
    clearAmbience();

    const round = 2 - picksRemaining + 1;
    document.getElementById("plant-choice-subtext").textContent = `Pick your next plant (choice ${round} of 2)`;

    const cardIds = ["plant-choice-option0", "plant-choice-option1"];
    cardIds.forEach((cardId, i) => {
        const card = document.getElementById(cardId);
        if (i < choices.length) {
            const plant = choices[i];
            card.innerHTML =
                `<h3 style="margin:0 0 4px 0;color:#000000;font-size:14px;">${plant.name}</h3>` +
                `<p style="color:#000000;font-size:11px;margin:0 0 10px 0;text-align:center;">${plant.desc}</p>` +
                `<button class="upgrade-button" id="plant-choice-btn-${i}">Choose</button>`;
            card.style.display = "flex";
            card.style.flexDirection = "column";
            card.style.alignItems = "center";
            card.style.justifyContent = "center";
            card.style.padding = "10px";
            const btn = document.getElementById(`plant-choice-btn-${i}`);
            btn.onclick = () => onChoosePlant(plant);
        } else {
            card.innerHTML = "";
            card.style.display = "none";
        }
    });

    document.getElementById("plant-choice-container").style.display = "block";
}

function onChoosePlant(plant) {
    picksRemaining -= 1;
    document.getElementById("plant-choice-container").style.display = "none";
    resetTendingState(plant);
    document.getElementById("status").innerHTML = `\u{1F331} A ${plant.name} seed has been planted!`;
}

function beginSecretPlant() {
    resetTendingState(SECRET_PLANT); // applies the .eldritch-plant ambience for us
    // Dark ambience: always on for the secret plant — the music button can't mute it.
    const ambience = document.getElementById("ambience-audio");
    ambience.volume = 0.5;
    ambience.currentTime = 0;
    ambience.play();
    // Unknown-creature music: the toggleable layer. The music button controls it (its src is
    // swapped in here); it only auto-starts if the player already had music playing.
    // NOTE: capture the playing state BEFORE swapping src — assigning .src resets the element
    // to paused, so checking musicAudio.paused after the swap would always be true.
    const musicAudio = document.getElementById("music-audio");
    const musicWasOn = !musicAudio.paused;
    musicAudio.src = "music and images/Unknown-creature-music.mp3";
    if (musicWasOn) {
        ambience.pause();
        musicAudio.volume = 0.8;
        musicAudio.currentTime = 0;
        musicAudio.play();
    }
    else {
        ambience.play();
    }
    document.getElementById("status").innerHTML = "ERROR: unknown_entity_appeared";
    // Let the entity linger: freeze the decay loop so the message + eldritch reveal
    // hold for a few seconds before tending begins, instead of flashing by in one tick.
    entityRevealActive = true;
    setTimeout(() => { entityRevealActive = false; }, 4500);
}

// After an (intermediate) bloom, show Keep Playing / Restart buttons inline below
// the bloomed flower, rather than jumping straight into the next-plant choice.
function showWinContinue() {
    document.getElementById("win-continue-container").style.display = "flex";
}

function continueAfterWin() {
    document.getElementById("win-continue-container").style.display = "none";
    if (picksRemaining > 0) {
        showPlantChoiceMenu();
    } else {
        document.getElementById("status").innerHTML = "Something else has taken root...";
        beginSecretPlant();
    }
}

function getBarColor(value, defaultColor) {
    if (value >= 75 || value <= 25) {
        return "#ff7867";
    } else if (value >= 60 || value <= 40) {
        return "#fff569";
    }
    return defaultColor;
}

function updateStatus() {
    if (FINAL_STAGE === growthStage || mysteryMenu || menuOpen) {
        return;
    }
    updateScoreDisplay();
    const [safeMin, safeMax] = safeZone();
    const safeBands = document.querySelectorAll(".fertilizer-safe-zone");
    for (let i = 0; i < safeBands.length; i++) {
        const band = safeBands.item(i);
        band.style.left = `${safeMin}%`;
        band.style.width = `${safeMax - safeMin}%`;
    }
    const flowerImage = document.getElementById("flower-image");
    const waterBar = document.getElementById("water-bar");
    const sunBar = document.getElementById("sun-bar");
    const healthRow = document.getElementById("health-row");
    const warmthBar = document.getElementById("warmth-bar");

    waterBar.style.backgroundColor = getBarColor(water, "#6cf38e");
    sunBar.style.backgroundColor = getBarColor(sunlight, "#6cf38e");
    warmthBar.style.backgroundColor = getBarColor(warmth, "#6cf38e");
    warmthBar.style.width = `${warmth}%`;
    waterBar.style.width = `${water}%`;
    sunBar.style.width = `${sunlight}%`;
    const healthBar = document.getElementById("health-bar");
    healthBar.style.width = `${health}%`;

    if (pestActive && sunlight >= 70) {
        healthRow.style.display = "none";
        pestActive = false;
        document.body.classList.remove("health-active");
    }
    // Root rot is cured by drying the soil out (mirror of the pest cure above).
    if (fungalActive && water <= 30) {
        healthRow.style.display = "none";
        fungalActive = false;
        document.body.classList.remove("health-active", "fungal");
    }
    // The Drain button is only offered while root rot is active.
    document.getElementById("drain-btn").style.display = fungalActive ? "block" : "none";
    document.body.classList.toggle("drain-active", fungalActive); // lays Drain beside Fertilizer
    const statusEl = document.getElementById("status");
    if (heatWaveTicks > 0) {
        statusEl.innerHTML = `\u{1F321}️ Heat wave! (${heatWaveTicks}s remaining)`;
    } else if (health === 0 && !debugGodMode) {
        dead = true;
        clearSave(); // the run is over — don't restore a dead plant on next launch
        saveHighScore();
        flowerImage.src = currentPlant.deadImage;
        statusEl.innerHTML = `Plant has died due to poor health❤️. Score: ${finalScore()} (Best: ${getBestScore()}). Restart to try again.`;
    } else if (pestActive && !dead) {
        statusEl.innerHTML = "Pests are active\u{1F41B}! Add sunlight to burn them off.";
    } else if (fungalActive && !dead) {
        statusEl.innerHTML = "\u{1F344} Root rot! Tap Drain to dry out the soil.";
    } else if (windTicks > 0) {
        statusEl.innerHTML = "\u{1F4A8} Strong winds battering your plant!";
    } else if (droughtTicks > 0) {
        statusEl.innerHTML = `\u{2600}\u{FE0F} Drought! (${droughtTicks}s remaining) Keep watering.`;
    } else if (rainstormTicks > 0) {
        statusEl.innerHTML = `\u{1F327}️ Rainstorm! (${rainstormTicks}s remaining)`;
    } else if (fertilizer >= fertThreshold() && (water >= safeMin && water <= safeMax) && (sunlight >= safeMin && sunlight <= safeMax)) {
        statusEl.innerHTML = "Fertilizer at safe levels✅";
    } else if (fertilizer >= fertThreshold() && (water <= safeMin || water >= safeMax || sunlight <= safeMin || sunlight >= safeMax)) {
        statusEl.innerHTML = "Fertillizer ready, but other conditions are not optimal❌";
    } else {
        statusEl.innerHTML = "Fertilizer is at unsafe levels❌";
    }
    // The late-phase ambience (snow for winter, shimmer for heat, dread for eldritch) is
    // this plant's phase class; every other phase class must never linger.
    const phaseClass = latePhase().bodyClass;
    PHASE_CLASSES.filter((c) => c !== phaseClass).forEach((c) => document.body.classList.remove(c));
    const weatherActive = heatWaveTicks > 0 || rainstormTicks > 0 || droughtTicks > 0 || windTicks > 0;
    document.body.classList.toggle("heat-wave", heatWaveTicks > 0);
    document.body.classList.toggle("rainstorm", rainstormTicks > 0);
    document.body.classList.toggle("drought", droughtTicks > 0);
    document.body.classList.toggle("wind", windTicks > 0);
    document.body.classList.toggle("fungal", fungalActive);
    // The eldritch phase's ambience (dread pulse on the rims + purple eyes) is meant
    // to be constant — reality-thinning shouldn't blink off when a weather event
    // fires. Keep it through weather; other phases (winter snow, heat shimmer) still
    // yield to the weather overlay as before.
    const keepThroughWeather = currentPlant.latePhase === "eldritch";
    if (growthStage >= 3 && (!weatherActive || keepThroughWeather)) {
        document.body.classList.add(phaseClass);
    } else {
        document.body.classList.remove(phaseClass);
    }

    const dm = settings.death_margin ?? 20; // meters die at <=dm or >=100-dm (wider buffer on zen)
    const dmHi = 100 - dm;
    if (!debugGodMode && (water <= dm || sunlight <= dm || water >= dmHi || sunlight >= dmHi || (warmth <= dm || warmth >= dmHi))) {
        let ring = document.querySelector(".fertilizer-notification");
        ring.style = " filter: blur(10px) opacity(0);";
        // Ease the watching eyes to a dead centre stare (once), while they're still
        // mid-wander — capture must happen before the CSS freeze snaps them.
        if (!eyesSettled && document.body.classList.contains("eldritch-plant")) {
            settleEyesToCentre();
            eyesSettled = true;
        }
        dead = true;
        clearSave(); // the run is over — don't restore a dead plant on next launch
        saveHighScore();
        flowerImage.src = currentPlant.deadImage;
        document.body.classList.remove("heat-wave", "rainstorm", "winter", "heat-season", "drought", "wind", "fungal");
        // When the 4th (late-phase) meter is the culprit, name the climate cause.
        const phaseKilled = growthStage >= 3 && (warmth <= dm || warmth >= dmHi) &&
            water > dm && water < dmHi && sunlight > dm && sunlight < dmHi;
        // The secret (eldritch) plant gets its own death flavour instead of the
        // generic line — a random pool entry, with a themed "Begin again." prompt.
        const isSecret = currentPlant.latePhase === "eldritch";
        const cause = phaseKilled ? latePhase().deathMsg : "Plant has died";
        statusEl.innerHTML = isSecret
            ? `${pickMsg(SECRET_DEATH_MSGS)} Score: ${finalScore()} (Best: ${getBestScore()}). Begin again.`
            : `${cause}. Score: ${finalScore()} (Best: ${getBestScore()}). Restart to try again.`;
        if (growthStage === 0) {
            flowerImage.src = STAGES[0];
            statusEl.innerHTML = isSecret
                ? `${pickMsg(SECRET_GERMINATE_FAIL_MSGS)} Score: ${finalScore()} (Best: ${getBestScore()}). Begin again.`
                : `Plant has failed to germinate. Score: ${finalScore()} (Best: ${getBestScore()})`;
        }
    } else {
        flowerImage.src = STAGES[growthStage];
    }

    const ring = document.querySelector(".fertilizer-notification");
    if (fertilizer >= fertThreshold() && (water >= safeMin && water <= safeMax) && (sunlight >= safeMin && sunlight <= safeMax) && !(rainstormTicks > 0 || heatWaveTicks > 0 || droughtTicks > 0 || windTicks > 0 || pestActive || fungalActive)) {
        ring.style = " filter: blur(0px) opacity(1);";
    } else {
        ring.style = " filter: blur(10px) opacity(0);";
    }

    // Death drains the scene of purpose: the watching eyes freeze and go grey, and
    // the whole world starts to glitch (all handled in CSS off this one class).
    document.body.classList.toggle("plant-dead", dead);
}

function onWater() {
    if (dead) return;
    water = Math.min(water + 5, 100);
    fertilizer = Math.min(fertilizer + 1, 100);
    updateStatus();
}

function onSunlight() {
    if (dead) return;
    sunlight = Math.min(sunlight + 5, 100);
    fertilizer = Math.min(fertilizer + 1, 100);
    updateStatus();
}

// Drain excess water to dry out the soil — the active cure for root rot.
function onDrain() {
    if (dead) return;
    water = Math.max(water - 5, 0);
    updateStatus();
}

function onFertilizer() {
    if (dead) return;
    const loreBtn = document.getElementById("lore-btn");
    const control = document.getElementById("controls-container");
    const ring = document.querySelector(".fertilizer-notification");
    const threshold = fertThreshold();
    const [safeMin, safeMax] = safeZone();
    if (fertilizer >= threshold && (water >= safeMin && water <= safeMax) && (sunlight >= safeMin && sunlight <= safeMax)) {
        advanceStage();
        ring.style = " filter: blur(10px) opacity(0);";
        if (growthStage === FINAL_STAGE) {
            // The secret plant's off-tone finale gets its own glitchy bloom sound
            // instead of the cheerful winning sound every other plant uses.
            const bloomAudio = document.getElementById(
                currentPlant === SECRET_PLANT ? "secret-win-audio" : "win-audio"
            );
            bloomAudio.currentTime = 0;
            bloomAudio.play();
            bloomAudio.volume = 0.5;
            clearSave(); // bloomed — this run's tending is finished, don't restore it
            clearAmbience();
            document.body.classList.add("spring");
            control.style.display = "none";
            document.getElementById("drain-btn").style.display = "none";
            document.body.classList.remove("drain-active");
            document.getElementById("flower-image").src = STAGES[FINAL_STAGE];
            // No celebratory confetti for the secret plant — its bloom is an off-tone,
            // unsettling finale, not a victory.
            if (currentPlant !== SECRET_PLANT) launchConfetti();
            // The ??? menu button becomes usable at any bloom — label it to match.
            loreBtn.innerText = "Touch the flower";

            if (currentPlant === SECRET_PLANT) {
                saveHighScore();
                sequenceComplete = true;
                document.getElementById("status").innerHTML = `Error:👁you_have_won! or_did_we?👁 Score: ${finalScore()} (Best: ${getBestScore()})`;
            } else {
                // Intermediate bloom: pause on a Keep Playing / Restart screen instead of
                // jumping straight into the next-plant choice.
                document.getElementById("status").innerHTML = `\u{1F338} Your ${currentPlant.name} has fully bloomed!`;
                showWinContinue();
            }
        } else {
            updateStatus();
            showUpgradeMenu();
        }
    } else {
        water = Math.max(water - 50, 0);
        sunlight = Math.max(sunlight - 50, 0);
        updateStatus();
    }
}

function onWarmth() {
    if (dead) return;
    warmth = Math.min(warmth + 5, 100);
    updateStatus();
}

function onMainMenu() {
    const menuContainer = document.getElementById("menu-container");
    if (menuOpen) {
        menuContainer.style.display = "none";
        menuOpen = false;
    } else {
        clearAmbience();
        menuOpen = true;
        menuContainer.style.display = "block";
    }
}

function onRestart() {
    clearSave(); // start fresh — drop any in-progress save so reload shows difficulty select
    clearAmbience();
    document.location.reload();
}

function onLore() {
    const menuContainer = document.getElementById("menu-container");
    const flowerImage = document.getElementById("flower");
    // Works at any bloomed flower (final stage), not only the secret finale.
    if (growthStage === FINAL_STAGE) {
        const growAudio = document.getElementById("grow-audio");
        growAudio.currentTime = 0;
        growAudio.play();
        const darkAudio = document.getElementById("dark-audio");
        darkAudio.currentTime = 0;
        darkAudio.playbackRate = 2;
        darkAudio.play();
        document.getElementById("status").innerHTML = "Error Code: Unknown";
        document.body.classList.remove("spring", "eldritch", "eldritch-plant");
        document.body.classList.add("lore-mode");
        glitchTitle();
        menuContainer.style.display = "none";
        menuOpen = false;
        // Let the lore take over the screen — hide the bloom Keep Playing / Restart buttons.
        document.getElementById("win-continue-container").style.display = "none";
        const springs = document.getElementById("spring1");
        const springs2 = document.getElementById("spring2");
        flowerImage.innerHTML = "<p class='spinning-gear'>⚙</p>";
        springs.style.display = "block";
        springs2.style.display = "block";
    }
}

// --- Main decay loop ---------------------------------------------------------
// Original used `while True: await asyncio.sleep(1)`. Here we self-schedule a
// tick every second via setTimeout, stopping (not rescheduling) when the
// original loop would `break`.
let loopTimer = null;

function startLoop() {
    if (loopTimer !== null) return; // avoid running two loops at once
    loopTimer = setTimeout(tick, debugTickMs);
}

// Reveal the stage-3+ late-phase UI (the 4th meter, its button, split the water/sun
// buttons). Shared by the tick (when a plant first reaches stage 3) and by restore
// (when reloading straight into a stage-3+ plant).
function applyLatePhaseUI() {
    const phase = latePhase();
    document.getElementById("sun-btn").style.left = "15%";
    document.getElementById("water-btn").style.left = "85%";
    const warmthBtn = document.getElementById("warmth-btn");
    warmthBtn.style.display = "block";
    warmthBtn.textContent = phase.btnLabel;
    warmthBtn.classList.remove("humidify-button", "eldritch-button");
    if (phase.btnClass) warmthBtn.classList.add(phase.btnClass);
    const warmthLabel = document.querySelector("#warmth-row .meter-label");
    if (warmthLabel) warmthLabel.innerHTML = phase.meterLabel;
    document.getElementById("warmth-row").style.display = "flex";
    warmthButtonShown = true;
    document.body.classList.add("warmth-active");
}

function tick() {
    loopTimer = null;
    if (tutorialActive) {
        loopTimer = setTimeout(tick, debugTickMs); // paused for a tutorial/tip: skip decay, keep polling
        return;
    }
    if (entityRevealActive) {
        loopTimer = setTimeout(tick, debugTickMs); // hold the entity reveal: freeze decay, keep the message
        return;
    }
    if (document.hidden) {
        // App backgrounded / screen off: freeze decay, weather and score; keep polling
        // so play resumes exactly where it left off when the player returns.
        loopTimer = setTimeout(tick, debugTickMs);
        return;
    }

    if (growthStage === 3 && warmthButtonShown === false && !mysteryMenu) {
        applyLatePhaseUI();
        maybeShowTip("warmth", "#warmth-btn", latePhase().tip);
    }
    if (dead || growthStage === FINAL_STAGE || mysteryMenu) {
        return; // break: do not reschedule
    }
    if (menuOpen) {
        loopTimer = setTimeout(tick, debugTickMs); // continue
        return;
    }
    const eventChance = settings.event_chance * mod("eventChanceMult", 1);
    const eventBusy = pestActive || fungalActive || heatWaveTicks > 0 || rainstormTicks > 0 || droughtTicks > 0 || windTicks > 0;
    // One event at a time, and only the real-world hazards this plant is vulnerable to.
    if (!eventBusy && growthStage > 0) {
        if (hasHazard("pests") && Math.random() < eventChance) {
            healthRow.style.display = "flex";
            pestActive = true;
            document.body.classList.add("health-active");
            maybeShowTip("pests", "#health-row", "Pests have appeared! They slowly drain your plant's Health bar. Push Sunlight above the safe zone to burn them off before Health runs out.");
        } else if (hasHazard("fungal") && Math.random() < eventChance) {
            healthRow.style.display = "flex";
            fungalActive = true;
            document.body.classList.add("health-active");
            maybeShowTip("fungal", "#health-row", "Root rot! Damp soil is breeding fungus that drains Health. Tap the Drain button to dry the soil out and stop the rot.");
        } else if (hasHazard("rain") && Math.random() < eventChance) {
            rainstormTicks = settings.weather_duration;
            maybeShowTip("weather", "#status", "Weather swings your meters fast — keep an eye on the status and rebalance to stay safe.");
        } else if (hasHazard("heat") && Math.random() < eventChance) {
            heatWaveTicks = settings.weather_duration;
            maybeShowTip("weather", "#status", "Weather swings your meters fast — keep an eye on the status and rebalance to stay safe.");
        } else if (hasHazard("drought") && Math.random() < eventChance) {
            droughtTicks = settings.weather_duration;
            maybeShowTip("drought", "#status", "Drought! The soil is drying out fast - keep tapping Water to survive.");
        } else if (hasHazard("wind") && Math.random() < eventChance) {
            windTicks = 3;
            // A gust immediately knocks the meters around; top-heavy late-stage plants also take some damage.
            water = Math.max(water - (8 + Math.random() * 10), 0);
            sunlight = Math.max(sunlight - (8 + Math.random() * 10), 0);
            if (growthStage >= 3) health = Math.max(health - settings.pest_drain, 0);
            maybeShowTip("wind", "#status", "Strong winds batter your plant and knock its meters around!");
        }
    }
    if (water >= 70) {
        sunlight = Math.max(sunlight - 3, 0);
    }
    if (sunlight >= 70) {
        water = Math.max(water - 3, 0);
    }
    if (pestActive) {
        health = Math.max(health - settings.pest_drain * mod("pestDrainMult", 1), 0);
    }
    // Root rot only bites while the soil stays damp; drying it out is the cure (see updateStatus).
    if (fungalActive && water >= 50) {
        health = Math.max(health - settings.pest_drain * mod("fungalDrainMult", 1), 0);
    }
    const weatherIntensity = Math.max(settings.weather_intensity - upgrades.weather, 1) * mod("weatherIntensityMult", 1);
    if (heatWaveTicks > 0) {
        sunlight = Math.min(sunlight + weatherIntensity, 100);
        water = Math.max(water - weatherIntensity, 0);
        heatWaveTicks -= 1;
        if (growthStage >= 3) {
            // 4th meter reacts to climate: a winter cold-snap warms up; a heat-season plant dries out.
            if (currentPlant.latePhase === "heat") {
                warmth = Math.max(warmth - weatherIntensity, 0);
            } else {
                warmth = Math.min(warmth + weatherIntensity, 100);
            }
        }
    }
    const baseDecay = Math.max(settings.decay - upgrades.decay * 0.5, 0.25);
    const waterDecay = baseDecay * mod("waterDecayMult", 1);
    const sunDecay = baseDecay * mod("sunDecayMult", 1);
    const warmthDecay = baseDecay * mod("warmthDecayMult", 1);
    if (growthStage >= 3) {
        warmth = Math.max(warmth - warmthDecay, 0);
    }
    if (rainstormTicks > 0) {
        water = Math.min(water + weatherIntensity, 100);
        sunlight = Math.min(sunlight - weatherIntensity, 100);
        rainstormTicks -= 1;
    }
    if (droughtTicks > 0) {
        // A dry spell pulls extra water out of the soil on top of the normal decay below.
        water = Math.max(water - weatherIntensity, 0);
        droughtTicks -= 1;
    }
    if (windTicks > 0) {
        windTicks -= 1;
    }
    water = Math.max(water - waterDecay, 0);
    if (growthStage < FINAL_STAGE) {
        fertilizer = Math.min(fertilizer + (settings.fert_gen + upgrades.fertilizer) * mod("fertGenMult", 1), 100);
    }
    sunlight = Math.max(sunlight - sunDecay, 0);
    score += 1;
    const [sMin, sMax] = safeZone();
    let metersOk = sMin <= water && water <= sMax && sMin <= sunlight && sunlight <= sMax;
    if (growthStage >= 3) {
        metersOk = metersOk && sMin <= warmth && warmth <= sMax;
    }
    if (metersOk) {
        score += 5;
    }
    updateStatus();
    saveGame(); // persist progress each tick so leaving/closing the app keeps it
    loopTimer = setTimeout(tick, debugTickMs);
}

function startGame(level) {
    settings = DIFFICULTIES[level];
    currentDifficulty = level;
    gameStarted = true;
    document.getElementById("difficulty-container").style.display = "none";
    applyArtScale(); // size the starter flower (other plants set theirs on switch)
    startLoop();
    if (typeof hasTutorialSeen === "function" && !hasTutorialSeen()) {
        startIntroTutorial();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("water-btn").addEventListener("click", onWater);
    document.getElementById("sun-btn").addEventListener("click", onSunlight);
    document.getElementById("fertilizer-btn").addEventListener("click", onFertilizer);
    document.getElementById("warmth-btn").addEventListener("click", onWarmth);
    document.getElementById("drain-btn").addEventListener("click", onDrain);
    document.getElementById("main-menu-btn").addEventListener("click", onMainMenu);
    document.getElementById("restart-btn").addEventListener("click", onRestart);
    document.getElementById("keep-playing-btn").addEventListener("click", continueAfterWin);
    document.getElementById("restart-game-btn").addEventListener("click", onRestart);
    document.getElementById("start-over-btn").addEventListener("click", onRestart);
    document.getElementById("lore-btn").addEventListener("click", onLore);
    document.getElementById("zen-btn").addEventListener("click", () => startGame("zen"));
    document.getElementById("easy-btn").addEventListener("click", () => startGame("easy"));
    document.getElementById("medium-btn").addEventListener("click", () => startGame("medium"));
    document.getElementById("hard-btn").addEventListener("click", () => startGame("hard"));

    // Persist progress the moment the app is backgrounded / the screen turns off, and
    // again as the page unloads — so it survives the OS killing the app.
    document.addEventListener("visibilitychange", () => { if (document.hidden) saveGame(); });
    window.addEventListener("pagehide", saveGame);

    // If a game was in progress last time, pick up exactly where it left off.
    restoreSavedGame();
});
