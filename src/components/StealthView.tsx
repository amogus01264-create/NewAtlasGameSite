import React, { useEffect, useState } from 'react';
import { FileText, Share2, Undo2, Redo2, Printer, Check, Bold, Italic, Underline, AlignLeft } from 'lucide-react';

interface StealthViewProps {
  onExit: () => void;
}

export const StealthView: React.FC<StealthViewProps> = ({ onExit }) => {
  const [docContent, setDocContent] = useState(
    `AP Biology Chapter 9: Cellular Respiration and Fermentation Notes

1. Overview of Cellular Respiration
Cellular respiration is a set of metabolic reactions and processes that take place in the cells of organisms to convert biochemical energy from nutrients into adenosine triphosphate (ATP), and then release waste products. The catabolic pathways of aerobic respiration (with oxygen) and anaerobic respiration (without oxygen) break down glucose (C6H12O6) to fuel cellular work.

Equation:
C6H12O6 + 6 O2 -> 6 CO2 + 6 H2O + Energy (approx. 30-32 ATP + heat)

2. Key Stages
a. Glycolysis:
Occurs in the cytosol. Splitting of sugar from 1 glucose molecule into 2 pyruvate molecules.
- Net ATP yield: 2 ATP (via substrate-level phosphorylation)
- Net NADH yield: 2 NADH
- Independent of oxygen availability.

b. Citric Acid Cycle (Krebs Cycle):
Occurs inside the mitochondrial matrix. Converts Acetyl CoA into carbon dioxide while reducing NAD+ and FAD into electron carriers.
- Yields per glucose: 2 ATP, 6 NADH, 2 FADH2.

c. Oxidative Phosphorylation & Chemiosmosis:
Inner mitochondrial cristae membrane. High-energy electrons pass through the electron transport chain (complexes I-IV) pumping protons into the intermembrane space creating a proton motive force.
- ATP Synthase catalyzes ADP + Pi -> ATP.`
  );

  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Cell Biology & Respiration Notes - Google Docs';

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      document.title = originalTitle;
      window.removeEventListener('keydown', handleKey);
    };
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f9fbfd] text-slate-800 font-sans select-text overflow-hidden">
      {/* Google Docs Style Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-sm flex items-center justify-center text-white shadow-xs">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-base">
                Cell Biology & Respiration Notes
              </span>
              <span className="text-[11px] text-slate-500 font-normal border border-slate-200 px-1.5 py-0.5 rounded">
                Saved to Drive
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 mt-0.5">
              <span>File</span>
              <span>Edit</span>
              <span>View</span>
              <span>Insert</span>
              <span>Format</span>
              <span>Tools</span>
              <span>Extensions</span>
              <span>Help</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-slate-500 mr-2">
            <Check className="w-3.5 h-3.5 text-slate-400" />
            <span>Last edit was 2 mins ago</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100/70 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </div>

          {/* Discreet Exit button */}
          <button
            onClick={onExit}
            className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
            title="Return to BloxArcade (Esc)"
          >
            Esc
          </button>
        </div>
      </div>

      {/* Docs Toolbar */}
      <div className="bg-[#edf2fa] border-b border-slate-200 px-4 py-1.5 flex items-center gap-3 text-slate-600 text-xs shadow-inner overflow-x-auto">
        <Undo2 className="w-4 h-4 cursor-pointer hover:text-slate-900" />
        <Redo2 className="w-4 h-4 cursor-pointer hover:text-slate-900" />
        <Printer className="w-4 h-4 cursor-pointer hover:text-slate-900" />
        <div className="h-4 w-[1px] bg-slate-300 mx-1" />

        <div className="bg-white px-2 py-0.5 rounded border border-slate-300 font-sans">
          Arial
        </div>
        <div className="bg-white px-2 py-0.5 rounded border border-slate-300 font-sans">
          11
        </div>

        <div className="h-4 w-[1px] bg-slate-300 mx-1" />
        <Bold className="w-4 h-4 cursor-pointer hover:text-slate-900" />
        <Italic className="w-4 h-4 cursor-pointer hover:text-slate-900" />
        <Underline className="w-4 h-4 cursor-pointer hover:text-slate-900" />
        <div className="h-4 w-[1px] bg-slate-300 mx-1" />
        <AlignLeft className="w-4 h-4 cursor-pointer hover:text-slate-900" />
      </div>

      {/* Realistic Paper Page Canvas */}
      <div className="flex-1 overflow-y-auto bg-[#f0f4f9] p-4 sm:p-8 flex justify-center">
        <div className="w-full max-w-3xl min-h-[900px] bg-white shadow-md border border-slate-300 p-12 sm:p-16 rounded-xs">
          <textarea
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
            className="w-full h-full min-h-[700px] text-slate-900 font-sans text-sm leading-relaxed outline-none resize-none bg-transparent"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};
