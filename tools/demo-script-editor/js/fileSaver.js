/**
 * fileSaver.js — Direct File System Save for the VF Demo Script Editor
 *
 * Provides the "Save to File" feature using the browser File System Access API.
 * Allows the editor to write ctaSteps[] blocks directly into demoScript.ts,
 * eliminating the manual copy-paste workflow entirely.
 *
 * Browser compatibility:
 *   SUPPORTED  : Chrome 86+, Edge 86+ (file:// or HTTP)
 *   NOT SUPPORTED: Firefox (blocks File System Access API for file:// origins)
 *
 * Architecture — three layers:
 *   1. Pure transformation functions (side-effect-free, fully testable):
 *        escapeRegex()              — regex escape utility
 *        generateCtaBlockForAct()   — builds the ctaSteps string for one act
 *        replaceCtaStepsForAct()    — bracket-depth splice for a single act
 *        replaceAllCtaSteps()       — iterates replaceCtaStepsForAct for every stage
 *
 *   2. File handle management (wraps browser File System Access API):
 *        getOrPickFileHandle()  — opens picker first time, reuses handle thereafter
 *        resetFileHandle()      — clears handle, next save will show picker again
 *
 *   3. Orchestration (composes layers 1 and 2, drives UI feedback):
 *        saveToFile()           — main entry point wired to the "Save to File" button
 *        showSaveStatus()       — renders the status toast
 *
 * Depends on: schema.js (STAGES, PANELS), exporter.js (buildStepFields, q)
 * Must be loaded AFTER schema.js and exporter.js.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * FILE_HANDLE_KEY — window property used to cache the picked file handle.
 * Not persisted across page reloads (browser security restriction: file handles
 * are in-memory only — the picker must be shown again after a page reload).
 */
const FILE_HANDLE_KEY = '_demoScriptFileHandle';

// ─── Layer 1: Pure Transformation ─────────────────────────────────────────────

/**
 * escapeRegex — escapes all special regex metacharacters in a plain string.
 * Used so that act IDs containing hyphens (e.g. 'no-management') are safe to
 * embed directly inside a RegExp pattern without altering the match logic.
 *
 * @param {string} str - The raw string to escape
 * @returns {string} The regex-safe version of the input
 */
function escapeRegex(str) {
    // Replace each special character with its backslash-escaped equivalent
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * generateCtaBlockForAct — builds the `ctaSteps: [...],` replacement string
 * for a single act, using the current in-memory editor state.
 *
 * Reuses buildStepFields() from exporter.js to emit only fields that carry
 * meaningful values — empty/default-value fields are omitted for cleanliness,
 * exactly as the existing Export TypeScript feature does.
 *
 * Indentation matches the original demoScript.ts file layout:
 *   - ctaSteps: [          ← 8 spaces (sits inside the act object literal)
 *       { // Click #N      ← 12 spaces
 *           field: value,  ← 16 spaces
 *       },                 ← 12 spaces
 *   ],                     ← 8 spaces (trailing comma added by caller)
 *
 * @param {string} stageId - The stage id (matches STAGES[n].id, e.g. 'welcome')
 * @returns {string} The ctaSteps block string — does NOT include a trailing comma
 */
function generateCtaBlockForAct(stageId) {
    // Retrieve the live editor state (provided by editor.js via window.getEditorState)
    const state = window.getEditorState();
    // Fetch the ordered steps array for this stage
    const steps = state.stages[stageId].steps;

    const lines = [];

    // Open the ctaSteps array (8-space indent = inside act object)
    lines.push('        ctaSteps: [');

    // Emit one object block per step, labelled with its click number
    steps.forEach(function (step, i) {
        // Click number comment aids readability in the source file
        lines.push('            { // Click #' + (i + 1));

        // Extract textarea heights for this step (for editor persistence)
        var heights = extractStepHeights(state, stageId, i);
        // buildStepFields returns an array of "key: value," string lines
        buildStepFields(step, heights).forEach(function (line) {
            // Indent each field line 16 spaces (inside the step object)
            lines.push('                ' + line);
        });

        // Close the step object with a trailing comma
        lines.push('            },');
    });

    // Close the ctaSteps array (no trailing comma — caller appends it)
    lines.push('        ]');

    return lines.join('\n');
}

/**
 * replaceCtaStepsForAct — surgically finds and replaces the `ctaSteps: [...]`
 * block for a specific act within the full demoScript.ts file content string.
 *
 * Algorithm:
 *   1. Locate the act by its unique `id: '<actId>'` declaration using a regex that
 *      handles both single and double quoted strings.
 *   2. Determine the end-of-scope boundary (the start of the NEXT act's id) to
 *      prevent accidentally matching a ctaSteps in a subsequent act.
 *   3. Find the `ctaSteps:` keyword within the act's scope.
 *   4. Find the opening `[` bracket immediately after `ctaSteps:`.
 *   5. Walk forward character-by-character, tracking bracket depth, until the
 *      matching closing `]` is found (depth returns to zero).
 *   6. Consume the optional trailing comma after the `]`.
 *   7. Splice: prefix + newBlock + ',' + suffix.
 *
 * All other content — comments, systemContext, openingPrompt, panelActions, etc.
 * — is left completely untouched.
 *
 * @param {string} content - The full text content of demoScript.ts
 * @param {string} actId   - The target act id (e.g. 'welcome', 'no-management')
 * @param {string} newBlock - The replacement ctaSteps block (without trailing comma)
 * @returns {{ content: string, found: boolean }}
 *   content: the updated file text (unchanged if found=false)
 *   found: true if the act was located and replaced, false if not found
 */
function replaceCtaStepsForAct(content, actId, newBlock) {
    // ── Step 1: locate the act by its id declaration ───────────────────────────
    // Pattern handles both single-quoted and double-quoted id values
    const actIdPattern = new RegExp("id:\\s*['\"]" + escapeRegex(actId) + "['\"]");
    const actIdMatch = actIdPattern.exec(content);
    if (!actIdMatch) {
        // Act id was not found anywhere in the file — report and bail out
        return { content: content, found: false };
    }

    // ── Step 2: determine end-of-scope (start of the next act's id) ────────────
    // Searching for the next id: declaration after the current match prevents
    // accidentally matching ctaSteps belonging to a later act in the file
    const remainderAfterActId = content.slice(actIdMatch.index + actIdMatch[0].length);
    const nextActIdMatch = /id:\s*['"]/.exec(remainderAfterActId);
    // If a next act exists, the scope ends there; otherwise, the scope runs to EOF
    const scopeEnd = nextActIdMatch
        ? actIdMatch.index + actIdMatch[0].length + nextActIdMatch.index
        : content.length;

    // ── Step 3: find `ctaSteps:` within the act's scope ───────────────────────
    const ctaStepsIdx = content.indexOf('ctaSteps:', actIdMatch.index);
    if (ctaStepsIdx === -1 || ctaStepsIdx >= scopeEnd) {
        // No ctaSteps key found within this act's scope
        return { content: content, found: false };
    }

    // ── Step 4: find the opening `[` after `ctaSteps:` ────────────────────────
    const openBracketIdx = content.indexOf('[', ctaStepsIdx);
    if (openBracketIdx === -1 || openBracketIdx >= scopeEnd) {
        // Malformed file — ctaSteps: keyword found but no opening bracket
        return { content: content, found: false };
    }

    // ── Step 5: walk character-by-character to find the matching `]` ──────────
    let depth = 0;         // tracks how many levels of [ we are inside
    let closeBracketIdx = -1;

    for (let i = openBracketIdx; i < content.length; i++) {
        if (content[i] === '[') {
            // Every opening bracket increases depth
            depth++;
        } else if (content[i] === ']') {
            // Every closing bracket decreases depth
            depth--;
            if (depth === 0) {
                // Depth is zero — this is the matching closing bracket
                closeBracketIdx = i;
                break;
            }
        }
    }

    if (closeBracketIdx === -1) {
        // Bracket matching failed — file may be malformed
        return { content: content, found: false };
    }

    // ── Step 6: determine the full replacement range ───────────────────────────
    // Start of range: the `c` in `ctaSteps:`
    // End of range  : position AFTER the `]`, plus any immediately following `,`
    let endPos = closeBracketIdx + 1;

    // Consume an optional trailing comma to avoid producing `],` + `,`
    if (content[endPos] === ',') {
        endPos++;
    }

    // ── Step 7: perform the splice ─────────────────────────────────────────────
    const before = content.substring(0, ctaStepsIdx);  // everything before ctaSteps:
    const after  = content.substring(endPos);            // everything after closing ],

    // Re-join: the new block replaces ctaSteps through closing ],
    // The caller-less trailing comma is appended here to keep the object syntax valid
    return { content: before + newBlock + ',' + after, found: true };
}

/**
 * replaceAllCtaSteps — applies replaceCtaStepsForAct() for every stage in the
 * STAGES array (defined in schema.js), accumulating the changes in sequence.
 *
 * Returns both the final updated content string and a per-act success map so
 * the caller can report any acts that could not be located in the file.
 *
 * @param {string} content - The full original content of demoScript.ts
 * @returns {{ content: string, results: Object.<string, boolean> }}
 *   content: the fully updated file text
 *   results: map of actId → true (replaced) | false (not found)
 */
function replaceAllCtaSteps(content) {
    // Track whether each act was successfully located and replaced
    const results = {};

    // Accumulate changes — each pass operates on the output of the previous pass
    let updated = content;

    STAGES.forEach(function (stage) {
        // Generate the fresh ctaSteps block from the current editor state
        const newBlock = generateCtaBlockForAct(stage.id);

        // Surgically splice it in for this act
        const result = replaceCtaStepsForAct(updated, stage.id, newBlock);

        // Use the result as input to the next iteration
        updated = result.content;

        // Record whether this act was found (for error reporting)
        results[stage.id] = result.found;
    });

    return { content: updated, results: results };
}

// ─── Layer 2: File Handle Management ──────────────────────────────────────────

/**
 * getOrPickFileHandle — returns the in-memory cached file handle if one exists,
 * or opens the native OS file picker and lets the user select demoScript.ts.
 *
 * PERMISSION MODEL (critical):
 *   showOpenFilePicker() returns a read-only handle by default.
 *   To write back to the file, we must explicitly call handle.requestPermission()
 *   with mode 'readwrite'. On Chrome/Edge this shows a small "Allow edit?" prompt
 *   the first time. Without this call, createWritable() throws a NotAllowedError.
 *
 * @returns {Promise<FileSystemFileHandle>} A verified readwrite file handle
 * @throws {DOMException} With name 'AbortError' if the user cancels the picker
 * @throws {Error} If the File System Access API is unavailable or permission denied
 */
async function getOrPickFileHandle() {
    // Return the cached handle immediately if one was already picked this session
    if (window[FILE_HANDLE_KEY]) {
        return window[FILE_HANDLE_KEY];
    }

    // Guard: ensure the File System Access API is available in this browser
    if (typeof window.showOpenFilePicker !== 'function') {
        throw new Error(
            'File System Access API is not supported in this browser.\n\n' +
            'Please open this file in Chrome or Edge.\n' +
            'Firefox does not support this API for local files.'
        );
    }

    // Open the OS file picker — filtered to TypeScript source files
    const [handle] = await window.showOpenFilePicker({
        types: [{
            description: 'TypeScript source file (demoScript.ts)',
            accept: { 'text/plain': ['.ts'] },
        }],
        multiple: false,
    });

    // Warn if the user selected an unexpected file (e.g., not demoScript.ts)
    if (handle.name !== 'demoScript.ts') {
        console.warn('[fileSaver] Expected demoScript.ts but got:', handle.name);
        showSaveStatus(
            '⚠ Selected "' + handle.name + '" — expected demoScript.ts',
            'warn'
        );
        // Not a hard block; allow proceeding in case the file was renamed
    }

    // ─── CRITICAL FIX: Request explicit readwrite permission ───────────────────
    // showOpenFilePicker() gives read-only access by default.
    // Without this step, createWritable() throws a NotAllowedError.
    // Chrome/Edge will show a small OS-level "Allow edit?" prompt on first call.
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
        // User denied the write permission prompt — cannot proceed
        throw new Error(
            'Write permission denied.\n\n' +
            'When prompted by the browser, click "Allow" to let the editor ' +
            'write to demoScript.ts.'
        );
    }

    // Cache the verified readwrite handle for reuse within this page session
    window[FILE_HANDLE_KEY] = handle;

    // Reveal the "Change File…" control and display the selected filename
    const changeWrap = document.getElementById('btn-change-file-wrap');
    const nameEl     = document.getElementById('save-filename');
    if (changeWrap) changeWrap.style.display = 'flex';
    if (nameEl)     nameEl.textContent = handle.name;

    return handle;
}

/**
 * resetFileHandle — clears the cached file handle so the next saveToFile() call
 * will re-open the OS file picker. Called by the "Change File…" link.
 *
 * Exposed on window so it can be referenced from inline HTML onclick attributes.
 */
window.resetFileHandle = function () {
    // Remove the cached handle so the next save triggers the picker
    window[FILE_HANDLE_KEY] = null;

    // Hide the "Change File…" control since no file is currently linked
    const changeWrap = document.getElementById('btn-change-file-wrap');
    if (changeWrap) changeWrap.style.display = 'none';

    // Inform the user that the link was cleared
    showSaveStatus('File unlinked — next save will open the file picker', 'info');
};

// ─── Layer 3: Orchestration ────────────────────────────────────────────────────

/**
 * saveToFile — main entry point wired to the "💾 Save to File" button.
 *
 * Full flow:
 *   1. Disable the button to prevent re-entrant double-clicks
 *   2. Get or pick a writable file handle (shows picker on first use only)
 *   3. Read the current text content of the chosen file
 *   4. Surgically replace all ctaSteps blocks in memory (no disk touch yet)
 *   5. Write the updated content back to disk via the writable stream
 *   6. Show a success or error toast
 *   7. Re-enable the button regardless of outcome
 *
 * Exposed on window so it can be referenced as an event listener before
 * DOMContentLoaded fires (progressive enhancement pattern).
 */
window.saveToFile = async function () {
    const btn = document.getElementById('btn-save');

    // ── Step 1: disable button during async operation ──────────────────────────
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Saving…';
    }

    try {
        // ── Step 2: obtain file handle (picker or cached) ──────────────────────
        const handle = await getOrPickFileHandle();

        // ── Step 3: read current file content from disk ────────────────────────
        const file = await handle.getFile();
        const originalContent = await file.text();

        // ── Step 4: surgically replace all ctaSteps blocks in memory ──────────
        const { content: updatedContent, results } = replaceAllCtaSteps(originalContent);

        // Identify any acts whose ctaSteps could not be located in the file
        const missingActs = Object.keys(results).filter(function (id) {
            return !results[id];
        });

        // Log missing acts for developer debugging (not a blocking error)
        if (missingActs.length > 0) {
            console.warn('[fileSaver] Could not locate ctaSteps for acts:', missingActs);
        }

        // ── Step 5: write the updated content back to the file ─────────────────
        // createWritable opens a write stream; close() commits the write atomically
        const writable = await handle.createWritable();
        await writable.write(updatedContent);
        await writable.close();

        // ── Step 6: show feedback ──────────────────────────────────────────────
        if (missingActs.length === 0) {
            // All acts were found and replaced successfully
            showSaveStatus('✓ Saved to ' + handle.name, 'success');
        } else {
            // Partial save — some acts were not found (possible schema mismatch)
            showSaveStatus(
                '⚠ Saved — but ' + missingActs.join(', ') + ' not found in file',
                'warn'
            );
        }

    } catch (err) {
        if (err && err.name === 'AbortError') {
            // User cancelled the file picker — treat as a silent no-op
            showSaveStatus('Save cancelled', 'info');
        } else {
            // Unexpected error — show message and log full error for debugging
            showSaveStatus('✗ Save failed: ' + (err.message || String(err)), 'error');
            console.error('[fileSaver] Save failed:', err);
        }
    } finally {
        // ── Step 7: re-enable button regardless of outcome ────────────────────
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 Save to File';
        }
    }
};

// ─── UI Feedback ──────────────────────────────────────────────────────────────

/**
 * showSaveStatus — displays a short status message in the #save-status toast
 * element and automatically hides it after 4 seconds.
 *
 * @param {string} message - The human-readable message to display
 * @param {'success'|'warn'|'error'|'info'} type - Controls the visual colour
 *   success → green   (save completed without issues)
 *   warn    → amber   (save completed with minor issues)
 *   error   → red     (save failed — action may be needed)
 *   info    → grey    (neutral information, no action needed)
 */
function showSaveStatus(message, type) {
    const el = document.getElementById('save-status');
    if (!el) return;

    // Apply type-specific CSS class for colour coding
    el.className = 'save-status save-status--' + type;
    el.textContent = message;
    el.style.display = 'flex';

    // Cancel any previous auto-hide timer
    clearTimeout(el._hideTimeout);

    // Error and warn toasts stay visible until the next save attempt — user MUST see them.
    // Success and info toasts auto-hide after 5 seconds (long enough to read comfortably).
    if (type === 'success' || type === 'info') {
        el._hideTimeout = setTimeout(function () {
            el.style.display = 'none';
        }, 5000);
    }
    // error and warn: no auto-hide — toast stays until replaced by the next save attempt
}

// ─── DOMContentLoaded wiring ──────────────────────────────────────────────────

/**
 * DOMContentLoaded listener — wires the Save button and Change File link to
 * their respective handler functions once the DOM is available.
 */
document.addEventListener('DOMContentLoaded', function () {
    // Wire the "💾 Save to File" button to the main save orchestrator
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', window.saveToFile);
    }

    // Wire the "Change File…" link to clear the cached handle
    const changeBtn = document.getElementById('btn-change-file');
    if (changeBtn) {
        changeBtn.addEventListener('click', window.resetFileHandle);
    }
});
