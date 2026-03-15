// Coffee Brewer PWA - Application Logic

// ── Constants ──────────────────────────────────────────────

const METHODS = {
    clever: {
        name: 'Clever Dripper',
        defaultGrind: 19,
        steps: [
            { label: 'Rinse paper filter with hot water', duration: 0 },
            { label: 'Add hot water first (just off boil, ~30s after)', duration: 0 },
            { label: 'Add coffee grounds', duration: 0 },
            { label: 'Stir gently once', duration: 0 },
            { label: 'Put lid on and steep', duration: 180 },
            { label: 'Place on cup/carafe and let it drain', duration: 0 }
        ]
    },
    french: {
        name: 'French Press',
        defaultGrind: 27,
        steps: [
            { label: 'Add coffee grounds to press', duration: 0 },
            { label: 'Pour in all the water', duration: 0 },
            { label: 'Stir gently, then wait', duration: 240 },
            { label: 'Break the crust with a spoon, scoop off foam', duration: 0 },
            { label: 'Wait quietly (do not press yet)', duration: 360 },
            { label: 'Press gently and pour immediately', duration: 0 }
        ]
    },
    aromaboy: {
        name: 'Aromaboy',
        defaultGrind: 21,
        steps: [
            { label: 'Add filter paper and rinse with water', duration: 0 },
            { label: 'Add coffee grounds to filter', duration: 0 },
            { label: 'Add water to reservoir', duration: 0 },
            { label: 'Turn on and wait for brew to complete', duration: 0 }
        ]
    }
};

const SERVINGS = [
    { people: 1, coffee: 18, water: 300 },
    { people: 2, coffee: 36, water: 600 },
    { people: 3, coffee: 54, water: 900 }
];

const STORAGE_HISTORY = 'coffee-brewer-history';
const STORAGE_BASELINES = 'coffee-brewer-grind-baselines';

// ── State ──────────────────────────────────────────────────

let currentBrew = {
    method: null,
    people: null,
    stepIndex: 0,
    timerInterval: null,
    timerEnd: null,
    audioCtx: null
};

// ── Init ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initServiceWorker();
    initNavigation();
    initBrewFlow();
    initHistory();
    initSettings();
});

function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js');
    }
}

// ── Navigation ─────────────────────────────────────────────

function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('page-' + btn.dataset.page).classList.add('active');

            if (btn.dataset.page === 'history') renderHistory();
            if (btn.dataset.page === 'settings') renderSettings();
        });
    });
}

// ── Brew Flow ──────────────────────────────────────────────

function initBrewFlow() {
    // Method selection
    document.querySelectorAll('.method-card').forEach(card => {
        card.addEventListener('click', () => selectMethod(card.dataset.method));
    });

    // People selection
    document.querySelectorAll('.people-card').forEach(card => {
        card.addEventListener('click', () => selectPeople(parseInt(card.dataset.people)));
    });

    // Back buttons
    document.getElementById('back-to-method').addEventListener('click', () => showBrewStep('brew-method'));
    document.getElementById('back-to-people').addEventListener('click', () => showBrewStep('brew-people'));

    // Start brewing
    document.getElementById('start-brewing').addEventListener('click', startBrewing);

    // Timer controls
    document.getElementById('timer-next-btn').addEventListener('click', nextTimerStep);
    document.getElementById('timer-skip-btn').addEventListener('click', skipTimer);

    // Taste feedback
    document.querySelectorAll('.taste-card').forEach(card => {
        card.addEventListener('click', () => recordTaste(card.dataset.taste));
    });

    // Finish
    document.getElementById('finish-brew').addEventListener('click', () => {
        showBrewStep('brew-method');
    });
}

function showBrewStep(stepId) {
    clearTimer();
    document.querySelectorAll('.brew-step').forEach(s => s.classList.remove('active'));
    document.getElementById(stepId).classList.add('active');
}

function selectMethod(methodId) {
    currentBrew.method = methodId;
    const method = METHODS[methodId];
    document.getElementById('people-method-name').textContent = method.name;
    showBrewStep('brew-people');
}

function selectPeople(count) {
    currentBrew.people = count;
    const method = METHODS[currentBrew.method];
    const serving = SERVINGS.find(s => s.people === count);
    const grind = getGrindBaseline(currentBrew.method);

    document.getElementById('recipe-method-name').textContent = method.name;
    document.getElementById('recipe-grind').textContent = grind;
    document.getElementById('recipe-coffee').textContent = serving.coffee + 'g';
    document.getElementById('recipe-water').textContent = serving.water + 'ml';

    const stepsList = document.getElementById('recipe-steps-list');
    stepsList.innerHTML = method.steps.map(s => {
        const time = s.duration > 0 ? ' (' + formatTime(s.duration) + ')' : '';
        return '<li>' + s.label + time + '</li>';
    }).join('');

    showBrewStep('brew-recipe');
}

function startBrewing() {
    // Unlock audio context on user gesture (iOS requirement)
    if (!currentBrew.audioCtx) {
        try {
            currentBrew.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            currentBrew.audioCtx.resume();
        } catch (e) { /* Audio not supported */ }
    }

    currentBrew.stepIndex = 0;
    renderTimerProgress();
    runStep();
}

function runStep() {
    const method = METHODS[currentBrew.method];
    const step = method.steps[currentBrew.stepIndex];

    document.getElementById('timer-step-label').textContent = step.label;
    renderTimerProgress();

    const nextBtn = document.getElementById('timer-next-btn');
    const skipBtn = document.getElementById('timer-skip-btn');
    const display = document.getElementById('timer-display');

    if (step.duration > 0) {
        // Timed step
        display.textContent = formatTime(step.duration);
        display.classList.remove('done');
        nextBtn.style.display = 'none';
        skipBtn.style.display = 'block';
        showBrewStep('brew-timer');
        startCountdown(step.duration);
    } else {
        // Manual step - show with "Next" button
        display.textContent = '--:--';
        display.classList.remove('done');
        nextBtn.textContent = isLastStep() ? 'Done' : 'Next Step';
        nextBtn.style.display = 'block';
        skipBtn.style.display = 'none';
        showBrewStep('brew-timer');
    }
}

function startCountdown(seconds) {
    clearTimer();
    currentBrew.timerEnd = Date.now() + seconds * 1000;

    const display = document.getElementById('timer-display');
    const nextBtn = document.getElementById('timer-next-btn');
    const skipBtn = document.getElementById('timer-skip-btn');

    currentBrew.timerInterval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((currentBrew.timerEnd - Date.now()) / 1000));
        display.textContent = formatTime(remaining);

        if (remaining <= 0) {
            clearTimer();
            display.textContent = '0:00';
            display.classList.add('done');
            playBeep();
            tryVibrate();
            nextBtn.textContent = isLastStep() ? 'Done' : 'Next Step';
            nextBtn.style.display = 'block';
            skipBtn.style.display = 'none';
        }
    }, 250); // Update 4x/sec for smooth display
}

function nextTimerStep() {
    clearTimer();
    if (isLastStep()) {
        showBrewStep('brew-feedback');
    } else {
        currentBrew.stepIndex++;
        runStep();
    }
}

function skipTimer() {
    clearTimer();
    nextTimerStep();
}

function isLastStep() {
    const method = METHODS[currentBrew.method];
    return currentBrew.stepIndex >= method.steps.length - 1;
}

function clearTimer() {
    if (currentBrew.timerInterval) {
        clearInterval(currentBrew.timerInterval);
        currentBrew.timerInterval = null;
    }
}

function renderTimerProgress() {
    const method = METHODS[currentBrew.method];
    const container = document.getElementById('timer-progress');
    container.innerHTML = method.steps.map((_, i) => {
        let cls = 'dot';
        if (i < currentBrew.stepIndex) cls += ' completed';
        else if (i === currentBrew.stepIndex) cls += ' current';
        return '<span class="' + cls + '"></span>';
    }).join('');
}

// ── Taste Feedback ─────────────────────────────────────────

function recordTaste(taste) {
    const method = METHODS[currentBrew.method];
    const serving = SERVINGS.find(s => s.people === currentBrew.people);
    const grind = getGrindBaseline(currentBrew.method);
    const advice = getAdjustmentAdvice(taste);

    // Save to history
    const entry = {
        id: Date.now().toString(),
        date: new Date().toISOString().split('T')[0],
        method: currentBrew.method,
        methodName: method.name,
        people: currentBrew.people,
        grindSetting: grind,
        coffeeGrams: serving.coffee,
        waterMl: serving.water,
        taste: taste,
        grindAdjustment: advice.direction
    };
    saveToHistory(entry);

    // Update grind baseline
    let resultMessage = '';
    if (advice.direction !== 0) {
        const newGrind = grind + advice.direction;
        setGrindBaseline(currentBrew.method, newGrind);
        resultMessage = 'Grind adjusted: ' + grind + ' \u2192 ' + newGrind;
    } else {
        resultMessage = 'Grind stays at ' + grind + ' \u2014 nice!';
    }

    // Show result
    const icons = { sour: '\u26A0\uFE0F', balanced: '\u2705', bitter: '\u26A0\uFE0F' };
    document.getElementById('result-icon').textContent = icons[taste] || '\u2705';
    document.getElementById('result-title').textContent = 'Brew Saved!';
    document.getElementById('result-message').textContent = resultMessage;
    document.getElementById('result-advice').textContent = advice.message;
    showBrewStep('brew-result');
}

function getAdjustmentAdvice(taste) {
    switch (taste) {
        case 'sour':
            return { direction: -1, message: 'Under-extracted. Try one click finer (lower number) next time.' };
        case 'bitter':
            return { direction: 1, message: 'Over-extracted. Try one click coarser (higher number) next time.' };
        default:
            return { direction: 0, message: 'Perfect extraction! Keep this grind setting.' };
    }
}

// ── Timer Utilities ────────────────────────────────────────

function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
}

function playBeep() {
    try {
        const ctx = currentBrew.audioCtx;
        if (!ctx) return;
        // Play 3 short beeps
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.value = 0.3;
            const start = ctx.currentTime + i * 0.25;
            osc.start(start);
            osc.stop(start + 0.15);
        }
    } catch (e) { /* Audio not supported */ }
}

function tryVibrate() {
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }
}

// ── Grind Baselines ────────────────────────────────────────

function getGrindBaselines() {
    try {
        const stored = localStorage.getItem(STORAGE_BASELINES);
        if (stored) return JSON.parse(stored);
    } catch (e) { /* ignore */ }
    return getDefaultBaselines();
}

function getDefaultBaselines() {
    const baselines = {};
    for (const [id, method] of Object.entries(METHODS)) {
        baselines[id] = method.defaultGrind;
    }
    return baselines;
}

function saveGrindBaselines(baselines) {
    localStorage.setItem(STORAGE_BASELINES, JSON.stringify(baselines));
}

function getGrindBaseline(methodId) {
    return getGrindBaselines()[methodId] || METHODS[methodId].defaultGrind;
}

function setGrindBaseline(methodId, value) {
    const baselines = getGrindBaselines();
    baselines[methodId] = value;
    saveGrindBaselines(baselines);
}

// ── History ────────────────────────────────────────────────

function getHistory() {
    try {
        const stored = localStorage.getItem(STORAGE_HISTORY);
        if (stored) return JSON.parse(stored);
    } catch (e) { /* ignore */ }
    return [];
}

function saveToHistory(entry) {
    const history = getHistory();
    history.unshift(entry);
    // Keep last 50 entries
    if (history.length > 50) history.length = 50;
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
}

function initHistory() {
    document.getElementById('clear-history').addEventListener('click', () => {
        if (confirm('Clear all brew history?')) {
            localStorage.removeItem(STORAGE_HISTORY);
            renderHistory();
        }
    });
}

function renderHistory() {
    const history = getHistory();
    const container = document.getElementById('history-list');
    const clearBtn = document.getElementById('clear-history');

    if (history.length === 0) {
        container.innerHTML = '<p class="empty-state">No brews yet. Go make some coffee!</p>';
        clearBtn.style.display = 'none';
        return;
    }

    clearBtn.style.display = 'block';

    const tasteLabels = { sour: 'Sour', balanced: 'Balanced', bitter: 'Bitter' };

    container.innerHTML = history.slice(0, 20).map(entry => {
        const tasteClass = entry.taste || 'balanced';
        const tasteLabel = tasteLabels[entry.taste] || entry.taste;
        return '<div class="history-card">' +
            '<div class="history-info">' +
                '<span class="history-method">' + (entry.methodName || entry.method) + '</span>' +
                '<span class="history-detail">' + entry.date + ' &middot; ' +
                    entry.people + 'p &middot; Grind ' + entry.grindSetting + ' &middot; ' +
                    entry.coffeeGrams + 'g / ' + entry.waterMl + 'ml</span>' +
            '</div>' +
            '<span class="history-taste ' + tasteClass + '">' + tasteLabel + '</span>' +
        '</div>';
    }).join('');
}

// ── Settings ───────────────────────────────────────────────

function initSettings() {
    document.getElementById('reset-baselines').addEventListener('click', () => {
        if (confirm('Reset all grind settings to defaults?')) {
            saveGrindBaselines(getDefaultBaselines());
            renderSettings();
        }
    });
}

function renderSettings() {
    const baselines = getGrindBaselines();
    const container = document.getElementById('settings-list');

    container.innerHTML = Object.entries(METHODS).map(([id, method]) => {
        const value = baselines[id] || method.defaultGrind;
        const defaultVal = method.defaultGrind;
        const changed = value !== defaultVal ? ' (default: ' + defaultVal + ')' : '';
        return '<div class="settings-card">' +
            '<div>' +
                '<div class="settings-method">' + method.name + '</div>' +
                '<div style="font-size:12px;color:var(--text-muted)">' + changed + '</div>' +
            '</div>' +
            '<div class="settings-control">' +
                '<button onclick="adjustGrindSetting(\'' + id + '\', -1)">&minus;</button>' +
                '<span class="settings-value" id="grind-' + id + '">' + value + '</span>' +
                '<button onclick="adjustGrindSetting(\'' + id + '\', 1)">+</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

function adjustGrindSetting(methodId, delta) {
    const baselines = getGrindBaselines();
    const current = baselines[methodId] || METHODS[methodId].defaultGrind;
    const newVal = Math.max(1, Math.min(40, current + delta));
    baselines[methodId] = newVal;
    saveGrindBaselines(baselines);
    document.getElementById('grind-' + methodId).textContent = newVal;
    renderSettings(); // Re-render to update "default" label
}
