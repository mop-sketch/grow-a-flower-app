// Grow a Flower — game logic.
// Ported from the original PyScript main.py to plain JavaScript so the game
// runs with no Python runtime (small, instant, offline-friendly).

const HIGH_SCORE_KEY = "growAFlowerBest";

let water = 50;
let fertilizer = 0;
let sunlight = 50;
let growthStage = 0;
let dead = false;
let heatWaveTicks = 0;
let rainstormTicks = 0;
let health = 100;
let pestActive = false;
let warmthButtonShown = false;
let warmth = 50;
let mysteryMenu = false;
let menuOpen = false;
let score = 0;
let scoreSaved = false;

const upgrades = { decay: 0, fertilizer: 0, safe_zone: 0, weather: 0 };
let currentUpgradeChoices = [];

// Difficulty presets. "easy" matches the original tuning.
// "medium" is overall harsher. "hard" is the same as medium except plants
// take longer to advance through each stage (slower fertilizer, higher thresholds).
const DIFFICULTIES = {
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
    },
};
// Active tuning. Replaced when the player picks a difficulty; defaults to easy.
let settings = DIFFICULTIES.easy;

function fertThreshold() {
    return growthStage === 0 ? settings.fert_threshold_start : settings.fert_threshold;
}

function safeZone() {
    const safeMin = Math.max(35 - upgrades.safe_zone * 5, 20);
    const safeMax = Math.min(65 + upgrades.safe_zone * 5, 80);
    return [safeMin, safeMax];
}

function finalScore() {
    return Math.round(score * settings.score_mult);
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

const UPGRADE_INFO = {
    decay: ["Slow Decay", "Water, sunlight & warmth decay −0.5/tick per level"],
    fertilizer: ["Boost Fertilizer", "Fertilizer generation +1/tick per level"],
    safe_zone: ["Widen Safe Zone", "Fertilizer safe zone expands 5% per level"],
    weather: ["Weather Shield", "Heat wave & rainstorm intensity −1/tick per level"],
};
const MAX_UPGRADE_LEVEL = 3;

const STAGES = [
    "flower/Seed.png",
    "flower/Sprout.png",
    "flower/Seedling.png",
    "flower/YoungPlant.png",
    "flower/OlderPlant.png",
    "flower/Budding.png",
    "flower/Flowering.png",
];
const FINAL_STAGE = STAGES.length - 1;

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
    document.body.classList.remove("winter", "heat-wave", "rainstorm");

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
    const statusEl = document.getElementById("status");
    if (heatWaveTicks > 0) {
        statusEl.innerHTML = `\u{1F321}️ Heat wave! (${heatWaveTicks}s remaining)`;
    } else if (health === 0) {
        dead = true;
        saveHighScore();
        flowerImage.src = "flower/DeadPlant.png";
        statusEl.innerHTML = `Plant has died due to poor health❤️. Score: ${finalScore()} (Best: ${getBestScore()}). Restart to try again.`;
    } else if (pestActive && !dead) {
        statusEl.innerHTML = "Pests are active\u{1F41B}! Add sunlight to burn them off.";
    } else if (rainstormTicks > 0) {
        statusEl.innerHTML = `\u{1F327}️ Rainstorm! (${rainstormTicks}s remaining)`;
    } else if (fertilizer >= fertThreshold() && (water >= safeMin && water <= safeMax) && (sunlight >= safeMin && sunlight <= safeMax)) {
        statusEl.innerHTML = "Fertilizer at safe levels✅";
    } else if (fertilizer >= fertThreshold() && (water <= safeMin || water >= safeMax || sunlight <= safeMin || sunlight >= safeMax)) {
        statusEl.innerHTML = "Fertillizer ready, but other conditions are not optimal❌";
    } else {
        statusEl.innerHTML = "Fertilizer is at unsafe levels❌";
    }
    if (heatWaveTicks > 0) {
        document.body.classList.remove("winter");
        document.body.classList.add("heat-wave");
    } else {
        document.body.classList.remove("heat-wave");
    }
    if (rainstormTicks > 0) {
        document.body.classList.remove("winter");
        document.body.classList.add("rainstorm");
    } else {
        document.body.classList.remove("rainstorm");
    }
    if (growthStage >= 3) {
        if (heatWaveTicks === 0 && rainstormTicks === 0) {
            document.body.classList.add("winter");
        }
    } else {
        document.body.classList.remove("winter");
    }

    if (water <= 20 || sunlight <= 20 || water >= 80 || sunlight >= 80 || (warmth <= 20 || warmth >= 80)) {
        let ring = document.querySelector(".fertilizer-notification");
        ring.style = " filter: blur(10px) opacity(0);";
        dead = true;
        saveHighScore();
        flowerImage.src = "flower/DeadPlant.png";
        document.body.classList.remove("heat-wave", "rainstorm", "winter");
        statusEl.innerHTML = `Plant has died. Score: ${finalScore()} (Best: ${getBestScore()}). Restart to try again.`;
        if (growthStage === 0) {
            flowerImage.src = STAGES[0];
            statusEl.innerHTML = `Plant has failed to germinate. Score: ${finalScore()} (Best: ${getBestScore()})`;
        }
    } else {
        flowerImage.src = STAGES[growthStage];
    }

    const ring = document.querySelector(".fertilizer-notification");
    if (fertilizer >= fertThreshold() && (water >= safeMin && water <= safeMax) && (sunlight >= safeMin && sunlight <= safeMax) && !(rainstormTicks > 0 || heatWaveTicks > 0 || pestActive)) {
        ring.style = " filter: blur(0px) opacity(1);";
    } else {
        ring.style = " filter: blur(10px) opacity(0);";
    }
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
            loreBtn.innerText = "Touch the flower";
            const winAudio = document.getElementById("win-audio");
            winAudio.currentTime = 0;
            winAudio.play();
            document.body.classList.remove("winter", "heat-wave", "rainstorm");
            document.body.classList.add("spring");
            control.style.display = "none";
            document.getElementById("flower-image").src = STAGES[FINAL_STAGE];
            saveHighScore();
            document.getElementById("status").innerHTML = `\u{1F338} Your flower has fully bloomed! You win! Score: ${finalScore()} (Best: ${getBestScore()})`;
            launchConfetti();
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
        document.body.classList.remove("winter", "heat-wave", "rainstorm");
        menuOpen = true;
        menuContainer.style.display = "block";
    }
}

function onRestart() {
    document.body.classList.remove("winter", "heat-wave", "rainstorm");
    document.location.reload();
}

function onLore() {
    const menuContainer = document.getElementById("menu-container");
    const flowerImage = document.getElementById("flower");
    if (growthStage === FINAL_STAGE) {
        const growAudio = document.getElementById("grow-audio");
        growAudio.currentTime = 0;
        growAudio.play();
        const darkAudio = document.getElementById("dark-audio");
        darkAudio.currentTime = 0;
        darkAudio.playbackRate = 2;
        darkAudio.play();
        document.getElementById("status").innerHTML = "Error Code: Unknown";
        document.body.classList.remove("spring");
        document.body.classList.add("lore-mode");
        glitchTitle();
        menuContainer.style.display = "none";
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
    loopTimer = setTimeout(tick, 1000);
}

function tick() {
    loopTimer = null;
    const healthRow = document.getElementById("health-row");
    const sunBtn = document.getElementById("sun-btn");
    const waterBtn = document.getElementById("water-btn");
    const warmthBtn = document.getElementById("warmth-btn");
    const warmthRow = document.getElementById("warmth-row");

    if (growthStage === 3 && warmthButtonShown === false) {
        sunBtn.style.left = "15%";
        waterBtn.style.left = "85%";
        warmthBtn.style.display = "block";
        warmthRow.style.display = "flex";
        warmthButtonShown = true;
        document.body.classList.add("warmth-active");
    }
    if (dead || growthStage === FINAL_STAGE || mysteryMenu) {
        return; // break: do not reschedule
    }
    if (menuOpen) {
        loopTimer = setTimeout(tick, 1000); // continue
        return;
    }
    if (!pestActive && Math.random() < settings.event_chance && heatWaveTicks === 0 && rainstormTicks === 0 && growthStage > 0) {
        healthRow.style.display = "flex";
        pestActive = true;
        document.body.classList.add("health-active");
    }
    if (rainstormTicks === 0 && Math.random() < settings.event_chance && heatWaveTicks === 0 && !pestActive) {
        rainstormTicks = settings.weather_duration;
    }
    if (heatWaveTicks === 0 && Math.random() < settings.event_chance && rainstormTicks === 0 && !pestActive) {
        heatWaveTicks = settings.weather_duration;
    }
    if (water >= 70) {
        sunlight = Math.max(sunlight - 3, 0);
    }
    if (sunlight >= 70) {
        water = Math.max(water - 3, 0);
    }
    if (pestActive) {
        health = Math.max(health - settings.pest_drain, 0);
    }
    const weatherIntensity = Math.max(settings.weather_intensity - upgrades.weather, 1);
    if (heatWaveTicks > 0) {
        sunlight = Math.min(sunlight + weatherIntensity, 100);
        water = Math.max(water - weatherIntensity, 0);
        heatWaveTicks -= 1;
        if (growthStage >= 3) {
            warmth = Math.min(warmth + weatherIntensity, 100);
        }
    }
    const decay = Math.max(settings.decay - upgrades.decay * 0.5, 0.25);
    if (growthStage >= 3) {
        warmth = Math.max(warmth - decay, 0);
    }
    if (rainstormTicks > 0) {
        water = Math.min(water + weatherIntensity, 100);
        sunlight = Math.min(sunlight - weatherIntensity, 100);
        rainstormTicks -= 1;
    }
    water = Math.max(water - decay, 0);
    if (growthStage < FINAL_STAGE) {
        fertilizer = Math.min(fertilizer + settings.fert_gen + upgrades.fertilizer, 100);
    }
    sunlight = Math.max(sunlight - decay, 0);
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
    loopTimer = setTimeout(tick, 1000);
}

function startGame(level) {
    settings = DIFFICULTIES[level];
    document.getElementById("difficulty-container").style.display = "none";
    startLoop();
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("water-btn").addEventListener("click", onWater);
    document.getElementById("sun-btn").addEventListener("click", onSunlight);
    document.getElementById("fertilizer-btn").addEventListener("click", onFertilizer);
    document.getElementById("warmth-btn").addEventListener("click", onWarmth);
    document.getElementById("main-menu-btn").addEventListener("click", onMainMenu);
    document.getElementById("restart-btn").addEventListener("click", onRestart);
    document.getElementById("lore-btn").addEventListener("click", onLore);
    document.getElementById("easy-btn").addEventListener("click", () => startGame("easy"));
    document.getElementById("medium-btn").addEventListener("click", () => startGame("medium"));
    document.getElementById("hard-btn").addEventListener("click", () => startGame("hard"));
});
