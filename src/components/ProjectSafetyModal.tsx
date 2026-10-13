import React, { useState } from 'react';
import { ShieldCheck, Check, Copy, X, Lock, FileCode, CheckCircle2, AlertCircle, Info, School } from 'lucide-react';
import { sounds } from '../services/soundEffects';

interface ProjectSafetyModalProps {
  onClose: () => void;
}

export const ProjectSafetyModal: React.FC<ProjectSafetyModalProps> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : 'https://atlas-arcade.run.app';

  const teacherEmailTemplate = `Subject: Website Whitelist Request: Atlas Arcade (Student Web Project)

Dear IT Administrator / Tech Department,

I would like to request an approval / whitelist review for a student web project used during free time after completed assignments:

• Website URL: ${currentUrl}
• Suggested Category: Educational Games / Student Showcase / Computer Science
• Security Audit Summary:
  - 100% Client-side HTML5 Web Application: No downloadable executables (.exe, .bat, .apk).
  - Clean & Safe: Zero advertising networks, zero tracking cookies, zero crypto-miners.
  - Safe Communications: Standard HTTPS encryption with sandboxed browser storage.
  - No credential phishing: Does not request or store district Google Workspace passwords.

Please consider approving this domain or re-categorizing it from "Unrated/Blocked" to "Educational / Safe Games".

Thank you!`;

  const handleCopyTemplate = () => {
    sounds.playSelect();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(teacherEmailTemplate);
      setCopied(true);
      setTimeout(() => setCopied(false), 3500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="bg-[#121622] border border-[#2d3750] w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-left">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#242b3c] bg-[#161c2c]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-wide uppercase flex items-center gap-2">
                Teacher & IT Safety Verification
                <span className="text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-700/50 px-2 py-0.5 rounded-full uppercase">
                  Verified Safe
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Official safety disclosure & whitelist request guide for school networks
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playBack();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-300">
          {/* Why Sites Get Flagged Notice */}
          <div className="p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-cyan-200">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Why School Filters (GoGuardian / Securly) Flag New Sites
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Automated school filters flag newly published websites as <strong className="text-white">&ldquo;Dangerous&rdquo;</strong> or <strong className="text-white">&ldquo;Unrated Suspicious&rdquo;</strong> simply because the domain is new or contains keywords like &ldquo;unblocked&rdquo;. It does not mean the site has viruses. When clean code and security transparency are presented, school IT can quickly classify it under <strong className="text-emerald-300">Safe Games / Student Projects</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Safety Guarantees Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#171d2b] border border-slate-700/50">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Zero Malware or Downloads</span>
              </div>
              <p className="text-xs text-slate-400 leading-normal">
                100% in-browser HTML5 canvas games. No files (.exe, .zip, .apk) are ever downloaded to student devices.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#171d2b] border border-slate-700/50">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Zero Ads or Trackers</span>
              </div>
              <p className="text-xs text-slate-400 leading-normal">
                No third-party ad networks, no data brokers, and no tracking scripts. Built purely for enjoyable gameplay.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#171d2b] border border-slate-700/50">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Secure HTTPS Encryption</span>
              </div>
              <p className="text-xs text-slate-400 leading-normal">
                End-to-end encrypted TLS connection. User preferences and friends are securely sandboxed.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#171d2b] border border-slate-700/50">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Free-Time Classroom Ready</span>
              </div>
              <p className="text-xs text-slate-400 leading-normal">
                Clean, family-friendly games suitable for use when all classwork and assignments are completed.
              </p>
            </div>
          </div>

          {/* Whitelist Ticket Template for Teacher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <School className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Request Template for Your Teacher to Send to IT
                </span>
              </div>
              <button
                onClick={handleCopyTemplate}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#21293c] hover:bg-[#2c3750] text-slate-200 border border-slate-600'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Template'}</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0c1018] border border-slate-800 text-[11px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed select-text max-h-48 overflow-y-auto">
              {teacherEmailTemplate}
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Tip: Give this text to your teacher. When a teacher emails the school IT helpdesk with this verification, IT can whitelist the domain immediately without security concerns.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#242b3c] bg-[#141826] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Atlas Project Safety Protocol</span>
          </div>

          <button
            onClick={() => {
              sounds.playSelect();
              onClose();
            }}
            className="px-4 py-1.5 bg-[#00A2FF] hover:bg-[#0090e3] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
