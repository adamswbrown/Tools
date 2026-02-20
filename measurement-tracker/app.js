const STORAGE_KEY = 'measurement-tracker-url';
const QUEUE_KEY = 'measurement-tracker-queue';
const HISTORY_KEY = 'measurement-tracker-history';

// Google Apps Script code to embed in settings instructions
const APPS_SCRIPT_CODE = `function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  sheet.appendRow([
    data.timestamp,
    data.name,
    data.date,
    data.leftArm,
    data.rightArm,
    data.waist,
    data.leftLeg,
    data.rightLeg,
    data.chest,
    data.hips
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

document.addEventListener('DOMContentLoaded', () => {
    initDate();
    initServiceWorker();
    initNavigation();
    initSettings();
    checkOfflineQueue();
    renderAppsScript();

    document.getElementById('measurement-form').addEventListener('submit', handleSubmit);
});

// --- Navigation ---
function initNavigation() {
    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${page}`).classList.add('active');

            if (page === 'history') renderHistory();
        });
    });
}

// --- Date ---
function initDate() {
    const dateInput = document.getElementById('date');
    dateInput.value = new Date().toISOString().split('T')[0];
}

// --- Service Worker ---
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

// --- Settings ---
function initSettings() {
    const url = localStorage.getItem(STORAGE_KEY);
    const urlInput = document.getElementById('script-url');
    if (url) {
        urlInput.value = url;
        updateConnectionBadge(true);
    }

    document.getElementById('save-url-btn').addEventListener('click', handleSaveUrl);
    document.getElementById('test-url-btn').addEventListener('click', handleTestUrl);
    document.getElementById('clear-url-btn').addEventListener('click', handleClearUrl);
    document.getElementById('copy-script-btn').addEventListener('click', handleCopyScript);
    document.getElementById('clear-history-btn').addEventListener('click', handleClearHistory);
}

function handleSaveUrl() {
    const input = document.getElementById('script-url');
    const url = input.value.trim();
    if (!url) return;

    localStorage.setItem(STORAGE_KEY, url);
    updateConnectionBadge(true);
    showSettingsStatus('Connection saved!', 'success');
    syncOfflineQueue();
}

function handleTestUrl() {
    const url = localStorage.getItem(STORAGE_KEY);
    if (!url) {
        showSettingsStatus('Save a URL first.', 'error');
        return;
    }

    const btn = document.getElementById('test-url-btn');
    btn.disabled = true;
    btn.textContent = 'Testing...';

    fetch(url, { method: 'GET', mode: 'no-cors' })
        .then(() => {
            showSettingsStatus('Request sent. If your script is set up correctly, it should be working.', 'success');
        })
        .catch(() => {
            showSettingsStatus('Could not reach the URL. Check that it is correct.', 'error');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = 'Test Connection';
        });
}

function handleClearUrl() {
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById('script-url').value = '';
    updateConnectionBadge(false);
    showSettingsStatus('Disconnected.', 'error');
}

function handleCopyScript() {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE).then(() => {
        const btn = document.getElementById('copy-script-btn');
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 2000);
    }).catch(() => {
        // Fallback: select the code block text
        const code = document.getElementById('apps-script-code');
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    });
}

function handleClearHistory() {
    if (confirm('Clear all local measurement history?')) {
        localStorage.removeItem(HISTORY_KEY);
        renderHistory();
    }
}

function updateConnectionBadge(connected) {
    const badge = document.getElementById('connection-status');
    if (connected) {
        badge.textContent = 'Connected';
        badge.className = 'connection-badge connected';
    } else {
        badge.textContent = 'Not connected';
        badge.className = 'connection-badge disconnected';
    }
}

function showSettingsStatus(message, type) {
    // Reuse the main status element logic but create a temporary one for settings
    const existing = document.querySelector('.settings-status');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = `status ${type} settings-status`;
    el.textContent = message;
    el.style.marginTop = '12px';
    document.querySelector('.settings-card .settings-actions').after(el);
    setTimeout(() => { el.remove(); }, 4000);
}

function renderAppsScript() {
    document.getElementById('apps-script-code').textContent = APPS_SCRIPT_CODE;
}

// --- Form Submission ---
async function handleSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const btn = document.getElementById('submit-btn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoading = btn.querySelector('.btn-loading');

    const data = {
        timestamp: new Date().toISOString(),
        name: form.name.value.trim(),
        date: form.date.value,
        leftArm: parseFloat(form.leftArm.value),
        rightArm: parseFloat(form.rightArm.value),
        waist: parseFloat(form.waist.value),
        leftLeg: parseFloat(form.leftLeg.value),
        rightLeg: parseFloat(form.rightLeg.value),
        chest: parseFloat(form.chest.value),
        hips: parseFloat(form.hips.value)
    };

    btn.disabled = true;
    btnText.hidden = true;
    btnLoading.hidden = false;

    const scriptUrl = localStorage.getItem(STORAGE_KEY);

    if (!scriptUrl || !navigator.onLine) {
        queueOffline(data);
        saveToHistory(data);
        showStatus('Saved offline. Will sync when connected.', 'error');
        resetForm(form, btn, btnText, btnLoading);
        return;
    }

    try {
        await sendToSheet(scriptUrl, data);
        saveToHistory(data);
        showStatus('Measurements saved!', 'success');
        form.reset();
        initDate();
    } catch (err) {
        queueOffline(data);
        saveToHistory(data);
        showStatus('Failed to send. Saved offline for retry.', 'error');
    }

    resetForm(form, btn, btnText, btnLoading);
}

async function sendToSheet(url, data) {
    const response = await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return response;
}

function resetForm(form, btn, btnText, btnLoading) {
    btn.disabled = false;
    btnText.hidden = false;
    btnLoading.hidden = true;
}

function showStatus(message, type) {
    const el = document.getElementById('status');
    el.textContent = message;
    el.className = `status ${type}`;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 4000);
}

// --- Local History ---
function getHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
        return [];
    }
}

function saveToHistory(data) {
    const history = getHistory();
    history.unshift(data);
    // Keep only last 50 entries
    if (history.length > 50) history.length = 50;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function renderHistory() {
    const list = document.getElementById('history-list');
    const history = getHistory();

    if (history.length === 0) {
        list.innerHTML = '<p class="empty-state">No measurements recorded yet.</p>';
        return;
    }

    list.innerHTML = history.slice(0, 20).map(entry => `
        <div class="history-item">
            <div class="history-item-header">
                <span class="history-item-name">${escapeHtml(entry.name)}</span>
                <span class="history-item-date">${entry.date}</span>
            </div>
            <div class="history-item-measurements">
                <span>L.Arm: <strong>${entry.leftArm}"</strong></span>
                <span>R.Arm: <strong>${entry.rightArm}"</strong></span>
                <span>Waist: <strong>${entry.waist}"</strong></span>
                <span>L.Leg: <strong>${entry.leftLeg}"</strong></span>
                <span>R.Leg: <strong>${entry.rightLeg}"</strong></span>
                <span>Chest: <strong>${entry.chest}"</strong></span>
                <span>Hips: <strong>${entry.hips}"</strong></span>
            </div>
        </div>
    `).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- Offline Queue ---
function getQueue() {
    try {
        return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
    } catch {
        return [];
    }
}

function queueOffline(data) {
    const queue = getQueue();
    queue.push(data);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    updateQueueUI();
}

function updateQueueUI() {
    const queue = getQueue();
    const el = document.getElementById('offline-queue');
    const count = document.getElementById('queue-count');
    if (queue.length > 0) {
        el.hidden = false;
        count.textContent = queue.length;
    } else {
        el.hidden = true;
    }
}

function checkOfflineQueue() {
    updateQueueUI();
    if (navigator.onLine) {
        syncOfflineQueue();
    }
}

async function syncOfflineQueue() {
    const url = localStorage.getItem(STORAGE_KEY);
    if (!url) return;

    const queue = getQueue();
    if (queue.length === 0) return;

    const remaining = [];
    for (const data of queue) {
        try {
            await sendToSheet(url, data);
        } catch {
            remaining.push(data);
        }
    }

    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    updateQueueUI();

    if (remaining.length === 0 && queue.length > 0) {
        showStatus(`Synced ${queue.length} offline measurement(s)!`, 'success');
    }
}

window.addEventListener('online', syncOfflineQueue);
