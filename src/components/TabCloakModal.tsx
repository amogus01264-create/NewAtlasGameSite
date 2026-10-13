import React, { useState } from 'react';
import {
  CLOAK_PRESETS,
  TabCloakConfig,
  TabCloakPreset,
  applyTabCloak,
  saveTabCloak,
  openAboutBlankCloaked,
} from '../services/tabCloak';
import { sounds } from '../services/soundEffects';
import {
  X,
  Shield,
  ExternalLink,
  Check,
  Sparkles,
  HelpCircle,
  Eye,
  EyeOff,
} from 'lucide-react';

interface TabCloakModalProps {
  currentConfig: TabCloakConfig;
  onConfigChange: (config: TabCloakConfig) => void;
  onClose: () => void;
}

export const TabCloakModal: React.FC<TabCloakModalProps> = ({
  currentConfig,
  onConfigChange,
  onClose,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<TabCloakPreset>(currentConfig.preset);
  const [customTitle, setCustomTitle] = useState(currentConfig.customTitle || 'Classes');
  const [customIcon, setCustomIcon] = useState(currentConfig.customIcon || '');
  const [aboutBlankSuccess, setAboutBlankSuccess] = useState(false);

  const handleSelectPreset = (presetId: TabCloakPreset) => {
    setSelectedPreset(presetId);
    sounds.playSelect();
    const newConfig: TabCloakConfig = {
      preset: presetId,
      customTitle,
      customIcon,
    };
    applyTabCloak(newConfig);
    saveTabCloak(newConfig);
    onConfigChange(newConfig);
  };

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playSelect();
    const newConfig: TabCloakConfig = {
      preset: 'custom',
      customTitle,
      customIcon,
    };
    setSelectedPreset('custom');
    applyTabCloak(newConfig);
    saveTabCloak(newConfig);
    onConfigChange(newConfig);
  };

  const handleQuickReset = () => {
    sounds.playBack();
    const newConfig: TabCloakConfig = { preset: 'none' };
    setSelectedPreset('none');
    applyTabCloak(newConfig);
    saveTabCloak(newConfig);
    onConfigChange(newConfig);
  };

  const [aboutBlankError, setAboutBlankError] = useState(false);

  const handleLaunchAboutBlank = () => {
    sounds.playLaunch();
    setAboutBlankError(false);
    const ok = openAboutBlankCloaked();
    if (ok) {
      setAboutBlankSuccess(true);
      setTimeout(() => setAboutBlankSuccess(false), 3000);
    } else {
      setAboutBlankError(true);
      setTimeout(() => setAboutBlankError(false), 5000);
    }
  };

  // Compute live preview of the tab
  const activePresetInfo = CLOAK_PRESETS.find((p) => p.id === selectedPreset);
  const previewTitle =
    selectedPreset === 'custom'
      ? customTitle || 'New Tab'
      : activePresetInfo?.title || 'Atlas - Unblocked Gaming Network';
  const previewIcon =
    selectedPreset === 'custom'
      ? customIcon || '/favicon.ico'
      : activePresetInfo?.iconUrl || '/favicon.ico';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none">
      <div className="relative w-full max-w-lg bg-[#141824] border border-[#2b3144] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1a2030] border-b border-[#2b3144]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>Tab Cloaker & Disguise</span>
                {selectedPreset !== 'none' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 uppercase">
                    Cloaked Active
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                Disguise this browser tab's title and icon as school or productivity tools.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              sounds.playBack();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-[#252c40] hover:bg-[#303a54] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Live Simulation Preview */}
        <div className="px-6 py-3.5 bg-[#0e121d] border-b border-[#202738]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
            <span>Browser Tab Preview</span>
            <span className="text-cyan-400 font-mono">Chrome / Edge Preview</span>
          </div>

          {/* Fake browser tab container */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#1e2536] border border-slate-700/80 rounded-t-lg max-w-full shadow-inner">
            <div className="w-4 h-4 rounded overflow-hidden flex items-center justify-center shrink-0 bg-slate-900">
              <img
                src={previewIcon}
                alt=""
                className="w-3.5 h-3.5 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/favicon.ico';
                }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-200 truncate max-w-[260px]">
              {previewTitle}
            </span>
            <span className="text-slate-500 hover:text-slate-300 text-xs ml-1 cursor-default">✕</span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[65vh]">
          {/* Preset Buttons Grid */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
              Select Disguise Preset
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {CLOAK_PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_12px_rgba(0,162,255,0.25)] ring-1 ring-cyan-500/50'
                        : 'bg-[#181f30] hover:bg-[#202940] border-[#2b344a] text-slate-300 hover:text-white'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#111624] border border-slate-700/60 flex items-center justify-center shrink-0 overflow-hidden p-1">
                      {preset.id === 'none' ? (
                        <EyeOff className="w-4 h-4 text-slate-400" />
                      ) : preset.id === 'custom' ? (
                        <Sparkles className="w-4 h-4 text-amber-400" />
                      ) : (
                        <img
                          src={preset.iconUrl}
                          alt=""
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate flex items-center justify-between">
                        <span className={isSelected ? 'text-white' : 'text-slate-200'}>
                          {preset.label}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-1" />}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {preset.title}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Cloak Form (if custom selected) */}
          {selectedPreset === 'custom' && (
            <form onSubmit={handleSaveCustom} className="p-4 bg-[#1b2234] rounded-xl border border-cyan-500/40 space-y-3">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Custom Title & Icon Details</span>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Custom Tab Title
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Google Classroom or Math Homework"
                  className="w-full bg-[#111622] text-white text-xs px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Favicon Image URL (.png or .ico)
                </label>
                <input
                  type="text"
                  value={customIcon}
                  onChange={(e) => setCustomIcon(e.target.value)}
                  placeholder="https://example.com/icon.png"
                  className="w-full bg-[#111622] text-white text-xs px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-[#00A2FF] hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Apply Custom Disguise
              </button>
            </form>
          )}

          {/* Secondary Cloaking: about:blank Camouflage Tab */}
          <div className="p-4 bg-[#1a2133] rounded-xl border border-slate-700/60 flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Launch in about:blank Tab</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Opens Atlas inside an <code>about:blank</code> tab with your active disguise. It doesn't appear in browser search history.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLaunchAboutBlank}
                className="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/50 text-cyan-300 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
              >
                Launch Now
              </button>
            </div>
            {aboutBlankSuccess && (
              <div className="text-[11px] text-emerald-400 font-semibold bg-emerald-950/40 border border-emerald-700/40 rounded px-2.5 py-1">
                ✓ Opened in cloaked about:blank tab with title &ldquo;New Tab&rdquo;!
              </div>
            )}
            {aboutBlankError && (
              <div className="text-[11px] text-amber-400 font-semibold bg-amber-950/40 border border-amber-700/40 rounded px-2.5 py-1">
                Popup blocker prevented opening about:blank. Please enable popups for this site in your browser address bar.
              </div>
            )}
          </div>

          {/* Reset back to normal button */}
          {selectedPreset !== 'none' && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleQuickReset}
                className="text-xs text-slate-400 hover:text-white underline underline-offset-4 cursor-pointer"
              >
                Reset Tab to Default (Atlas Network)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
