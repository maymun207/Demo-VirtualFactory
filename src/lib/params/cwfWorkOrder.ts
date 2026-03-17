/**
 * cwfWorkOrder.ts — CWF Work Order Action Params
 *
 * Centralises all configuration required for the `set_work_order`
 * CWF UI action. This action lets the CWF agent (Gemini) select a
 * specific Work Order in the Demo Settings panel by calling
 * `execute_ui_action` with `action_type = 'set_work_order'` and
 * `action_value = 'WorkID#1' | 'WorkID#2' | 'WorkID#3'`.
 *
 * ─── Architecture ──────────────────────────────────────────────────
 *
 *  CWF backend (api/cwf/chat.ts)
 *    └─ execute_ui_action tool description includes 'set_work_order'
 *
 *  useCWFCommandListener.ts
 *    └─ case CWF_SET_WORK_ORDER_ACTION
 *         ├─ validates actionValue via isValidWorkOrderId()
 *         └─ calls useWorkOrderStore.getState().setSelectedWorkOrderId()
 *
 * ─── Relationship to demo.ts ───────────────────────────────────────
 *
 *  The Work Order IDs listed in CWF_VALID_WORK_ORDER_IDS MUST stay in
 *  sync with the `id` fields in WORK_ORDERS (lib/params/demo.ts).
 *  Both arrays are intentionally kept separate: demo.ts owns the full
 *  Work Order definition (tiles, recipe, lot), while this file owns
 *  only the CWF-action validation surface (just the IDs).
 *
 * Used by: useCWFCommandListener, api/cwf/chat.ts (mirror constant)
 */

// =============================================================================
// ACTION TYPE CONSTANT
// =============================================================================

/**
 * The `action_type` string used for selecting a Work Order via CWF.
 * Must match the string ARIA sends in `execute_ui_action.action_type`.
 * Also replicated verbatim as a mirror constant in api/cwf/chat.ts
 * (the API folder is compiled separately and cannot import from src/).
 */
export const CWF_SET_WORK_ORDER_ACTION = 'set_work_order';

// =============================================================================
// VALID WORK ORDER IDS
// =============================================================================

/**
 * Ordered array of all Work Order IDs that CWF is permitted to set.
 * MUST stay in sync with the `id` field of each entry in WORK_ORDERS
 * (lib/params/demo.ts). Add or remove IDs here whenever WORK_ORDERS changes.
 *
 * WorkID#1 — 500-tile batch  (CeramID WEY — ivory/cream)
 * WorkID#2 — 800-tile batch  (CeramID REY — grey)
 * WorkID#3 — 1000-tile batch (CeramID OEY — green)
 */
export const CWF_VALID_WORK_ORDER_IDS = [
    'WorkID#1',
    'WorkID#2',
    'WorkID#3',
] as const;

/**
 * Union type of all valid Work Order ID strings.
 * Derived from the const array so the type is always in sync.
 */
export type CWFWorkOrderId = typeof CWF_VALID_WORK_ORDER_IDS[number];

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * isValidWorkOrderId — Type guard that returns true when `id` is one
 * of the known Work Order IDs that CWF is allowed to select.
 *
 * Used by the command listener to reject unknown values before they
 * reach `useWorkOrderStore.setSelectedWorkOrderId()`.
 *
 * @param id - The raw string received from CWF (action_value)
 * @returns   true if `id` is in CWF_VALID_WORK_ORDER_IDS
 *
 * @example
 * isValidWorkOrderId('WorkID#3')  // → true
 * isValidWorkOrderId('WorkID#9')  // → false
 * isValidWorkOrderId('')          // → false
 */
export function isValidWorkOrderId(id: string | undefined): id is CWFWorkOrderId {
    /** Guard: reject undefined or empty string immediately */
    if (!id) return false;
    /** Cast to the const-array type before the includes check */
    return (CWF_VALID_WORK_ORDER_IDS as readonly string[]).includes(id);
}

// =============================================================================
// HUMAN-READABLE LABELS
// =============================================================================

/**
 * Maps each Work Order ID to a short human-readable label.
 * Used by the command listener to compose the CWF confirmation message
 * shown after a successful `set_work_order` action.
 *
 * Keys must match CWF_VALID_WORK_ORDER_IDS exactly.
 */
export const WORK_ORDER_DISPLAY_LABELS: Record<CWFWorkOrderId, string> = {
    'WorkID#1': 'WorkID #1 — 500 tiles (CeramID WEY)',
    'WorkID#2': 'WorkID #2 — 800 tiles (CeramID REY)',
    'WorkID#3': 'WorkID #3 — 1000 tiles (CeramID OEY)',
};
