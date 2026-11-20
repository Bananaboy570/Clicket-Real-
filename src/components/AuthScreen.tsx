import React, { useState, useRef } from 'react';
import { Mail, Lock, User, Eye, EyeOff, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import { BlookArt, BlooketTokenIcon } from './BlookArt';
import { signInWithGooglePopup } from '../firebase';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  verified: boolean;
  tokens: number;
  inventory: Record<string, number>;
  clickUpgradeLevel: number;
  bestDailyClicks: number;
  equippedBlookId: string;
  lastDailyPlayAt?: number | null;
  lastWheelSpinAt?: number | null;
}

interface AuthScreenProps {
  onAuthenticated: (user: AuthenticatedUser, sessionToken: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'SIGNUP' | 'LOGIN' | 'VERIFY' | 'FORGOT' | 'RESET'>('SIGNUP');

  // Form fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Verification state
  const [pendingEmail, setPendingEmail] = useState('');
  const [codeDigits, setCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [deliveryMode, setDeliveryMode] = useState<'email' | 'preview'>('email');
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [deliveryReason, setDeliveryReason] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resetCodeInput, setResetCodeInput] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [retypeResetPassword, setRetypeResetPassword] = useState('');

  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  const handleGoogleLogin = async () => {
    setError(null);
    setStatusMessage(null);
    setLoading(true);
    try {
      const gResult = await signInWithGooglePopup();
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: gResult.idToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Google login failed.');
        return;
      }
      onAuthenticated(data.user, data.sessionToken);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in popup was closed.');
      } else if (err?.code === 'auth/popup-blocked') {
        setError('Popup blocked—please allow popups in your browser to sign in with Google.');
      } else {
        setError(err?.message || 'Could not sign in with Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send reset email.');
        return;
      }

      setPendingEmail(data.email);
      setDeliveryMode(data.deliveryMode || 'preview');
      setPreviewCode(data.previewCode || null);
      setDeliveryReason(data.deliveryReason || null);
      setResetCodeInput('');
      setNewResetPassword('');
      setRetypeResetPassword('');
      setMode('RESET');
      if (data.deliveryMode === 'email') {
        setStatusMessage(`A 6-digit password reset code was sent to ${data.email}.`);
      } else {
        setStatusMessage(null);
      }
    } catch {
      setError('Network error while requesting password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    if (resetCodeInput.trim().length !== 6) {
      setError('Please enter the 6-digit reset code.');
      return;
    }
    if (newResetPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newResetPassword !== retypeResetPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingEmail,
          code: resetCodeInput.trim(),
          newPassword: newResetPassword,
          retypePassword: retypeResetPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to reset password.');
        return;
      }
      onAuthenticated(data.user, data.sessionToken);
    } catch {
      setError('Network error while resetting password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    if (username.trim().length < 2) {
      setError('Username must be at least 2 characters.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== retypePassword) {
      setError('Password and Retype Password do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password,
          retypePassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Sign up failed.');
        return;
      }

      setPendingEmail(data.email);
      setDeliveryMode(data.deliveryMode || 'preview');
      setPreviewCode(data.previewCode || null);
      setDeliveryReason(data.deliveryReason || null);
      setCodeDigits(['', '', '', '', '', '']);
      setMode('VERIFY');
      if (data.deliveryMode === 'email') {
        setStatusMessage(`A 6-digit verification code was sent to ${data.email}. Check your inbox or spam folder.`);
      } else {
        setStatusMessage(null);
      }
    } catch {
      setError('Network error while creating account.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed.');
        return;
      }

      if (data.requiresVerification) {
        setPendingEmail(data.email);
        setDeliveryMode(data.deliveryMode || 'preview');
        setPreviewCode(data.previewCode || null);
        setDeliveryReason(data.deliveryReason || null);
        setCodeDigits(['', '', '', '', '', '']);
        setMode('VERIFY');
        if (data.deliveryMode === 'email') {
          setStatusMessage(`Please verify your email. A 6-digit code was sent to ${data.email}.`);
        } else {
          setStatusMessage(null);
        }
        return;
      }

      onAuthenticated(data.user, data.sessionToken);
    } catch {
      setError('Network error while logging in.');
    } finally {
      setLoading(false);
    }
  };

  const submitVerificationCode = async (codeOverride?: string) => {
    const fullCode = codeOverride ?? codeDigits.join('');
    if (fullCode.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingEmail,
          code: fullCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid verification code.');
        return;
      }

      onAuthenticated(data.user, data.sessionToken);
    } catch {
      setError('Network error while verifying code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setStatusMessage(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to resend code.');
        return;
      }
      setDeliveryMode(data.deliveryMode || 'preview');
      setPreviewCode(data.previewCode || null);
      setDeliveryReason(data.deliveryReason || null);
      if (data.deliveryMode === 'email') {
        setStatusMessage(`A new 6-digit verification code was sent to ${pendingEmail}.`);
      } else {
        setStatusMessage('Generated a new 6-digit verification code below.');
      }
    } catch {
      setError('Network error while resending code.');
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const updated = [...codeDigits];
      updated[index] = '';
      setCodeDigits(updated);
      return;
    }

    // Handle paste of multiple digits
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 6).split('');
      const updated = ['', '', '', '', '', ''];
      chars.forEach((ch, idx) => {
        updated[idx] = ch;
      });
      setCodeDigits(updated);
      const nextFocus = Math.min(chars.length, 5);
      digitRefs.current[nextFocus]?.focus();
      if (chars.length === 6) {
        submitVerificationCode(updated.join(''));
      }
      return;
    }

    const updated = [...codeDigits];
    updated[index] = cleaned;
    setCodeDigits(updated);

    if (index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="min-h-screen w-screen bg-[#18a4e0] flex flex-col items-center justify-center p-4 relative overflow-y-auto select-none">
      {/* Subtle Checkered Background Pattern */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.09]"
        style={{
          backgroundImage: `radial-gradient(rgba(255,255,255,0.6) 2px, transparent 2px), linear-gradient(15deg, rgba(255,255,255,0.22) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.22) 75%, transparent 75%, transparent)`,
          backgroundSize: '110px 110px',
        }}
      />

      {/* Top Purple Bar with Clicket Logo */}
      <div className="fixed top-0 inset-x-0 h-16 bg-[#933da8] shadow-[0_4px_15px_rgba(0,0,0,0.18)] flex items-center justify-between px-6 z-20">
        <span className="font-titan text-white text-3xl tracking-wide drop-shadow-[0_2px_0_rgba(0,0,0,0.2)]">
          Clicket
        </span>
        <div className="flex items-center gap-2 text-white/90 font-nunito font-extrabold text-sm">
          <BlooketTokenIcon className="w-5 h-5" />
          <span>Circus Pack Edition</span>
        </div>
      </div>

      {/* Main Auth Container */}
      <div className="relative z-10 w-full max-w-md mt-16">
        {/* Decorative Blooks Peeking Above Card */}
        <div className="flex items-end justify-center gap-4 -mb-4 relative z-20 pointer-events-none">
          <div className="w-16 h-16 -rotate-12 drop-shadow-md">
            <BlookArt id="tightrope-walker" className="w-full h-full" />
          </div>
          <div className="w-20 h-20 drop-shadow-lg">
            <BlookArt id="jester" className="w-full h-full" />
          </div>
          <div className="w-16 h-16 rotate-12 drop-shadow-md">
            <BlookArt id="magician" className="w-full h-full" />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-7 shadow-[0_10px_0_rgba(0,0,0,0.18)] border-4 border-[#933da8]/20">
          {(mode === 'SIGNUP' || mode === 'LOGIN') && (
            <>
              {/* Segmented Sign Up / Log In Switch */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('SIGNUP');
                    setError(null);
                    setStatusMessage(null);
                  }}
                  className={`py-2.5 rounded-xl font-titan text-lg transition-all cursor-pointer ${
                    mode === 'SIGNUP'
                      ? 'bg-[#933da8] text-white shadow-[0_3px_0_#6b277d]'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Sign Up
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('LOGIN');
                    setError(null);
                    setStatusMessage(null);
                  }}
                  className={`py-2.5 rounded-xl font-titan text-lg transition-all cursor-pointer ${
                    mode === 'LOGIN'
                      ? 'bg-[#933da8] text-white shadow-[0_3px_0_#6b277d]'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Log In
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-rose-50 border-2 border-rose-200 text-rose-700 font-nunito font-extrabold text-sm">
              {error}
            </div>
          )}

          {statusMessage && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-nunito font-extrabold text-sm">
              {statusMessage}
            </div>
          )}

          {/* SIGN UP FORM */}
          {mode === 'SIGNUP' && (
            <form onSubmit={handleSignUp} className="flex flex-col gap-3.5">
              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  USERNAME
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={18}
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-slate-200 font-nunito font-bold text-slate-800 focus:outline-none focus:border-[#933da8]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  EMAIL
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-slate-200 font-nunito font-bold text-slate-800 focus:outline-none focus:border-[#933da8]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  PASSWORD
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border-2 border-slate-200 font-nunito font-bold text-slate-800 focus:outline-none focus:border-[#933da8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  RETYPE PASSWORD
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={retypePassword}
                    onChange={(e) => setRetypePassword(e.target.value)}
                    placeholder="Retype your password"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border-2 font-nunito font-bold text-slate-800 focus:outline-none ${
                      retypePassword && retypePassword !== password
                        ? 'border-rose-300 focus:border-rose-500'
                        : 'border-slate-200 focus:border-[#933da8]'
                    }`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full py-3 rounded-2xl bg-[#00c2cb] hover:brightness-105 active:translate-y-0.5 active:shadow-none shadow-[0_5px_0_#008b94] text-white font-titan text-xl tracking-wide cursor-pointer transition-all disabled:opacity-60"
              >
                {loading ? 'Sending Code...' : 'Sign Up & Send Code'}
              </button>
            </form>
          )}

          {/* LOG IN FORM */}
          {mode === 'LOGIN' && (
            <form onSubmit={handleLogIn} className="flex flex-col gap-4">
              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  EMAIL
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-slate-200 font-nunito font-bold text-slate-800 focus:outline-none focus:border-[#933da8]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  PASSWORD
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border-2 border-slate-200 font-nunito font-bold text-slate-800 focus:outline-none focus:border-[#933da8]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end -mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('FORGOT');
                    setError(null);
                    setStatusMessage(null);
                  }}
                  className="text-xs font-nunito font-extrabold text-[#933da8] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full py-3 rounded-2xl bg-[#00c2cb] hover:brightness-105 active:translate-y-0.5 active:shadow-none shadow-[0_5px_0_#008b94] text-white font-titan text-xl tracking-wide cursor-pointer transition-all disabled:opacity-60"
              >
                {loading ? 'Logging In...' : 'Log In to Clicket'}
              </button>
            </form>
          )}

          {(mode === 'SIGNUP' || mode === 'LOGIN') && (
            <div className="mt-5">
              <div className="relative flex items-center justify-center mb-4">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-xs font-nunito font-extrabold text-slate-400">
                  OR
                </span>
                <div className="border-t border-slate-200 w-full" />
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleLogin}
                className="w-full py-2.5 px-4 rounded-2xl bg-white hover:bg-slate-50 border-2 border-slate-200 shadow-[0_4px_0_#cbd5e1] active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-3 font-nunito font-black text-slate-700 text-base cursor-pointer transition-all disabled:opacity-60"
              >
                <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>Log in with Google</span>
              </button>
            </div>
          )}

          {/* FORGOT PASSWORD - ENTER EMAIL */}
          {mode === 'FORGOT' && (
            <form onSubmit={handleRequestPasswordReset} className="flex flex-col gap-4">
              <div className="text-center mb-1">
                <h2 className="font-titan text-2xl text-[#933da8]">Reset Password</h2>
                <p className="font-nunito font-bold text-xs text-slate-500 mt-1">
                  Enter your account email and we will send a 6-digit reset code.
                </p>
              </div>
              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  ACCOUNT EMAIL
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-slate-200 font-nunito font-bold text-slate-800 focus:outline-none focus:border-[#933da8]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-2xl bg-[#00c2cb] hover:brightness-105 active:translate-y-0.5 active:shadow-none shadow-[0_5px_0_#008b94] text-white font-titan text-xl tracking-wide cursor-pointer transition-all disabled:opacity-60"
              >
                {loading ? 'Sending Reset Code...' : 'Send Reset Email'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('LOGIN');
                  setError(null);
                  setStatusMessage(null);
                }}
                className="text-xs font-nunito font-extrabold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Log In</span>
              </button>
            </form>
          )}

          {/* RESET PASSWORD - ENTER 6-DIGIT CODE & NEW PASSWORD */}
          {mode === 'RESET' && (
            <form onSubmit={handleConfirmPasswordReset} className="flex flex-col gap-3.5">
              <div className="text-center">
                <h2 className="font-titan text-2xl text-[#933da8]">Create New Password</h2>
                <p className="font-nunito font-bold text-xs text-slate-500 mt-1">
                  Enter the 6-digit code for <span className="text-slate-900 font-black">{pendingEmail}</span>
                </p>
              </div>

              {deliveryMode === 'preview' && previewCode && (
                <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 p-3 text-left">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-nunito font-black text-xs text-amber-900">
                      Your 6-Digit Reset Code
                    </span>
                    <button
                      type="button"
                      onClick={() => setResetCodeInput(previewCode)}
                      className="px-2.5 py-1 rounded-lg bg-[#933da8] text-white text-[11px] font-nunito font-black cursor-pointer"
                    >
                      Auto-fill Code
                    </button>
                  </div>
                  <p className="font-titan text-2xl tracking-[0.25em] text-slate-900">
                    {previewCode}
                  </p>
                  <p className="font-nunito font-bold text-[11px] text-amber-800 leading-snug mt-0.5">
                    {deliveryReason || 'Email preview mode:'} enter this code below.
                  </p>
                </div>
              )}

              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  6-DIGIT RESET CODE
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={resetCodeInput}
                  onChange={(e) => setResetCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 font-titan text-xl tracking-[0.25em] text-center text-slate-800 focus:outline-none focus:border-[#933da8]"
                />
              </div>

              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  NEW PASSWORD
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newResetPassword}
                  onChange={(e) => setNewResetPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 font-nunito font-bold text-slate-800 focus:outline-none focus:border-[#933da8]"
                />
              </div>

              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  RETYPE NEW PASSWORD
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={retypeResetPassword}
                  onChange={(e) => setRetypeResetPassword(e.target.value)}
                  placeholder="Retype new password"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 font-nunito font-bold text-slate-800 focus:outline-none focus:border-[#933da8]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full py-3 rounded-2xl bg-[#00c2cb] hover:brightness-105 active:translate-y-0.5 active:shadow-none shadow-[0_5px_0_#008b94] text-white font-titan text-xl tracking-wide cursor-pointer transition-all disabled:opacity-60"
              >
                {loading ? 'Updating Password...' : 'Save New Password & Log In'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('LOGIN');
                  setError(null);
                  setStatusMessage(null);
                }}
                className="text-xs font-nunito font-extrabold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Log In</span>
              </button>
            </form>
          )}

          {/* 6-DIGIT EMAIL VERIFICATION SCREEN */}
          {mode === 'VERIFY' && (
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-[#933da8] flex items-center justify-center mb-3">
                <Mail className="w-6 h-6" />
              </div>
              <h2 className="font-titan text-2xl text-[#933da8] mb-1">
                Verify Your Email
              </h2>
              <p className="font-nunito font-bold text-sm text-slate-600 mb-4">
                {deliveryMode === 'email' ? (
                  <>
                    Enter the 6-digit verification code sent to{' '}
                    <span className="text-slate-900 font-black">{pendingEmail}</span>
                  </>
                ) : (
                  <>
                    Enter the 6-digit verification code for{' '}
                    <span className="text-slate-900 font-black">{pendingEmail}</span>
                  </>
                )}
              </p>

              {/* Prominent In-App Code Card when real email sending isn't configured */}
              {deliveryMode === 'preview' && previewCode && (
                <div className="mb-4 w-full rounded-2xl bg-amber-50 border-2 border-amber-300 p-3.5 text-left">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-nunito font-black text-xs text-amber-900">
                      Your 6-Digit Verification Code
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const chars = previewCode.split('');
                        setCodeDigits(chars);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#933da8] text-white text-[11px] font-nunito font-black hover:brightness-110 cursor-pointer"
                    >
                      Auto-fill Code
                    </button>
                  </div>
                  <p className="font-titan text-3xl tracking-[0.28em] text-slate-900 my-1">
                    {previewCode}
                  </p>
                  <p className="font-nunito font-bold text-[11px] text-amber-800 leading-snug">
                    {deliveryReason || 'No live email service is connected yet,'} so the code is shown directly here instead of your inbox.
                  </p>
                </div>
              )}

              {/* 6-Digit Input Boxes */}
              <div className="flex items-center justify-center gap-2 mb-5">
                {codeDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      digitRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                    aria-label={`Verification digit ${idx + 1}`}
                    className="w-11 h-14 text-center rounded-xl border-2 border-slate-300 font-titan text-2xl text-slate-900 focus:outline-none focus:border-[#933da8] focus:ring-2 focus:ring-purple-200 bg-slate-50"
                  />
                ))}
              </div>

              <button
                type="button"
                disabled={loading || codeDigits.join('').length !== 6}
                onClick={() => submitVerificationCode()}
                className="w-full py-3 rounded-2xl bg-[#00c2cb] hover:brightness-105 active:translate-y-0.5 active:shadow-none shadow-[0_5px_0_#008b94] text-white font-titan text-xl tracking-wide cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>{loading ? 'Verifying...' : 'Verify & Enter Clicket'}</span>
              </button>

              <div className="w-full flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setMode('SIGNUP');
                    setError(null);
                    setStatusMessage(null);
                  }}
                  className="text-xs font-nunito font-extrabold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Change Email</span>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleResendCode}
                  className="text-xs font-nunito font-extrabold text-[#933da8] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Resend 6-Digit Code</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
