import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import { attachMultiplayerServer } from './serverMultiplayer';

dotenv.config();

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'clicket-db.json');

interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  verified: boolean;
  verificationCode: string | null;
  codeExpiresAt: number | null;
  resetCode?: string | null;
  resetCodeExpiresAt?: number | null;
  tokens: number;
  inventory: Record<string, number>;
  clickUpgradeLevel: number;
  bestDailyClicks: number;
  equippedBlookId: string;
  lastDailyPlayAt?: number | null;
  lastWheelSpinAt?: number | null;
  createdAt: string;
}

interface SetPlayStats {
  totalPlays: number;
  uniquePlayerIds: string[];
}

interface DatabaseSchema {
  users: Record<string, StoredUser>; // keyed by lowercased email
  sessions: Record<string, string>; // sessionToken -> lowercased email
  setStats?: Record<string, SetPlayStats>;
}

let dbCache: DatabaseSchema | null = null;

async function loadDb(): Promise<DatabaseSchema> {
  if (dbCache) return dbCache;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DatabaseSchema;
    if (!parsed.setStats) parsed.setStats = {};
    dbCache = parsed;
  } catch {
    dbCache = { users: {}, sessions: {}, setStats: {} };
    await saveDb(dbCache);
  }
  return dbCache;
}

async function saveDb(db: DatabaseSchema): Promise<void> {
  dbCache = db;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function generateSixDigitCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

function sanitizeUser(u: StoredUser) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    verified: u.verified,
    tokens: u.tokens,
    inventory: u.inventory,
    clickUpgradeLevel: u.clickUpgradeLevel,
    bestDailyClicks: u.bestDailyClicks,
    equippedBlookId: u.equippedBlookId,
    lastDailyPlayAt: u.lastDailyPlayAt ?? null,
    lastWheelSpinAt: u.lastWheelSpinAt ?? null,
  };
}

const DEFAULT_RESEND_FROM = 'Clicket <onboarding@resend.dev>';

function resolveFromEmail(): string {
  const configured = process.env.RESEND_FROM_EMAIL?.trim() || '';
  if (
    !configured ||
    /yourdomain\.com|example\.com|your-domain/i.test(configured)
  ) {
    return DEFAULT_RESEND_FROM;
  }
  return configured;
}

async function sendViaResend(
  resendApiKey: string,
  fromEmail: string,
  toEmail: string,
  username: string,
  code: string,
  kind: 'verify' | 'reset' = 'verify'
): Promise<{ ok: boolean; status: number; errText: string }> {
  const isReset = kind === 'reset';
  const subject = isReset
    ? `Your Clicket Password Reset Code: ${code}`
    : `Your Clicket Verification Code: ${code}`;
  const heading = isReset ? 'Clicket Password Reset' : 'Clicket Verification';
  const bodyCopy = isReset
    ? 'Enter this 6-digit password reset code to choose a new password for your Clicket account:'
    : 'Enter this 6-digit verification code to unlock your Clicket account:';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border-radius: 16px; background: #f8fafc; border: 2px solid #933da8;">
          <h1 style="color: #933da8; margin: 0 0 12px;">${heading}</h1>
          <p style="color: #334155; font-size: 15px;">Hi <strong>${username}</strong>,</p>
          <p style="color: #334155; font-size: 15px;">${bodyCopy}</p>
          <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #0f172a; background: #ffffff; padding: 16px; text-align: center; border-radius: 12px; border: 2px dashed #18a4e0; margin: 20px 0;">
            ${code}
          </div>
          <p style="color: #64748b; font-size: 12px;">This code expires in 10 minutes.</p>
        </div>
      `,
    }),
  });

  if (response.ok) {
    return { ok: true, status: response.status, errText: '' };
  }
  return { ok: false, status: response.status, errText: await response.text() };
}

async function dispatchVerificationEmail(
  toEmail: string,
  username: string,
  code: string,
  kind: 'verify' | 'reset' = 'verify'
): Promise<{ deliveryMode: 'email' | 'preview'; previewCode?: string; deliveryReason?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const primaryFrom = resolveFromEmail();

  if (resendApiKey) {
    try {
      let attempt = await sendViaResend(resendApiKey, primaryFrom, toEmail, username, code, kind);

      // If a custom RESEND_FROM_EMAIL domain isn't verified yet, retry with Resend's default sender
      if (!attempt.ok && attempt.status === 403 && primaryFrom !== DEFAULT_RESEND_FROM) {
        console.warn(`Custom sender "${primaryFrom}" is not verified on Resend; retrying with ${DEFAULT_RESEND_FROM}.`);
        attempt = await sendViaResend(resendApiKey, DEFAULT_RESEND_FROM, toEmail, username, code, kind);
      }

      if (attempt.ok) {
        return { deliveryMode: 'email' };
      }

      console.warn('Resend fell back to in-app preview:', attempt.errText);
      return {
        deliveryMode: 'preview',
        previewCode: code,
        deliveryReason:
          'Resend free testing mode only delivers directly to your own Resend account email without a verified domain,',
      };
    } catch (err) {
      console.warn('Could not reach Resend API, using in-app preview:', err);
      return {
        deliveryMode: 'preview',
        previewCode: code,
        deliveryReason: 'Could not reach the email provider,',
      };
    }
  }

  console.log(`[Clicket Email (${kind})] To: ${toEmail} | Code: ${code}`);
  return {
    deliveryMode: 'preview',
    previewCode: code,
    deliveryReason: 'No email API key (RESEND_API_KEY) is configured on the server,',
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Sign Up: Username, Email, Password, Retype Password -> send 6-digit code
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { username, email, password, retypePassword } = req.body ?? {};

      const cleanUsername = String(username || '').trim();
      const cleanEmail = String(email || '').trim().toLowerCase();
      const rawPassword = String(password || '');
      const rawRetype = String(retypePassword || '');

      if (cleanUsername.length < 2 || cleanUsername.length > 18) {
        res.status(400).json({ error: 'Username must be between 2 and 18 characters.' });
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }

      if (rawPassword.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }

      if (rawPassword !== rawRetype) {
        res.status(400).json({ error: 'Passwords do not match.' });
        return;
      }

      const db = await loadDb();
      const existing = db.users[cleanEmail];
      if (existing && existing.verified) {
        res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
        return;
      }

      const code = generateSixDigitCode();
      const expiresAt = Date.now() + 10 * 60 * 1000;

      const user: StoredUser = {
        id: existing?.id || crypto.randomUUID(),
        username: cleanUsername,
        email: cleanEmail,
        passwordHash: hashPassword(rawPassword),
        verified: false,
        verificationCode: code,
        codeExpiresAt: expiresAt,
        tokens: existing?.tokens ?? 20,
        inventory: existing?.inventory ?? {},
        clickUpgradeLevel: existing?.clickUpgradeLevel ?? 0,
        bestDailyClicks: existing?.bestDailyClicks ?? 0,
        equippedBlookId: existing?.equippedBlookId ?? 'tightrope-walker',
        createdAt: existing?.createdAt || new Date().toISOString(),
      };

      db.users[cleanEmail] = user;
      await saveDb(db);

      const delivery = await dispatchVerificationEmail(cleanEmail, cleanUsername, code);
      res.json({
        ok: true,
        email: cleanEmail,
        username: cleanUsername,
        deliveryMode: delivery.deliveryMode,
        previewCode: delivery.previewCode,
        deliveryReason: delivery.deliveryReason,
      });
    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).json({ error: 'Failed to create account.' });
    }
  });

  // Resend 6-digit verification code
  app.post('/api/auth/resend', async (req, res) => {
    try {
      const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
      const db = await loadDb();
      const user = db.users[cleanEmail];

      if (!user) {
        res.status(404).json({ error: 'No pending account found for this email.' });
        return;
      }

      const code = generateSixDigitCode();
      user.verificationCode = code;
      user.codeExpiresAt = Date.now() + 10 * 60 * 1000;
      await saveDb(db);

      const delivery = await dispatchVerificationEmail(cleanEmail, user.username, code);
      res.json({
        ok: true,
        email: cleanEmail,
        deliveryMode: delivery.deliveryMode,
        previewCode: delivery.previewCode,
        deliveryReason: delivery.deliveryReason,
      });
    } catch (err) {
      console.error('Resend error:', err);
      res.status(500).json({ error: 'Failed to resend verification code.' });
    }
  });

  // Verify 6-digit code
  app.post('/api/auth/verify', async (req, res) => {
    try {
      const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
      const cleanCode = String(req.body?.code || '').trim();

      const db = await loadDb();
      const user = db.users[cleanEmail];

      if (!user) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }

      if (!user.verificationCode || !user.codeExpiresAt) {
        res.status(400).json({ error: 'No active verification code. Please resend a new code.' });
        return;
      }

      if (Date.now() > user.codeExpiresAt) {
        res.status(400).json({ error: 'Verification code expired. Please click Resend Code.' });
        return;
      }

      if (user.verificationCode !== cleanCode) {
        res.status(400).json({ error: 'Invalid 6-digit verification code.' });
        return;
      }

      user.verified = true;
      user.verificationCode = null;
      user.codeExpiresAt = null;

      const sessionToken = crypto.randomBytes(32).toString('hex');
      db.sessions[sessionToken] = cleanEmail;
      await saveDb(db);

      res.json({
        ok: true,
        sessionToken,
        user: sanitizeUser(user),
      });
    } catch (err) {
      console.error('Verify error:', err);
      res.status(500).json({ error: 'Verification failed.' });
    }
  });

  // Log In
  app.post('/api/auth/login', async (req, res) => {
    try {
      const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
      const rawPassword = String(req.body?.password || '');

      if (!cleanEmail || !rawPassword) {
        res.status(400).json({ error: 'Please enter both email and password.' });
        return;
      }

      const db = await loadDb();
      const user = db.users[cleanEmail];

      if (!user || !verifyPassword(rawPassword, user.passwordHash)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      if (!user.verified) {
        const code = generateSixDigitCode();
        user.verificationCode = code;
        user.codeExpiresAt = Date.now() + 10 * 60 * 1000;
        await saveDb(db);

        const delivery = await dispatchVerificationEmail(cleanEmail, user.username, code);
        res.json({
          requiresVerification: true,
          email: cleanEmail,
          username: user.username,
          deliveryMode: delivery.deliveryMode,
          previewCode: delivery.previewCode,
          deliveryReason: delivery.deliveryReason,
        });
        return;
      }

      const sessionToken = crypto.randomBytes(32).toString('hex');
      db.sessions[sessionToken] = cleanEmail;
      await saveDb(db);

      res.json({
        ok: true,
        sessionToken,
        user: sanitizeUser(user),
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed.' });
    }
  });

  // Log in / Sign up with Google (verifies Firebase ID token via Google Identity Toolkit)
  app.post('/api/auth/google', async (req, res) => {
    try {
      const idToken = String(req.body?.idToken || '').trim();
      if (!idToken) {
        res.status(400).json({ error: 'Missing Google sign-in token.' });
        return;
      }

      let firebaseApiKey = '';
      try {
        const cfgRaw = await fs.readFile(
          path.resolve(process.cwd(), 'firebase-applet-config.json'),
          'utf-8'
        );
        const cfg = JSON.parse(cfgRaw) as { apiKey?: string };
        firebaseApiKey = String(cfg.apiKey || '').trim();
      } catch {
        firebaseApiKey = '';
      }

      if (!firebaseApiKey) {
        res.status(500).json({ error: 'Firebase configuration missing on server.' });
        return;
      }

      const verifyRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );

      if (!verifyRes.ok) {
        res.status(401).json({ error: 'Google sign-in could not be verified.' });
        return;
      }

      const verifyData = (await verifyRes.json()) as {
        users?: Array<{ localId?: string; email?: string; displayName?: string }>;
      };
      const gUser = verifyData.users?.[0];
      const cleanEmail = String(gUser?.email || '').trim().toLowerCase();
      if (!cleanEmail) {
        res.status(400).json({ error: 'Google account did not provide an email address.' });
        return;
      }

      const db = await loadDb();
      let user = db.users[cleanEmail];
      if (!user) {
        const rawName = (gUser?.displayName || cleanEmail.split('@')[0] || 'Player').trim();
        const cleanName = rawName.slice(0, 18) || 'Player';
        user = {
          id: crypto.randomUUID(),
          username: cleanName,
          email: cleanEmail,
          passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
          verified: true,
          verificationCode: null,
          codeExpiresAt: null,
          tokens: 20,
          inventory: {},
          clickUpgradeLevel: 0,
          bestDailyClicks: 0,
          equippedBlookId: 'tightrope-walker',
          createdAt: new Date().toISOString(),
        };
        db.users[cleanEmail] = user;
      } else {
        user.verified = true;
        user.verificationCode = null;
        user.codeExpiresAt = null;
      }

      const sessionToken = crypto.randomBytes(32).toString('hex');
      db.sessions[sessionToken] = cleanEmail;
      await saveDb(db);

      res.json({
        ok: true,
        sessionToken,
        user: sanitizeUser(user),
      });
    } catch (err) {
      console.error('Google auth error:', err);
      res.status(500).json({ error: 'Google sign-in failed.' });
    }
  });

  // Check current session
  app.get('/api/auth/me', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const db = await loadDb();
      const email = db.sessions[token];
      const user = email ? db.users[email] : undefined;

      if (!user || !user.verified) {
        res.status(401).json({ error: 'Invalid session' });
        return;
      }

      res.json({ user: sanitizeUser(user) });
    } catch (err) {
      console.error('Auth me error:', err);
      res.status(500).json({ error: 'Failed to load user' });
    }
  });

  // Log out
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (token) {
        const db = await loadDb();
        delete db.sessions[token];
        await saveDb(db);
      }
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  });

  // Sync user game progress
  app.post('/api/user/sync', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const db = await loadDb();
      const email = db.sessions[token];
      const user = email ? db.users[email] : undefined;
      if (!user || !user.verified) {
        res.status(401).json({ error: 'Session not found' });
        return;
      }

      const {
        username,
        tokens,
        inventory,
        clickUpgradeLevel,
        bestDailyClicks,
        equippedBlookId,
        lastDailyPlayAt,
        lastWheelSpinAt,
      } = req.body ?? {};

      if (typeof username === 'string' && username.trim().length >= 1 && username.trim().length <= 18) {
        user.username = username.trim();
      }
      if (typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0) {
        user.tokens = Math.floor(tokens);
      }
      if (inventory && typeof inventory === 'object') {
        user.inventory = inventory as Record<string, number>;
      }
      if (typeof clickUpgradeLevel === 'number' && Number.isFinite(clickUpgradeLevel) && clickUpgradeLevel >= 0) {
        user.clickUpgradeLevel = Math.floor(clickUpgradeLevel);
      }
      if (typeof bestDailyClicks === 'number' && Number.isFinite(bestDailyClicks) && bestDailyClicks >= 0) {
        user.bestDailyClicks = Math.max(user.bestDailyClicks, Math.floor(bestDailyClicks));
      }
      if (typeof equippedBlookId === 'string' && equippedBlookId.trim()) {
        user.equippedBlookId = equippedBlookId.trim();
      }
      if (typeof lastDailyPlayAt === 'number' && Number.isFinite(lastDailyPlayAt) && lastDailyPlayAt > 0) {
        user.lastDailyPlayAt = Math.max(user.lastDailyPlayAt ?? 0, lastDailyPlayAt);
      }
      if (typeof lastWheelSpinAt === 'number' && Number.isFinite(lastWheelSpinAt) && lastWheelSpinAt > 0) {
        user.lastWheelSpinAt = Math.max(user.lastWheelSpinAt ?? 0, lastWheelSpinAt);
      }

      await saveDb(db);
      res.json({ ok: true, user: sanitizeUser(user) });
    } catch (err) {
      console.error('Sync error:', err);
      res.status(500).json({ error: 'Failed to sync progress' });
    }
  });

  // Forgot Password: send 6-digit reset code
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }

      const db = await loadDb();
      const user = db.users[cleanEmail];
      if (!user) {
        res.status(404).json({ error: 'No Clicket account found for that email.' });
        return;
      }

      const code = generateSixDigitCode();
      user.resetCode = code;
      user.resetCodeExpiresAt = Date.now() + 10 * 60 * 1000;
      await saveDb(db);

      const delivery = await dispatchVerificationEmail(cleanEmail, user.username, code, 'reset');
      res.json({
        ok: true,
        email: cleanEmail,
        deliveryMode: delivery.deliveryMode,
        previewCode: delivery.previewCode,
        deliveryReason: delivery.deliveryReason,
      });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Failed to send password reset email.' });
    }
  });

  // Reset Password with 6-digit code
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
      const cleanCode = String(req.body?.code || '').trim();
      const newPassword = String(req.body?.newPassword || '');
      const retypePassword = String(req.body?.retypePassword || '');

      if (newPassword.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters.' });
        return;
      }
      if (newPassword !== retypePassword) {
        res.status(400).json({ error: 'Passwords do not match.' });
        return;
      }

      const db = await loadDb();
      const user = db.users[cleanEmail];
      if (!user) {
        res.status(404).json({ error: 'Account not found.' });
        return;
      }

      if (!user.resetCode || !user.resetCodeExpiresAt) {
        res.status(400).json({ error: 'No active reset code. Request a new code first.' });
        return;
      }
      if (Date.now() > user.resetCodeExpiresAt) {
        res.status(400).json({ error: 'Reset code expired. Please request a new code.' });
        return;
      }
      if (user.resetCode !== cleanCode) {
        res.status(400).json({ error: 'Invalid 6-digit reset code.' });
        return;
      }

      user.passwordHash = hashPassword(newPassword);
      user.verified = true;
      user.resetCode = null;
      user.resetCodeExpiresAt = null;

      const sessionToken = crypto.randomBytes(32).toString('hex');
      db.sessions[sessionToken] = cleanEmail;
      await saveDb(db);

      res.json({
        ok: true,
        sessionToken,
        user: sanitizeUser(user),
      });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Failed to reset password.' });
    }
  });

  // Discover real unique player counts per trivia set
  const recordSetPlay = async (setId: string, userId?: string) => {
    const db = await loadDb();
    if (!db.setStats) db.setStats = {};
    const entry = db.setStats[setId] || { totalPlays: 0, uniquePlayerIds: [] };
    entry.totalPlays += 1;
    if (userId && !entry.uniquePlayerIds.includes(userId)) {
      entry.uniquePlayerIds.push(userId);
    }
    db.setStats[setId] = entry;
    await saveDb(db);
  };

  const awardUserTokens = async (userId: string, amount: number) => {
    if (!userId || amount <= 0) return;
    const db = await loadDb();
    const user = Object.values(db.users).find((u) => u.id === userId);
    if (!user) return;
    user.tokens += Math.floor(amount);
    await saveDb(db);
  };

  app.get('/api/sets/stats', async (_req, res) => {
    try {
      const db = await loadDb();
      const raw = db.setStats || {};
      const stats: Record<string, { uniquePlayers: number; totalPlays: number }> = {};
      for (const [id, s] of Object.entries(raw)) {
        stats[id] = {
          uniquePlayers: s.uniquePlayerIds.length,
          totalPlays: s.totalPlays,
        };
      }
      res.json({ stats });
    } catch {
      res.json({ stats: {} });
    }
  });

  app.post('/api/sets/:setId/play', async (req, res) => {
    try {
      const setId = String(req.params.setId || '').trim();
      if (!setId) {
        res.status(400).json({ error: 'Missing setId' });
        return;
      }

      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const db = await loadDb();
      const email = token ? db.sessions[token] : undefined;
      const user = email ? db.users[email] : undefined;

      await recordSetPlay(setId, user?.id);
      const entry = db.setStats?.[setId] || { totalPlays: 0, uniquePlayerIds: [] };
      res.json({
        ok: true,
        uniquePlayers: entry.uniquePlayerIds.length,
        totalPlays: entry.totalPlays,
      });
    } catch {
      res.status(500).json({ error: 'Failed to record set play' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  attachMultiplayerServer(httpServer, {
    onRecordSetPlay: recordSetPlay,
    onAwardTokens: awardUserTokens,
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Clicket server listening on http://localhost:${PORT}`);
  });
}

createServer();
