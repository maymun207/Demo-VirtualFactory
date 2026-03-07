/**
 * Playbook.tsx — Factory Process Guide Modal
 *
 * A full-screen modal overlay that displays educational information
 * about the ceramic tile manufacturing process. Shows when
 * uiStore.activeModal === "playbook".
 *
 * Content:
 *  - Step-by-step production stages with icons and descriptions
 *  - Uses nested translation structures from translations.ts directly
 *    (cannot use the simple useTranslation hook for nested arrays)
 *
 * Used by: Dashboard.tsx (opened via ControlPanel "Playbook" button)
 */
import { useUIStore } from "../../store/uiStore";
// Playbook uses nested structures (arrays of objects with tr/en keys)
// that the simple useTranslation hook cannot handle, so we access translations directly here.
import { translations } from "../../lib/translations";

export const Playbook = () => {
  const activeModal = useUIStore((s) => s.activeModal);
  const setModal = useUIStore((s) => s.setModal);
  const currentLang = useUIStore((s) => s.currentLang);

  if (activeModal !== "playbook") return null;

  const t = translations.playbook;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-[#0f1115] border-2 border-[#00ff88]/50 rounded-xl sm:rounded-2xl w-full max-w-[95vw] sm:max-w-lg max-h-[90vh] shadow-[0_0_50px_rgba(0,255,136,0.2)] overflow-hidden relative flex flex-col">
        <button
          onClick={() => setModal(null)}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 text-white/50 hover:text-white text-xl sm:text-2xl transition-colors z-10"
        >
          &times;
        </button>

        <div className="p-4 sm:p-6 border-b border-white/10 bg-[#00ff88]/5 flex-shrink-0">
          <h2 className="text-[#00ff88] font-bold text-base sm:text-lg pr-8">
            {t.title[currentLang]}
          </h2>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
          <div>
            <h3 className="text-[#00d4ff] font-semibold mb-2 text-sm sm:text-base">
              {t.question[currentLang]}
            </h3>
            <div className="bg-white/5 p-3 sm:p-4 rounded-lg border border-white/10">
              <p className="text-white/80 text-xs sm:text-sm leading-relaxed">
                {t.rootCause[currentLang]}
              </p>
            </div>
          </div>

          <div className="space-y-2 sm:space-y-3">
            {t.actions.map((action, i) => (
              <div
                key={i}
                className="bg-[#00ff88]/5 border border-[#00ff88]/20 rounded-lg p-2.5 sm:p-3 hover:bg-[#00ff88]/10 transition-colors cursor-pointer group"
              >
                <h4 className="text-[#00ff88] font-semibold text-xs sm:text-sm mb-1 group-hover:translate-x-1 transition-transform">
                  {action.title[currentLang]}
                </h4>
                <p className="text-white/70 text-[0.625rem] sm:text-xs mb-1.5 sm:mb-2 pl-3 sm:pl-4 border-l-2 border-[#00ff88]/30">
                  {action.desc[currentLang]}
                </p>
                <p className="text-[#00d4ff] text-[0.625rem] sm:text-xs font-medium pl-3 sm:pl-4">
                  {action.impact[currentLang]}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 sm:p-4 border-t border-white/10 bg-white/5 flex gap-3 flex-shrink-0">
          <button
            onClick={() => setModal(null)}
            className="flex-1 py-2.5 sm:py-3 rounded-xl bg-[#00ff88]/20 text-[#00ff88] font-bold text-xs sm:text-sm hover:bg-[#00ff88]/30 transition-all border border-[#00ff88]/30"
          >
            {t.applyAndClose[currentLang]}
          </button>
        </div>
      </div>
    </div>
  );
};
