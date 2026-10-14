import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, RegisteredAccount } from '../types';
import { AtlasLogo } from './AtlasLogo';
import { Upload, ChevronDown, AlertCircle, CheckCircle2, User, KeyRound, Sparkles, Loader2, Trash2, X } from 'lucide-react';
import { sounds } from '../services/soundEffects';
import { MISSING_TEXTURE_DATA_URL } from '../utils/assets';
import { compressImageToDataUrl } from '../utils/imageCompressor';
import {
  getRegisteredAccounts,
  registerAccountAsync,
  authenticateUserAsync,
  deleteAccountAsync,
  deleteAllAccountsAsync,
  saveSession,
} from '../services/userService';

interface SignInModalProps {
  onSignIn: (profile: UserProfile) => void;
}

export const SignInModal: React.FC<SignInModalProps> = ({ onSignIn }) => {
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [month, setMonth] = useState('Month');
  const [day, setDay] = useState('Day');
  const [year, setYear] = useState('Year');
  const [gender, setGender] = useState<'female' | 'male' | null>(null);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<RegisteredAccount | null>(null);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // List of saved registered accounts on this device
  const [savedAccounts, setSavedAccounts] = useState<RegisteredAccount[]>([]);

  useEffect(() => {
    setSavedAccounts(getRegisteredAccounts());
  }, []);

  // Background game collage thumbnails (matches screenshot grid background)
  const bgThumbnails = [
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1563089145-599997674d42?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=500&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1612287232230-05e83ec8b9ff?w=500&auto=format&fit=crop&q=80',
  ];

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setErrorMessage('Please choose an image under 20MB');
        return;
      }
      try {
        const compressed = await compressImageToDataUrl(file, 96, 96, 0.75);
        setCustomImage(compressed);
        sounds.playSelect();
      } catch (err) {
        console.warn('Avatar compression error:', err);
      }
    }
  };

  const handleDeleteAccount = async (account: RegisteredAccount) => {
    setIsDeleting(true);
    setErrorMessage(null);
    setSuccessNotice(null);
    try {
      const res = await deleteAccountAsync(account.username);
      if (res.success) {
        sounds.playExplosion();
        setSavedAccounts(getRegisteredAccounts());
        setSuccessNotice(`Account "${account.username}" was permanently deleted.`);
        setAccountToDelete(null);
      } else {
        setErrorMessage(res.error || 'Failed to delete account.');
        sounds.playBack();
      }
    } catch (err: any) {
      console.error('Delete account error:', err);
      setErrorMessage(err?.message || 'Failed to delete account.');
      sounds.playBack();
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePurgeAllTestAccounts = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    setSuccessNotice(null);
    try {
      const res = await deleteAllAccountsAsync();
      sounds.playExplosion();
      setSavedAccounts([]);
      setSuccessNotice(`All test accounts were deleted (${res.count} network records removed).`);
      setShowPurgeConfirm(false);
    } catch (err: any) {
      console.error('Purge error:', err);
      setErrorMessage('Failed to purge accounts.');
      sounds.playBack();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || isDeleting) return;
    setErrorMessage(null);
    setSuccessNotice(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setErrorMessage('Username is required.');
      sounds.playBack();
      return;
    }

    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      setErrorMessage('Username must be between 3 and 20 characters.');
      sounds.playBack();
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
      setErrorMessage('Username can only contain letters, numbers, underscores, and dashes (no spaces).');
      sounds.playBack();
      return;
    }

    if (!password || password.length < 4) {
      setErrorMessage('Password is required and must be at least 4 characters.');
      sounds.playBack();
      return;
    }

    // Sign Up Mode: B-Day is mandatory ("all sections of sign up must be filled besides gender")
    if (!isLoginMode) {
      if (month === 'Month' || day === 'Day' || year === 'Year') {
        setErrorMessage('Birthday is required. Please select your Month, Day, and Year.');
        sounds.playBack();
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (isLoginMode) {
        // LOG IN MODE: Authenticate user in Cloud Database
        const authResult = await authenticateUserAsync(cleanUsername, password);
        if (!authResult.success || !authResult.account) {
          setErrorMessage(authResult.error || 'Login failed.');
          sounds.playBack();
          setIsSubmitting(false);
          return;
        }

        const profile: UserProfile = {
          gamertag: authResult.account.username,
          gamerpic: authResult.account.gamerpic || MISSING_TEXTURE_DATA_URL,
          isGuest: false,
          rememberMe,
        };

        if (rememberMe) {
          saveSession(profile);
        } else {
          saveSession(null);
        }

        sounds.playLaunch();
        onSignIn(profile);
      } else {
        // SIGN UP MODE: Check uniqueness & register in Cloud Database
        const finalPic = customImage || MISSING_TEXTURE_DATA_URL;

        const newAccount: RegisteredAccount = {
          username: cleanUsername,
          password,
          gamerpic: finalPic,
          birthday: { month, day, year },
          gender: gender || null,
          createdAt: new Date().toISOString(),
        };

        const regResult = await registerAccountAsync(newAccount);
        if (!regResult.success) {
          setErrorMessage(regResult.error || 'Registration failed.');
          sounds.playBack();
          setIsSubmitting(false);
          return;
        }

        const profile: UserProfile = {
          gamertag: cleanUsername,
          gamerpic: finalPic,
          isGuest: false,
          rememberMe,
        };

        if (rememberMe) {
          saveSession(profile);
        } else {
          saveSession(null);
        }

        sounds.playLaunch();
        onSignIn(profile);
      }
    } catch (err: any) {
      console.error('Submit error:', err);
      setErrorMessage(err?.message || 'Network connection error. Please try again.');
      sounds.playBack();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAccountPick = (account: RegisteredAccount) => {
    const profile: UserProfile = {
      gamertag: account.username,
      gamerpic: account.gamerpic || MISSING_TEXTURE_DATA_URL,
      isGuest: false,
      rememberMe: true,
    };
    saveSession(profile);
    sounds.playLaunch();
    onSignIn(profile);
  };

  const handleQuickGuest = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const guestProfile: UserProfile = {
      gamertag: `AtlasGuest_${randomNum}`,
      gamerpic: customImage || MISSING_TEXTURE_DATA_URL,
      isGuest: true,
      rememberMe: false,
    };
    sounds.playLaunch();
    onSignIn(guestProfile);
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
  const years = Array.from({ length: 45 }, (_, i) => String(2024 - i));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 select-none overflow-y-auto bg-black font-sans">
      {/* Background Tiled Grid of Game Images */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 transform -rotate-6 scale-110 -translate-y-12">
          {Array.from({ length: 48 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl overflow-hidden bg-slate-900 border border-slate-800/80 shadow-2xl"
            >
              <img
                src={bgThumbnails[i % bgThumbnails.length]}
                alt=""
                className="w-full h-full object-cover filter brightness-75"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dark Vignette Overlay */}
      <div className="absolute inset-0 bg-radial from-black/60 via-black/85 to-black pointer-events-none" />

      {/* Top Right "Log In" / "Sign Up" Mode Switcher */}
      <div className="absolute top-5 right-6 z-20">
        <button
          onClick={() => {
            sounds.playSelect();
            setIsLoginMode(!isLoginMode);
            setErrorMessage(null);
          }}
          className="px-6 py-2 bg-white hover:bg-slate-100 text-black text-sm font-bold rounded-lg shadow-xl transition-all active:scale-95 cursor-pointer"
        >
          {isLoginMode ? 'Sign Up' : 'Log In'}
        </button>
      </div>

      {/* Central Signup / Login Card */}
      <div className="relative z-10 w-full max-w-[430px] my-auto flex flex-col items-center">
        {/* Wordmark Logo */}
        <div className="mb-4">
          <AtlasLogo size="xl" />
        </div>

        {/* The Card */}
        <div className="w-full bg-[#232527]/95 backdrop-blur-md rounded-xl p-6 sm:p-7 border border-[#393b3d]/60 shadow-[0_20px_50px_rgba(0,0,0,0.9)] text-white">
          <h2 className="text-center font-black tracking-wider text-sm sm:text-base uppercase text-white mb-4">
            {isLoginMode ? 'LOG IN TO ATLAS' : 'SIGN UP AND START HAVING FUN!'}
          </h2>

          {/* Success Message */}
          {successNotice && (
            <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-700/60 rounded-xl flex items-center gap-2.5 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-700/60 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick Saved Accounts Selector & Deletion Controls */}
          {savedAccounts.length > 0 && (
            <div className="mb-4 p-3 bg-[#17191e] rounded-xl border border-slate-700/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Saved Accounts on this Device ({savedAccounts.length}):
                </span>
                <button
                  type="button"
                  onClick={() => setShowPurgeConfirm(true)}
                  className="text-[10px] text-red-400 hover:text-red-300 font-bold cursor-pointer flex items-center gap-1 transition-colors"
                  title="Purge all test accounts from network and device"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete All Test Accounts</span>
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {savedAccounts.map((acc) => (
                  <div
                    key={acc.username}
                    className="flex items-center bg-[#252a36] rounded-lg border border-slate-700 overflow-hidden shrink-0 group"
                  >
                    <button
                      type="button"
                      onClick={() => handleQuickAccountPick(acc)}
                      className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-[#30384a] text-xs text-white cursor-pointer transition-colors"
                      title={`Click to log in as ${acc.username}`}
                    >
                      <div className="w-4 h-4 rounded-full overflow-hidden bg-black shrink-0">
                        <img src={acc.gamerpic} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className="font-bold truncate max-w-[85px]">{acc.username}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAccountToDelete(acc);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/40 border-l border-slate-700/80 transition-colors cursor-pointer"
                      title={`Permanently delete account ${acc.username}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Single Account Deletion Confirmation Modal */}
          {accountToDelete && (
            <div className="mb-4 p-3.5 bg-red-950/70 border border-red-700/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-200">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Delete Account "@{accountToDelete.username}"?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAccountToDelete(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-red-300/90 leading-tight">
                This will permanently delete "@{accountToDelete.username}" from the Atlas cloud network, unfriend all connections, and erase saved login data.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setAccountToDelete(null)}
                  className="px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white bg-[#202534] rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleDeleteAccount(accountToDelete)}
                  className="px-3 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  <span>Confirm Delete</span>
                </button>
              </div>
            </div>
          )}

          {/* Purge All Test Accounts Confirmation Modal */}
          {showPurgeConfirm && (
            <div className="mb-4 p-3.5 bg-red-950/70 border border-red-700/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-200">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Purge All Test Accounts on Network?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPurgeConfirm(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-red-300/90 leading-tight">
                Are you sure you want to delete all test accounts created for the friend system? This wipes all test accounts and friend records on the Atlas network.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowPurgeConfirm(false)}
                  className="px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white bg-[#202534] rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handlePurgeAllTestAccounts}
                  className="px-3 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  <span>Yes, Delete All Test Accounts</span>
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Birthday Section (Sign up only) - MANDATORY */}
            {!isLoginMode && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-200">
                    Birthday <span className="text-red-400 font-bold">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Required</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {/* Month */}
                  <div className="relative">
                    <select
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      className="w-full bg-[#111215] text-xs font-medium text-slate-200 py-2.5 px-2.5 rounded-lg border border-[#3b3d42] appearance-none focus:outline-none focus:border-[#00A2FF]"
                    >
                      <option disabled value="Month">Month</option>
                      {months.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                  </div>

                  {/* Day */}
                  <div className="relative">
                    <select
                      value={day}
                      onChange={(e) => setDay(e.target.value)}
                      className="w-full bg-[#111215] text-xs font-medium text-slate-200 py-2.5 px-2.5 rounded-lg border border-[#3b3d42] appearance-none focus:outline-none focus:border-[#00A2FF]"
                    >
                      <option disabled value="Day">Day</option>
                      {days.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                  </div>

                  {/* Year */}
                  <div className="relative">
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full bg-[#111215] text-xs font-medium text-slate-200 py-2.5 px-2.5 rounded-lg border border-[#3b3d42] appearance-none focus:outline-none focus:border-[#00A2FF]"
                    >
                      <option disabled value="Year">Year</option>
                      {years.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                  </div>
                </div>
              </div>
            )}

            {/* Username */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Username {!isLoginMode && <span className="text-red-400 font-bold">*</span>}
                </label>
                {!isLoginMode && (
                  <span className="text-[10px] text-slate-400">3-20 characters, no spaces</span>
                )}
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrorMessage(null);
                  setSuccessNotice(null);
                }}
                placeholder={isLoginMode ? "Enter your username" : "Unique Atlas gamertag"}
                className="w-full bg-[#111215] text-white text-xs py-2.5 px-3.5 rounded-lg border border-[#3b3d42] placeholder-[#666a73] focus:outline-none focus:border-[#00A2FF]"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-200">
                  Password {!isLoginMode && <span className="text-red-400 font-bold">*</span>}
                </label>
                {!isLoginMode && (
                  <span className="text-[10px] text-slate-400">4+ characters</span>
                )}
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage(null);
                  setSuccessNotice(null);
                }}
                placeholder="At least 4 characters"
                className="w-full bg-[#111215] text-white text-xs py-2.5 px-3.5 rounded-lg border border-[#3b3d42] placeholder-[#666a73] focus:outline-none focus:border-[#00A2FF]"
              />
            </div>

            {/* Custom Profile Image Upload (Sign up only) */}
            {!isLoginMode && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-200">
                    Profile Picture
                  </label>
                  <span className="text-[10px] text-slate-400">Optional</span>
                </div>
                <div className="flex items-center gap-3 bg-[#111215] p-2.5 rounded-lg border border-[#3b3d42]">
                  {/* Live Preview */}
                  <div className="w-11 h-11 rounded-lg overflow-hidden bg-black border border-slate-700 shrink-0 flex items-center justify-center">
                    <img
                      src={customImage || MISSING_TEXTURE_DATA_URL}
                      alt="Uploaded avatar preview"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Upload action */}
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#242b38] hover:bg-[#30394a] text-slate-200 text-xs font-semibold rounded-md border border-slate-600 transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{customImage ? 'Change Image' : 'Upload Custom Image'}</span>
                    </button>
                    <p className="text-[10px] text-slate-400 mt-1 truncate">
                      {customImage ? 'Custom image loaded!' : 'Default: Missing Texture (purple/black)'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Gender Selection (Sign up only) */}
            {!isLoginMode && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Gender
                  </label>
                  <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playSelect();
                      setGender(gender === 'female' ? null : 'female');
                    }}
                    className={`py-2 flex items-center justify-center rounded-lg border transition-all cursor-pointer ${
                      gender === 'female'
                        ? 'bg-[#2b303d] border-[#00A2FF] text-white shadow-inner'
                        : 'bg-[#111215] border-[#3b3d42] text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="text-lg leading-none">♀</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sounds.playSelect();
                      setGender(gender === 'male' ? null : 'male');
                    }}
                    className={`py-2 flex items-center justify-center rounded-lg border transition-all cursor-pointer ${
                      gender === 'male'
                        ? 'bg-[#2b303d] border-[#00A2FF] text-white shadow-inner'
                        : 'bg-[#111215] border-[#3b3d42] text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="text-lg leading-none">♂</span>
                  </button>
                </div>
              </div>
            )}

            {/* Remember Me / Save Account on this device (User requirement) */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="rememberAccount"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded bg-[#111215] border-[#3b3d42] text-[#00A2FF] focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <label htmlFor="rememberAccount" className="text-xs text-slate-300 cursor-pointer">
                Save my account (stay signed in)
              </label>
            </div>

            {/* Terms and Privacy Text */}
            <p className="text-[10px] text-[#9b9fa8] leading-tight pt-1">
              By clicking {isLoginMode ? 'Log In' : 'Sign Up'}, you are agreeing to the{' '}
              <span className="text-[#00A2FF] hover:underline cursor-pointer">Terms of Use</span>{' '}
              including the arbitration clause and you are acknowledging the{' '}
              <span className="text-[#00A2FF] hover:underline cursor-pointer">Privacy Policy</span>
            </p>

            {/* Big White Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-white hover:bg-slate-100 disabled:bg-slate-300 text-black text-sm font-black uppercase rounded-lg shadow-xl transition-all active:scale-98 cursor-pointer disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>{isLoginMode ? 'Signing In...' : 'Creating Account...'}</span>
                </>
              ) : (
                <span>{isLoginMode ? 'Log In' : 'Sign Up'}</span>
              )}
            </button>
          </form>

          {/* Quick guest option & mode toggle */}
          <div className="mt-4 pt-3 border-t border-[#34373d] flex items-center justify-between text-xs text-slate-400">
            <button
              onClick={() => {
                setIsLoginMode(!isLoginMode);
                setErrorMessage(null);
              }}
              className="hover:text-white transition-colors cursor-pointer"
            >
              {isLoginMode ? 'New to Atlas? Sign Up' : 'Already have an account? Log In'}
            </button>

            <button
              onClick={handleQuickGuest}
              className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors cursor-pointer"
            >
              Instant Guest Play ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
