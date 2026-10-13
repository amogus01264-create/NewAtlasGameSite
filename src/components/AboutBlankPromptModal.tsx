import React, { useState } from 'react';
import { ExternalLink, Check, AlertCircle, X, Shield, ArrowRight } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { openAboutBlankCloaked, setAboutBlankPromptPref, closeCurrentTab } from '../services/tabCloak';

interface AboutBlankPromptModalProps {
  onClose: () => void;
}

export const AboutBlankPromptModal: React.FC<AboutBlankPromptModalProps> = ({ onClose }) => {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [blockedError, setBlockedError] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleLaunch = () => {
    sounds.playLaunch();
    setBlockedError(false);

    if (dontAskAgain) {
      setAboutBlankPromptPref(false);
    }

    const opened = openAboutBlankCloaked(undefined, 'New Tab', true);
    if (opened) {
      setSuccess(true);
      closeCurrentTab(true);
    } else {
      setBlockedError(true);
    }
  };

  const handleDismiss = () => {
    sounds.playSelect();
    if (dontAskAgain) {
      setAboutBlankPromptPref(false);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#141824] border border-[#2b3144] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Top glow accent */}
        <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1a2030] border-b border-[#2b3144]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ExternalLink className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>Launch in about:blank?</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 uppercase">
                  Stealth
                </span>
              </h2>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-[#252c40] hover:bg-[#303a54] transition-colors cursor-pointer"
            title="Continue in this tab"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Would you like to open Atlas in an <code className="text-cyan-300 bg-cyan-950/60 px-1 py-0.5 rounded text-[11px] font-mono">about:blank</code> window with the tab title set to <strong className="text-white">&ldquo;New Tab&rdquo;</strong>?
          </p>

          {/* Feature preview box */}
          <div className="p-3.5 bg-[#0f1420] rounded-xl border border-slate-700/70 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              <span>Session Disguise Features:</span>
            </div>
            <ul className="text-[11px] text-slate-400 space-y-1.5 pl-5 list-disc">
              <li>
                Tab title changes to <strong className="text-slate-200">&ldquo;New Tab&rdquo;</strong> with generic browser icon
              </li>
              <li>Runs inside an untracked cloaked browser window</li>
              <li>
                <strong className="text-emerald-400">Closes this original tab immediately</strong> right after you click
              </li>
            </ul>
          </div>

          {/* Error notice if popup was blocked */}
          {blockedError && (
            <div className="p-3 bg-amber-950/40 border border-amber-600/50 rounded-xl flex items-start gap-2.5 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <span className="font-bold">Popup blocked by browser.</span>
                <p className="text-[11px] text-amber-200/90 mt-0.5">
                  Click the popup icon in your browser address bar to allow popups, or click <strong>Continue in This Tab</strong> below.
                </p>
              </div>
            </div>
          )}

          {/* Success notice */}
          {success && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-500/50 rounded-xl flex items-center justify-between gap-2 text-emerald-300 text-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Opened in &ldquo;New Tab&rdquo; &amp; closing original tab...</span>
              </div>
              <button
                type="button"
                onClick={() => closeCurrentTab(true)}
                className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-200 rounded cursor-pointer shrink-0"
              >
                Close Tab Now
              </button>
            </div>
          )}

          {/* Don't ask again checkbox */}
          <label className="flex items-center gap-2.5 pt-1 text-xs text-slate-400 hover:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="w-4 h-4 rounded bg-[#1b2234] border-slate-600 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span>Don&apos;t ask me again on launch</span>
          </label>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 bg-[#1a2030] border-t border-[#2b3144]">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-[#22293c] hover:bg-[#2b344c] border border-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            Stay in This Tab
          </button>

          <button
            type="button"
            onClick={handleLaunch}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-900/40 rounded-xl transition-all cursor-pointer"
          >
            <span>Launch in about:blank</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
