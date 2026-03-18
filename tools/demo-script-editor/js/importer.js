/**
 * importer.js — Import ctaSteps from demoScript.ts into the Editor
 *
 * Provides the "Open & Import" feature that reads a TypeScript file
 * containing DEMO_ACTS, extracts ctaSteps blocks using bracket-depth
 * matching, parses the step objects, and loads them into the editor.
 *
 * After import the cached file handle is shared with fileSaver.js,
 * so subsequent "Save to File" writes back to the same file without
 * re-opening the picker.
 *
 * Browser compatibility:
 *   SUPPORTED  : Chrome 86+, Edge 86+ (file:// or HTTP)
 *   NOT SUPPORTED: Firefox (blocks File System Access API)
 *
 * Depends on: schema.js (STAGES, PANELS), editor.js (loadImportedState)
 * Must be loaded AFTER schema.js and editor.js.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Shared cache key — same as fileSaver.js so the handle is reused */
const IMPORT_FILE_HANDLE_KEY = '_demoScriptFileHandle';

// ─── Extraction: Bracket-Depth Matching ───────────────────────────────────────

/**
 * escapeRegexI — escapes all special regex metacharacters in a string.
 * Identical to fileSaver.js#escapeRegex but duplicated to keep the
 * importer self-contained (avoids load-order dependency on fileSaver).
 */
function escapeRegexI(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * extractCtaStepsSource — extracts the raw source string of the
 * ctaSteps array for a given act id, using bracket-depth matching.
 *
 * Returns the substring INSIDE the outermost [ ], or null if not found.
 *
 * @param {string} content - Full demoScript.ts file text
 * @param {string} actId   - e.g. 'welcome', 'no-management'
 * @returns {string|null}  - The raw source between [ and ], or null
 */
function extractCtaStepsSource(content, actId) {
    // Locate the act by its id
    const actPattern = new RegExp("id:\\s*['\"]" + escapeRegexI(actId) + "['\"]");
    const actMatch = actPattern.exec(content);
    if (!actMatch) return null;

    // Scope boundary: the next act's id declaration (or EOF)
    const remainder = content.slice(actMatch.index + actMatch[0].length);
    const nextActMatch = /id:\s*['"]/.exec(remainder);
    const scopeEnd = nextActMatch
        ? actMatch.index + actMatch[0].length + nextActMatch.index
        : content.length;

    // Find ctaSteps: within the scope
    const ctaIdx = content.indexOf('ctaSteps:', actMatch.index);
    if (ctaIdx === -1 || ctaIdx >= scopeEnd) return null;

    // Find opening [
    const openIdx = content.indexOf('[', ctaIdx);
    if (openIdx === -1 || openIdx >= scopeEnd) return null;

    // Walk to find matching ]
    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < content.length; i++) {
        if (content[i] === '[') depth++;
        else if (content[i] === ']') {
            depth--;
            if (depth === 0) { closeIdx = i; break; }
        }
    }
    if (closeIdx === -1) return null;

    // Return the content between [ and ] (exclusive of the brackets)
    return content.substring(openIdx + 1, closeIdx);
}

// ─── Parsing: Source → Editor Steps ───────────────────────────────────────────

/**
 * parseCtaStepsArray — takes the raw source string inside the ctaSteps [ ]
 * and returns an array of parsed step objects.
 *
 * Strategy: wraps the source in `[...]` and evaluates it using `new Function`.
 * This is safe because the file is the user's own demoScript.ts on their local
 * machine (not untrusted network content). Template literals are converted to
 * regular strings first to avoid issues.
 *
 * @param {string} innerSource - The text between ctaSteps: [ and ]
 * @returns {Array<Object>}    - Array of parsed step objects
 */
function parseCtaStepsArray(innerSource) {
    // Strip inline comments: // Click #1, etc.
    let cleaned = innerSource.replace(/\/\/[^\n]*/g, '');

    // Convert template literals to regular strings:
    // Replace `...` with '...' (escaping inner single quotes)
    cleaned = cleaned.replace(/`([^`]*)`/g, function (_match, inner) {
        // Escape single quotes inside the template literal
        var escaped = inner.replace(/'/g, "\\'");
        // Preserve newlines as \\n escape sequences (instead of collapsing to spaces)
        // so that new Function() evaluates them back to real newlines.
        // Also collapse leading whitespace AFTER newlines (template literal indentation)
        // but keep the newline itself.
        var normalized = escaped.replace(/\n\s*/g, '\\n');
        return "'" + normalized.trim() + "'";
    });

    try {
        // Evaluate as a JavaScript array literal
        var fn = new Function('return [' + cleaned + ']');
        return fn();
    } catch (err) {
        console.error('[importer] Failed to parse ctaSteps:', err);
        console.error('[importer] Cleaned source:', cleaned.substring(0, 500));
        return null;
    }
}

/**
 * mapToEditorStep — converts a parsed TS step object into the editor's
 * internal state format. Fills in defaults for missing fields and converts
 * the panelActions array format to the editor's object format.
 *
 * TS format:  panelActions: [{ panel: 'cwf', state: 'open' }, ...]
 * Editor format: panelActions: { cwf: 'open', basicPanel: '', ... }
 *
 * @param {Object} parsed - A single parsed step object from the TS file
 * @returns {Object}      - An editor-compatible step object
 */
function mapToEditorStep(parsed) {
    // Start with a blank step (all defaults)
    var step = createEmptyStep();

    // Map simple string/number/boolean fields
    var simpleFields = [
        'ctaLabel', 'slideImageUrl', 'mediaInstruction', 'scenarioCode',
        'workOrderId', 'screenText', 'screenTextAlign', 'screenTextWeight',
        'screenTextSize', 'ariaLocal', 'ariaLocalAlign', 'ariaLocalWeight',
        'ariaLocalSize', 'ariaApi', 'ariaApiAlign', 'ariaApiWeight',
        'ariaApiSize', 'simulationAction', 'transitionTo',
    ];
    simpleFields.forEach(function (field) {
        if (parsed[field] !== undefined && parsed[field] !== null) {
            step[field] = String(parsed[field]);
        }
    });

    // Map delayMs (keep as number string for the editor's number input)
    if (parsed.delayMs !== undefined && parsed.delayMs !== null) {
        step.delayMs = String(parsed.delayMs);
    }

    // Map ariaInputEnabled (boolean)
    if (parsed.ariaInputEnabled !== undefined) {
        step.ariaInputEnabled = !!parsed.ariaInputEnabled;
    }

    // Map panelActions: array → object
    if (Array.isArray(parsed.panelActions)) {
        parsed.panelActions.forEach(function (pa) {
            if (pa.panel && pa.state && step.panelActions.hasOwnProperty(pa.panel)) {
                step.panelActions[pa.panel] = pa.state;
            }
        });
    }

    return step;
}

// ─── File Handle Management ───────────────────────────────────────────────────

/**
 * pickFileForImport — opens the file picker and caches the handle.
 * Shared cache key means fileSaver.js can write to the same file later.
 *
 * @returns {Promise<FileSystemFileHandle>}
 */
async function pickFileForImport() {
    if (typeof window.showOpenFilePicker !== 'function') {
        throw new Error(
            'File System Access API is not supported.\n' +
            'Please use Chrome or Edge.'
        );
    }

    const [handle] = await window.showOpenFilePicker({
        types: [{
            description: 'TypeScript source file (demoScript.ts)',
            accept: { 'text/plain': ['.ts'] },
        }],
        multiple: false,
    });

    // Request readwrite so fileSaver.js can write back without re-prompting
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
        throw new Error('Write permission denied.');
    }

    // Cache the handle (shared with fileSaver.js)
    window[IMPORT_FILE_HANDLE_KEY] = handle;

    // Update the "Change File…" UI in the Save section
    var changeWrap = document.getElementById('btn-change-file-wrap');
    var nameEl = document.getElementById('save-filename');
    if (changeWrap) changeWrap.style.display = 'flex';
    if (nameEl) nameEl.textContent = handle.name;

    return handle;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * openAndImport — main orchestrator:
 *   1. Opens file picker → gets file handle
 *   2. Reads file content
 *   3. For each stage, extracts and parses ctaSteps
 *   4. Builds new editor state
 *   5. Loads into editor, persists, re-renders
 */
window.openAndImport = async function () {
    var btn = document.getElementById('btn-import');

    // Disable button during async work
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Importing…';
    }

    try {
        // 1. Pick or reuse file handle
        var handle = await pickFileForImport();

        // 2. Read file content
        var file = await handle.getFile();
        var content = await file.text();

        // 3. Extract and parse ctaSteps for every stage
        var stages = {};
        var importedCount = 0;
        var failedStages = [];

        STAGES.forEach(function (stage) {
            var source = extractCtaStepsSource(content, stage.id);
            if (source === null) {
                // Act not found — use default 2 empty steps
                failedStages.push(stage.id);
                stages[stage.id] = { steps: [createEmptyStep(), createEmptyStep()] };
                return;
            }

            var parsed = parseCtaStepsArray(source);
            if (parsed === null || parsed.length === 0) {
                // Parse failed — use default
                failedStages.push(stage.id);
                stages[stage.id] = { steps: [createEmptyStep(), createEmptyStep()] };
                return;
            }

            // Convert each parsed step to editor format
            var steps = parsed.map(mapToEditorStep);
            stages[stage.id] = { steps: steps };
            importedCount++;
        });

        // 4. Build new editor state
        var newState = {
            activeStageId: STAGES[0].id,
            stages: stages,
        };

        // 5. Load into editor
        window.loadImportedState(newState);

        // 6. Show feedback
        if (failedStages.length === 0) {
            showImportStatus(
                '✓ Imported ' + importedCount + ' acts from ' + handle.name,
                'success'
            );
        } else {
            showImportStatus(
                '⚠ Imported ' + importedCount + ' acts — could not find: ' + failedStages.join(', '),
                'warn'
            );
        }

    } catch (err) {
        if (err && err.name === 'AbortError') {
            showImportStatus('Import cancelled', 'info');
        } else {
            showImportStatus('✗ Import failed: ' + (err.message || String(err)), 'error');
            console.error('[importer] Import failed:', err);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '📂 Open & Import';
        }
    }
};

// ─── UI Feedback ──────────────────────────────────────────────────────────────

/**
 * showImportStatus — reuses the same toast element as fileSaver.js.
 */
function showImportStatus(message, type) {
    var el = document.getElementById('save-status');
    if (!el) return;

    el.className = 'save-status save-status--' + type;
    el.textContent = message;
    el.style.display = 'flex';

    clearTimeout(el._hideTimeout);

    if (type === 'success' || type === 'info') {
        el._hideTimeout = setTimeout(function () {
            el.style.display = 'none';
        }, 5000);
    }
}

// ─── DOMContentLoaded ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    var importBtn = document.getElementById('btn-import');
    if (importBtn) {
        importBtn.addEventListener('click', window.openAndImport);
    }
});
