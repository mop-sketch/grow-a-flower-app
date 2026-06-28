// tutorial.js — interactive guided tour + one-time contextual tips.
// Loaded after game.js on index.html. Every entry point guards on the presence
// of the game buttons, so this is a harmless no-op on other pages (e.g. the
// shared scripts also load on "learn more.html").
//
// `tutorialActive` lives in game.js and pauses the decay loop while any tour or
// tip is on screen, so the plant can't die mid-lesson. Classic scripts share a
// global scope here (game.js already calls launchConfetti() from script.js), so
// these functions and that flag are reachable across files without exports.

const TUTORIAL_SEEN_KEY = "growAFlowerTutorialSeen";

function hasTutorialSeen() {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === "true";
}
function markTutorialSeen() {
    localStorage.setItem(TUTORIAL_SEEN_KEY, "true");
}
function tutorialTipSeen(name) {
    return localStorage.getItem("growAFlowerTip_" + name) === "true";
}
function markTutorialTipSeen(name) {
    localStorage.setItem("growAFlowerTip_" + name, "true");
}

// Intro tour steps. target: CSS selector to spotlight, or null for a centered
// message. advance: "next" (button) or "click" (player taps the spotlighted
// control to continue).
const INTRO_STEPS = [
    { target: null, text: "Welcome! Let's grow your first flower. 🌱", advance: "next" },
    { target: "#flower", text: "This is your seed. Care for it and it'll grow through the stages.", advance: "next" },
    { target: "#water-btn", text: "Tap Water to hydrate your plant.", advance: "click" },
    { target: "#sun-btn", text: "Now tap Sunlight to give it light.", advance: "click" },
    { target: ".meters", text: "Keep Water and Sunlight inside the grey Safe Zone band on these bars.", advance: "next" },
    { target: ".meters", text: "But never let a meter get too low or too high — that kills your plant!", advance: "next" },
    { target: "#fertilizer-btn", text: "Watering and sunlight slowly fill Fertilizer. When it's full and your meters are in the grey Safe Zone, tap Fertilizer to grow to the next  stage.", advance: "next" },
    { target: null, text: "Each time you grow you'll pick an upgrade. Reach full bloom to win. Good luck! 🌸", advance: "next" }
];

let tutorialStepIndex = 0;
let tutorialMode = null;          // "intro" | "tip" | null
let tutorialCurrentTarget = null; // selector currently spotlighted (for resize)

// Lazily build the overlay (hole + tip bubble) once and cache it on the page.
function ensureTutorialDom() {
    let overlay = document.getElementById("tutorial-overlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "tutorial-overlay";
    overlay.className = "tutorial-overlay";
    overlay.style.display = "none";
    overlay.innerHTML =
        '<div class="tutorial-hole" id="tutorial-hole"></div>' +
        '<div class="tutorial-tip" id="tutorial-tip">' +
            '<p class="tutorial-text" id="tutorial-text"></p>' +
            '<div class="tutorial-actions">' +
                '<button class="tutorial-skip" id="tutorial-skip" type="button">Skip</button>' +
                '<button class="tutorial-next menu-button" id="tutorial-next" type="button">Next</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);
    document.getElementById("tutorial-skip").addEventListener("click", endTutorial);
    document.getElementById("tutorial-next").addEventListener("click", nextStep);
    return overlay;
}

// Position the spotlight cutout + tip bubble around a target (or centered).
function positionTutorial(targetSelector) {
    const overlay = document.getElementById("tutorial-overlay");
    const hole = document.getElementById("tutorial-hole");
    const tip = document.getElementById("tutorial-tip");
    const target = targetSelector ? document.querySelector(targetSelector) : null;
    if (target) {
        const r = target.getBoundingClientRect();
        const pad = 8;
        overlay.style.background = "transparent"; // dimming comes from the hole's box-shadow
        hole.style.display = "block";
        hole.style.top = (r.top - pad) + "px";
        hole.style.left = (r.left - pad) + "px";
        hole.style.width = (r.width + pad * 2) + "px";
        hole.style.height = (r.height + pad * 2) + "px";
        tip.style.left = "50%";
        tip.style.transform = "translateX(-50%)";
        tip.style.bottom = "auto";
        // Place the bubble on whichever side of the spotlight has room for its
        // full height, so it never covers the element it's describing.
        const ih = window.innerHeight;
        const gap = 16;
        const tipH = tip.offsetHeight; // layout height, unaffected by transforms
        const spaceBelow = ih - (r.bottom + pad);
        const spaceAbove = r.top - pad;
        let top;
        if (spaceBelow >= tipH + gap) {
            top = r.bottom + pad + gap;
        } else if (spaceAbove >= tipH + gap) {
            top = r.top - pad - gap - tipH;
        } else {
            top = (spaceAbove > spaceBelow) ? 8 : (ih - tipH - 8); // no room: best effort
        }
        tip.style.top = Math.max(8, Math.min(top, ih - tipH - 8)) + "px";
    } else {
        overlay.style.background = "rgba(0, 0, 0, 0.6)"; // no spotlight -> dim the overlay itself
        hole.style.display = "none";
        tip.style.left = "50%";
        tip.style.top = "50%";
        tip.style.bottom = "auto";
        tip.style.transform = "translate(-50%, -50%)";
    }
}

// Position now, then re-measure after layout settles. Some reveals (e.g. the
// Warmth button at stage 3) add a body class that animates buttons into new
// positions/sizes over ~0.3s; a single measurement would leave the spotlight on
// the pre-animation spot. The hole has its own short transition, so the later
// re-positions glide it onto the final target.
function positionTutorialSettled(targetSelector) {
    positionTutorial(targetSelector);
    requestAnimationFrame(function () { positionTutorial(targetSelector); });
    setTimeout(function () {
        if (tutorialActive && tutorialCurrentTarget === targetSelector) {
            positionTutorial(targetSelector);
        }
    }, 360);
}

function showStep(i) {
    const step = INTRO_STEPS[i];
    if (!step) { endTutorial(); return; }
    tutorialStepIndex = i;
    tutorialCurrentTarget = step.target;
    const hole = document.getElementById("tutorial-hole");
    const nextBtn = document.getElementById("tutorial-next");
    document.getElementById("tutorial-text").textContent = step.text;
    positionTutorialSettled(step.target);
    hole.onclick = null;
    const targetEl = step.target ? document.querySelector(step.target) : null;
    if (step.advance === "click" && targetEl) {
        // Player advances by tapping the spotlighted control. Forwarding the
        // click to the real button keeps its normal effect (water rises, etc.).
        nextBtn.style.display = "none";
        hole.style.pointerEvents = "auto";
        hole.style.cursor = "pointer";
        hole.onclick = function () { targetEl.click(); nextStep(); };
    } else {
        hole.style.pointerEvents = "none";
        hole.style.cursor = "";
        nextBtn.style.display = "";
        nextBtn.textContent = (i === INTRO_STEPS.length - 1) ? "Done" : "Next";
    }
}

function nextStep() {
    if (tutorialMode === "tip") { endTutorial(); return; }
    if (tutorialStepIndex + 1 >= INTRO_STEPS.length) {
        endTutorial();
    } else {
        showStep(tutorialStepIndex + 1);
    }
}

function startIntroTutorial() {
    if (!document.getElementById("water-btn")) return; // not the game page
    ensureTutorialDom();
    tutorialMode = "intro";
    tutorialActive = true; // pause decay (declared in game.js)
    document.getElementById("tutorial-overlay").style.display = "block";
    document.getElementById("tutorial-skip").style.display = "";
    showStep(0);
}

// One-time contextual tip shown when a new mechanic first appears mid-game.
function maybeShowTip(name, targetSelector, text) {
    if (!document.getElementById("water-btn")) return;
    if (tutorialActive) return;        // don't stack over an active tour/tip
    if (tutorialTipSeen(name)) return; // shown once ever
    markTutorialTipSeen(name);
    ensureTutorialDom();
    tutorialMode = "tip";
    tutorialCurrentTarget = targetSelector;
    tutorialActive = true;
    document.getElementById("tutorial-overlay").style.display = "block";
    const hole = document.getElementById("tutorial-hole");
    hole.onclick = null;
    hole.style.pointerEvents = "none";
    document.getElementById("tutorial-skip").style.display = "none";
    const nextBtn = document.getElementById("tutorial-next");
    nextBtn.style.display = "";
    nextBtn.textContent = "Got it";
    document.getElementById("tutorial-text").textContent = text;
    positionTutorialSettled(targetSelector);
}

function endTutorial() {
    const overlay = document.getElementById("tutorial-overlay");
    if (overlay) overlay.style.display = "none";
    const hole = document.getElementById("tutorial-hole");
    if (hole) hole.onclick = null;
    const wasIntro = (tutorialMode === "intro");
    tutorialMode = null;
    tutorialCurrentTarget = null;
    tutorialActive = false;
    if (wasIntro) markTutorialSeen();
    // Resume / ensure the game loop is running (no-op if already alive).
    if (typeof startLoop === "function") startLoop();
}

// Replay from the main menu without resetting game progress.
function startTutorialFromMenu() {
    menuOpen = false; // declared in game.js
    const mc = document.getElementById("menu-container");
    if (mc) mc.style.display = "none";
    startIntroTutorial();
}

document.addEventListener("DOMContentLoaded", function () {
    const btn = document.getElementById("how-to-play-btn");
    if (btn) btn.addEventListener("click", startTutorialFromMenu);
    window.addEventListener("resize", function () {
        if (tutorialActive) positionTutorial(tutorialCurrentTarget);
    });
});
