/**
 * editor.js — UI State Management and DOM Rendering
 *
 * Manages all application state (in-memory + localStorage persistence) and
 * renders the stage tabs and the step-column table for the active stage.
 * Each user interaction immediately updates state and persists to localStorage.
 *
 * Depends on: schema.js (must be loaded first)
 * Consumed by: exporter.js (reads `state` via window.getEditorState())
 */

// ─── State ───────────────────────────────────────────────────────────────────

/** Live application state — loaded from localStorage or freshly initialised */
let state = (function () {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return createInitialState();
})();

/** Expose state to exporter.js */
window.getEditorState = () => state;

/** Persists current state to localStorage */
function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('btn-export').addEventListener('click', function () {
        window.showExportModal();
    });
    document.getElementById('btn-reset-all').addEventListener('click', function () {
        if (!confirm('Clear ALL entered data for all stages?')) return;
        localStorage.removeItem(STORAGE_KEY);
        state = createInitialState();
        renderTabs();
        renderStage();
    });
    renderTabs();
    renderStage();
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function renderTabs() {
    const nav = document.getElementById('stage-tabs');
    nav.innerHTML = '';
    STAGES.forEach(function (s) {
        const btn = document.createElement('button');
        btn.className = 'tab-btn' + (s.id === state.activeStageId ? ' active' : '');
        btn.innerHTML = '<span class="tab-emoji">' + s.emoji + '</span>' +
                        '<span class="tab-label">' + s.label + '</span>';
        btn.addEventListener('click', function () {
            state.activeStageId = s.id;
            save();
            renderTabs();
            renderStage();
        });
        nav.appendChild(btn);
    });
}

// ─── Stage Table ─────────────────────────────────────────────────────────────

function renderStage() {
    const stageId  = state.activeStageId;
    const stage    = STAGES.find(function (s) { return s.id === stageId; });
    const steps    = state.stages[stageId].steps;
    const main     = document.getElementById('stage-content');
    main.innerHTML = '';

    /* Stage title */
    const title = document.createElement('div');
    title.className = 'stage-title';
    title.innerHTML = '<span>' + stage.emoji + '</span><span>' + stage.label + ' Stage</span>';
    main.appendChild(title);

    /* Horizontal scroll wrapper */
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll-wrap';
    main.appendChild(wrap);

    const table = document.createElement('table');
    table.className = 'step-table';
    wrap.appendChild(table);

    /* ── thead ── */
    const thead = table.createTHead();
    const hr = thead.insertRow();
    addTH(hr, 'Field', 'th-field');
    steps.forEach(function (_, i) {
        const th = document.createElement('th');
        th.className = 'th-step';
        th.innerHTML =
            '<div class="step-hdr">' +
            '  <span>Click #' + (i + 1) + '</span>' +
            (steps.length > 1
                ? '<button class="btn-rm" onclick="removeStep(' + i + ')" title="Remove">×</button>'
                : '') +
            '</div>';
        hr.appendChild(th);
    });

    /* ── tbody ── */
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    addInputRow(tbody, steps, stageId, 'CTA Label',        'ctaLabel',        'text', '▶ Start / Next ›');
    addSelectRow(tbody, steps, stageId, 'Demo Screen',      'slideImageUrl',   SLIDES);
    addSelectRow(tbody, steps, stageId, 'Media Instruction','mediaInstruction', MEDIA_INSTRUCTIONS);
    addSelectRow(tbody, steps, stageId, 'Scenario',         'scenarioCode',    SCENARIOS);
    addNumberRow(tbody, steps, stageId, 'Delay (ms)',  'delayMs');
    addTextareaRow(tbody, steps, stageId, 'Screen Text', 'screenText',
                   'Text shown on the demo screen surface');
    addTextareaRow(tbody, steps, stageId, 'ARIA Local',  'ariaLocal',
                   'Scripted bubble — injected locally, no API call');
    addTextareaRow(tbody, steps, stageId, 'ARIA API',    'ariaApi',
                   'Prompt sent to CWF — ARIA generates a dynamic reply');
    addCheckRow(tbody, steps, stageId, 'ARIA Input',    'ariaInputEnabled',
                'Allow user to type questions');

    /* Panel Actions section */
    addSectionHead(tbody, 'Panel Actions', steps.length);
    PANELS.forEach(function (panel) {
        addPanelRow(tbody, steps, stageId, panel);
    });

    /* Simulation section */
    addSectionHead(tbody, 'Simulation', steps.length);
    addSelectRow(tbody, steps, stageId, 'Sim Action', 'simulationAction', SIMULATION_ACTIONS);
    addSelectRow(tbody, steps, stageId, 'Transition To', 'transitionTo', TRANSITIONS);

    /* Add Step button */
    if (steps.length < MAX_STEPS) {
        const tr = tbody.insertRow();
        tr.className = 'tr-add';
        const td = tr.insertCell();
        td.colSpan = steps.length + 1;
        const btn = document.createElement('button');
        btn.className = 'btn-add-step';
        btn.textContent = '+ Add Click Step';
        btn.addEventListener('click', addStep);
        td.appendChild(btn);
    }
}

// ─── Row Builders ─────────────────────────────────────────────────────────────

function addTH(row, text, cls) {
    const th = document.createElement('th');
    th.className = cls || '';
    th.textContent = text;
    row.appendChild(th);
}

function labelCell(label, desc) {
    const td = document.createElement('td');
    td.className = 'td-label';
    td.innerHTML = '<span class="fn">' + label + '</span>' +
                   (desc ? '<span class="fd">' + desc + '</span>' : '');
    return td;
}

function addInputRow(tbody, steps, stageId, label, field, type, placeholder) {
    const tr = tbody.insertRow();
    tr.appendChild(labelCell(label));
    steps.forEach(function (step, i) {
        const td = tr.insertCell();
        td.className = 'td-cell';
        const el = document.createElement('input');
        el.type = type || 'text';
        el.className = 'c-input';
        el.value = step[field] || '';
        el.placeholder = placeholder || '';
        el.addEventListener('input', function () {
            state.stages[stageId].steps[i][field] = el.value;
            save();
        });
        td.appendChild(el);
    });
}

function addNumberRow(tbody, steps, stageId, label, field) {
    const tr = tbody.insertRow();
    tr.appendChild(labelCell(label));
    steps.forEach(function (step, i) {
        const td = tr.insertCell();
        td.className = 'td-cell';
        const el = document.createElement('input');
        el.type = 'number'; el.className = 'c-input c-number';
        el.value = step[field] !== '' ? step[field] : '';
        el.placeholder = '—'; el.min = 0; el.max = 30000; el.step = 500;
        el.addEventListener('input', function () {
            state.stages[stageId].steps[i][field] = el.value.trim() === '' ? '' : parseInt(el.value, 10);
            save();
        });
        td.appendChild(el);
    });
}

function addSelectRow(tbody, steps, stageId, label, field, options) {
    const tr = tbody.insertRow();
    tr.appendChild(labelCell(label));
    steps.forEach(function (step, i) {
        const td = tr.insertCell();
        td.className = 'td-cell';
        const sel = document.createElement('select');
        sel.className = 'c-select';
        options.forEach(function (opt) {
            const o = document.createElement('option');
            o.value = opt.id || '';
            o.textContent = opt.label;
            if ((step[field] || '') === (opt.id || '')) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener('change', function () {
            state.stages[stageId].steps[i][field] = sel.value;
            save();
        });
        td.appendChild(sel);
    });
}

function addTextareaRow(tbody, steps, stageId, label, field, desc) {
    const tr = tbody.insertRow();
    tr.appendChild(labelCell(label, desc));
    steps.forEach(function (step, i) {
        const td = tr.insertCell();
        td.className = 'td-cell';
        const ta = document.createElement('textarea');
        ta.className = 'c-textarea'; ta.rows = 3; ta.placeholder = '—';
        ta.value = step[field] || '';
        ta.addEventListener('input', function () {
            state.stages[stageId].steps[i][field] = ta.value;
            save();
        });
        td.appendChild(ta);
    });
}

function addCheckRow(tbody, steps, stageId, label, field, desc) {
    const tr = tbody.insertRow();
    tr.appendChild(labelCell(label, desc));
    steps.forEach(function (step, i) {
        const td = tr.insertCell();
        td.className = 'td-cell';
        const lbl = document.createElement('label');
        lbl.className = 'c-check-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = !!step[field];
        const span = document.createElement('span');
        span.textContent = cb.checked ? 'Yes' : 'No';
        cb.addEventListener('change', function () {
            state.stages[stageId].steps[i][field] = cb.checked;
            span.textContent = cb.checked ? 'Yes' : 'No';
            save();
        });
        lbl.appendChild(cb); lbl.appendChild(span);
        td.appendChild(lbl);
    });
}

function addSectionHead(tbody, text, colCount) {
    const tr = tbody.insertRow();
    tr.className = 'tr-sec-head';
    const td = tr.insertCell();
    td.colSpan = colCount + 1;
    td.textContent = text;
}

function addPanelRow(tbody, steps, stageId, panel) {
    const tr = tbody.insertRow();
    tr.className = 'tr-panel';
    const lbl = document.createElement('td');
    lbl.className = 'td-label td-panel-lbl';
    lbl.textContent = panel.label;
    tr.appendChild(lbl);
    steps.forEach(function (step, i) {
        const td = tr.insertCell();
        td.className = 'td-cell';
        const grp = document.createElement('div');
        grp.className = 'radio-grp';
        [['open','Open','r-open'], ['close','Close','r-close'], ['','—','r-none']].forEach(function (opt) {
            const l = document.createElement('label');
            l.className = 'radio-lbl ' + opt[2];
            const r = document.createElement('input');
            r.type = 'radio';
            r.name = stageId + '-' + panel.id + '-' + i;
            r.value = opt[0];
            r.checked = (step.panelActions[panel.id] || '') === opt[0];
            r.addEventListener('change', function () {
                if (r.checked) {
                    state.stages[stageId].steps[i].panelActions[panel.id] = opt[0];
                    save();
                }
            });
            l.appendChild(r);
            l.appendChild(document.createTextNode(opt[1]));
            grp.appendChild(l);
        });
        td.appendChild(grp);
    });
}

// ─── Step Management ──────────────────────────────────────────────────────────

function addStep() {
    const sd = state.stages[state.activeStageId];
    if (sd.steps.length < MAX_STEPS) { sd.steps.push(createEmptyStep()); save(); renderStage(); }
}

function removeStep(idx) {
    const sd = state.stages[state.activeStageId];
    if (sd.steps.length > 1) { sd.steps.splice(idx, 1); save(); renderStage(); }
}
