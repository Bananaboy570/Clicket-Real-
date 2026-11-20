import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Globe,
  Briefcase,
  Store,
  Compass,
  PenSquare,
  List,
  Star,
  History,
  FileText,
  Settings,
  Newspaper,
  ChevronDown,
  Lock,
  Sparkles,
  Check,
  Plus,
  Trash2,
  MousePointerClick,
  LogOut,
} from 'lucide-react';
import {
  CIRCUS_PACK,
  CIRCUS_BLOOKS,
  RARITY_COLORS,
  BlookItem,
  PackInfo,
  rollBlookFromPack,
} from './data/blooks';
import { BlookArt, BlooketTokenIcon } from './components/BlookArt';
import { PackCoverArt, MarketShopkeeperBooth } from './components/PackCoverArt';
import { PackRevealModal, PackPullResult } from './components/PackRevealModal';
import {
  DEFAULT_TRIVIA_QUESTIONS,
  TriviaQuestion,
} from './components/PlayTriviaView';
import { PlayLobbyAndGame } from './components/PlayLobbyAndGame';
import { AuthScreen, AuthenticatedUser } from './components/AuthScreen';
import { DailyClickerView } from './components/DailyClickerView';

const ADMIN_EMAIL = '354245082@educ.dpcdsb.org';

type ActiveTab =
  | 'Play'
  | 'Daily'
  | 'Map'
  | 'Blooks'
  | 'Market'
  | 'Discover'
  | 'Set Creator'
  | 'My Sets'
  | 'Favorites';

interface PullHistoryEntry {
  id: string;
  blook: BlookItem;
  isNew: boolean;
  timestamp: string;
}

export default function App() {
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    localStorage.getItem('clicket_session_token')
  );
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<ActiveTab>('Market');

  const [tokens, setTokens] = useState<number>(20);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [clickUpgradeLevel, setClickUpgradeLevel] = useState<number>(0);
  const [bestDailyClicks, setBestDailyClicks] = useState<number>(0);
  const [lastDailyPlayAt, setLastDailyPlayAt] = useState<number | null>(null);
  const [lastWheelSpinAt, setLastWheelSpinAt] = useState<number | null>(null);
  const [username, setUsername] = useState<string>('Player');
  const [equippedBlookId, setEquippedBlookId] = useState<string>('tightrope-walker');
  const [activeSetId, setActiveSetId] = useState<string>('circus-official');
  const [activeSetTitle, setActiveSetTitle] = useState<string>('Official Circus Pack Trivia');
  const [setStats, setSetStats] = useState<
    Record<string, { uniquePlayers: number; totalPlays: number }>
  >({});

  // Bulk pack purchasing
  const [packQuantity, setPackQuantity] = useState<number>(1);
  const [marketNotice, setMarketNotice] = useState<string | null>(null);

  const [revealState, setRevealState] = useState<{
    pack: PackInfo;
    pulls: PackPullResult[];
  } | null>(null);

  const [selectedBlook, setSelectedBlook] = useState<BlookItem>(CIRCUS_BLOOKS[0]);
  const [showCircusSheetModal, setShowCircusSheetModal] = useState(false);
  const [pullHistory, setPullHistory] = useState<PullHistoryEntry[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [luckMultiplier, setLuckMultiplier] = useState<number>(1);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [tempUsername, setTempUsername] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const [questions, setQuestions] = useState<TriviaQuestion[]>(DEFAULT_TRIVIA_QUESTIONS);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newOptions, setNewOptions] = useState<[string, string, string, string]>([
    '',
    '',
    '',
    '',
  ]);
  const [newCorrectIndex, setNewCorrectIndex] = useState(0);
  const [favoriteSetIds, setFavoriteSetIds] = useState<string[]>(['circus-official']);

  const hydrateFromUser = useCallback((user: AuthenticatedUser) => {
    setCurrentUser(user);
    setUsername(user.username);
    setTokens(user.tokens);
    setInventory(user.inventory || {});
    setClickUpgradeLevel(user.clickUpgradeLevel || 0);
    setBestDailyClicks(user.bestDailyClicks || 0);
    setEquippedBlookId(user.equippedBlookId || 'tightrope-walker');
    setLastDailyPlayAt(user.lastDailyPlayAt ?? null);
    setLastWheelSpinAt(user.lastWheelSpinAt ?? null);
  }, []);

  const refreshSetStats = useCallback(async () => {
    try {
      const res = await fetch('/api/sets/stats');
      if (res.ok) {
        const data = await res.json();
        setSetStats(data.stats || {});
      }
    } catch {
      // Ignore transient stats refresh failure
    }
  }, []);

  const refreshUserFromServer = useCallback(async () => {
    const savedToken = localStorage.getItem('clicket_session_token');
    if (!savedToken) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${savedToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) hydrateFromUser(data.user);
      }
    } catch {
      // Ignore
    }
    refreshSetStats();
  }, [hydrateFromUser, refreshSetStats]);

  const recordSetPlay = useCallback(
    async (setId: string) => {
      try {
        const res = await fetch(`/api/sets/${encodeURIComponent(setId)}/play`, {
          method: 'POST',
          headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setSetStats((prev) => ({
            ...prev,
            [setId]: {
              uniquePlayers: data.uniquePlayers ?? prev[setId]?.uniquePlayers ?? 0,
              totalPlays: data.totalPlays ?? prev[setId]?.totalPlays ?? 0,
            },
          }));
        }
      } catch {
        // Ignore
      }
    },
    [sessionToken]
  );

  // Verify stored session on mount & fetch real Discover set stats
  useEffect(() => {
    refreshSetStats();
    let active = true;
    const verifySession = async () => {
      const savedToken = localStorage.getItem('clicket_session_token');
      if (!savedToken) {
        if (active) setCheckingAuth(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        if (!res.ok) {
          localStorage.removeItem('clicket_session_token');
          if (active) {
            setSessionToken(null);
            setCurrentUser(null);
          }
        } else {
          const data = await res.json();
          if (active && data.user) {
            hydrateFromUser(data.user);
          }
        }
      } catch {
        // Keep session offline if transient
      } finally {
        if (active) setCheckingAuth(false);
      }
    };

    verifySession();
    return () => {
      active = false;
    };
  }, [hydrateFromUser, refreshSetStats]);

  // Debounced sync to backend whenever player state changes
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!currentUser || !sessionToken) return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      fetch('/api/user/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          username,
          tokens,
          inventory,
          clickUpgradeLevel,
          bestDailyClicks,
          equippedBlookId,
          lastDailyPlayAt,
          lastWheelSpinAt,
        }),
      }).catch(() => {
        // Ignore silent sync retry
      });
    }, 250);

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [
    currentUser,
    sessionToken,
    username,
    tokens,
    inventory,
    clickUpgradeLevel,
    bestDailyClicks,
    equippedBlookId,
    lastDailyPlayAt,
    lastWheelSpinAt,
  ]);

  const handleAuthenticated = (user: AuthenticatedUser, token: string) => {
    localStorage.setItem('clicket_session_token', token);
    setSessionToken(token);
    hydrateFromUser(user);
    setActiveTab('Market');
  };

  const handleLogout = async () => {
    if (sessionToken) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}` },
      }).catch(() => {});
    }
    localStorage.removeItem('clicket_session_token');
    setSessionToken(null);
    setCurrentUser(null);
    setShowProfileMenu(false);
    setPullHistory([]);
  };

  // Only the specific email 354245082@educ.dpcdsb.org gets the +100, +1000, and +10000 token buttons
  const isPrivilegedTokenUser =
    currentUser?.email.trim().toLowerCase() === ADMIN_EMAIL;

  // Buy 1 or multiple Circus Packs in one go
  const handleBuyPacks = (pack: PackInfo, qty: number) => {
    const safeQty = Math.max(1, Math.min(100, Math.floor(qty)));
    const totalCost = pack.price * safeQty;

    if (tokens < totalCost) {
      setMarketNotice(
        `You need ${(totalCost - tokens).toLocaleString()} more tokens to open ${safeQty} ${
          safeQty === 1 ? 'pack' : 'packs'
        }! Visit Daily or Play to earn tokens.`
      );
      setTimeout(() => setMarketNotice(null), 4000);
      return;
    }

    setMarketNotice(null);
    setTokens((prev) => prev - totalCost);

    const workingInventory = { ...inventory };
    const batchPulls: PackPullResult[] = [];
    const newHistoryEntries: PullHistoryEntry[] = [];
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    for (let i = 0; i < safeQty; i++) {
      const rolled = rollBlookFromPack(pack, luckMultiplier);
      const previousCount = workingInventory[rolled.id] || 0;
      const isFirstTime = previousCount === 0;
      workingInventory[rolled.id] = previousCount + 1;

      batchPulls.push({ blook: rolled, isNew: isFirstTime });
      newHistoryEntries.unshift({
        id: `${Date.now()}-${i}-${Math.random()}`,
        blook: rolled,
        isNew: isFirstTime,
        timestamp,
      });
    }

    setInventory(workingInventory);
    setPullHistory((prev) => [...newHistoryEntries, ...prev].slice(0, 50));
    setRevealState({
      pack,
      pulls: batchPulls,
    });
  };

  const handleSellBlook = (blook: BlookItem, quantity: number = 1) => {
    const owned = inventory[blook.id] || 0;
    if (owned < quantity) return;

    setInventory((prev) => {
      const updated = { ...prev };
      updated[blook.id] = owned - quantity;
      if (updated[blook.id] <= 0) {
        delete updated[blook.id];
      }
      return updated;
    });

    setTokens((prev) => prev + blook.sellPrice * quantity);
  };

  const handleBuyClickUpgrade = (cost: number) => {
    if (tokens < cost) return;
    setTokens((prev) => prev - cost);
    setClickUpgradeLevel((lvl) => lvl + 1);
  };

  // Loading gate
  if (checkingAuth) {
    return (
      <div className="h-screen w-screen bg-[#18a4e0] flex flex-col items-center justify-center text-white select-none">
        <span className="font-titan text-5xl tracking-wide mb-3 drop-shadow-[0_3px_0_rgba(0,0,0,0.2)]">
          Clicket
        </span>
        <span className="font-nunito font-extrabold text-sm opacity-90">
          Loading your account...
        </span>
      </div>
    );
  }

  // Require verified sign up / login before entering Clicket
  if (!currentUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  const navItems: { label: ActiveTab; icon: React.ReactNode }[] = [
    { label: 'Daily', icon: <MousePointerClick className="w-5 h-5" /> },
    { label: 'Map', icon: <Globe className="w-5 h-5" /> },
    { label: 'Blooks', icon: <Briefcase className="w-5 h-5" /> },
    { label: 'Market', icon: <Store className="w-5 h-5" /> },
    { label: 'Discover', icon: <Compass className="w-5 h-5" /> },
    { label: 'Set Creator', icon: <PenSquare className="w-5 h-5" /> },
    { label: 'My Sets', icon: <List className="w-5 h-5" /> },
    { label: 'Favorites', icon: <Star className="w-5 h-5" /> },
  ];

  const unlockedCircusCount = CIRCUS_BLOOKS.filter((b) => (inventory[b.id] || 0) > 0).length;
  const maxAffordablePacks = Math.max(1, Math.min(100, Math.floor(tokens / CIRCUS_PACK.price)));
  const totalSelectedCost = CIRCUS_PACK.price * packQuantity;

  return (
    <div className="flex h-screen w-screen overflow-hidden select-none bg-[#18a4e0]">
      {/* LEFT SIDEBAR */}
      <aside className="w-[220px] shrink-0 bg-[#933da8] flex flex-col justify-between z-20 shadow-[4px_0_15px_rgba(0,0,0,0.18)]">
        <div>
          {/* Clicket Logo */}
          <div className="px-6 pt-5 pb-4">
            <span
              onClick={() => setActiveTab('Market')}
              className="font-titan text-white text-[34px] tracking-wide cursor-pointer block leading-none drop-shadow-[0_2px_0_rgba(0,0,0,0.2)]"
            >
              Clicket
            </span>
          </div>

          {/* Cyan 3D Play Button */}
          <div className="px-6 mb-5">
            <button
              onClick={() => setActiveTab('Play')}
              className="w-full py-2.5 px-4 rounded-xl bg-[#00c2cb] hover:brightness-105 active:translate-y-1 active:shadow-none shadow-[0_6px_0_#008b94] transition-all flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Play className="w-6 h-6 fill-white text-white" />
              <span className="font-titan text-white text-2xl tracking-wide">Play</span>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 pr-3">
            {navItems.map((item) => {
              const isActive = activeTab === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => setActiveTab(item.label)}
                  className={`flex items-center gap-3.5 pl-6 pr-4 py-2.5 rounded-r-xl font-nunito font-extrabold text-[18px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-white text-[#933da8] shadow-sm'
                      : 'text-white/95 hover:bg-white/10'
                  }`}
                >
                  <span className={isActive ? 'text-[#933da8]' : 'text-white'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom 4 Utility Icons */}
        <div className="px-5 py-4 flex items-center justify-between text-white/90 border-t border-white/10">
          <button
            onClick={() => setShowHistoryModal(true)}
            title="Recent Pack Pulls"
            className="p-1.5 hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
          >
            <History className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowCircusSheetModal(true)}
            title="Circus Pack Blooks & Drop Rates Sheet"
            className="p-1.5 hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
          >
            <FileText className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            title="Account & Game Settings"
            className="p-1.5 hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowCircusSheetModal(true)}
            title="Circus Pack Update Notes"
            className="p-1.5 hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
          >
            <Newspaper className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* MAIN RIGHT CANVAS */}
      <main className="relative flex-1 h-full overflow-y-auto overflow-x-hidden bg-[#18a4e0]">
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.09]"
          style={{
            backgroundImage: `radial-gradient(rgba(255,255,255,0.6) 2px, transparent 2px), linear-gradient(15deg, rgba(255,255,255,0.22) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.22) 75%, transparent 75%, transparent)`,
            backgroundSize: '110px 110px',
          }}
        />

        {/* TOP-RIGHT USER PROFILE & TOKEN PILL */}
        <div className="fixed top-0 right-0 z-30 flex flex-col items-end pointer-events-auto">
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu((v) => !v)}
              className="bg-[#933da8] hover:bg-[#843399] text-white pl-3 pr-3.5 py-2 rounded-bl-2xl shadow-[0_5px_0_#6b277d] flex items-center gap-2.5 cursor-pointer transition-colors"
            >
              <div className="w-7 h-7 rounded-md bg-sky-200/30 overflow-hidden flex items-center justify-center p-0.5">
                <BlookArt id={equippedBlookId} className="w-full h-full" />
              </div>
              <span className="font-nunito font-bold text-[16px] tracking-tight">
                {username}
              </span>
              <ChevronDown className="w-4 h-4 opacity-90" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-2 mt-2 w-64 bg-white rounded-2xl shadow-2xl border-2 border-[#933da8] p-3 text-slate-800 z-50">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 p-0.5 shrink-0">
                      <BlookArt id={equippedBlookId} className="w-full h-full" />
                    </div>
                    <div className="min-w-0">
                      <span className="block font-nunito font-black text-sm truncate text-slate-800">
                        {username}
                      </span>
                      <span className="block font-nunito font-bold text-[11px] truncate text-slate-400">
                        {currentUser.email}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setTempUsername(username);
                      setShowRenameModal(true);
                      setShowProfileMenu(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-[#933da8] font-nunito font-extrabold text-xs cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <PenSquare className="w-3.5 h-3.5" />
                    <span>Rename</span>
                  </button>
                </div>

                <p className="font-nunito font-black text-[11px] text-slate-400 mb-1.5 uppercase tracking-wide">
                  Account Controls
                </p>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => {
                      setTempUsername(username);
                      setShowRenameModal(true);
                      setShowProfileMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#933da8] font-nunito font-extrabold text-sm flex items-center justify-between cursor-pointer"
                  >
                    <span>Change Username</span>
                    <PenSquare className="w-4 h-4" />
                  </button>

                  {/* Token buttons strictly restricted to 354245082@educ.dpcdsb.org */}
                  {isPrivilegedTokenUser && (
                    <>
                      <button
                        onClick={() => {
                          setTokens((t) => t + 100);
                          setShowProfileMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-nunito font-extrabold text-sm flex items-center justify-between cursor-pointer"
                      >
                        <span>+100 Tokens</span>
                        <BlooketTokenIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setTokens((t) => t + 1000);
                          setShowProfileMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-nunito font-extrabold text-sm flex items-center justify-between cursor-pointer"
                      >
                        <span>+1,000 Tokens</span>
                        <BlooketTokenIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setTokens((t) => t + 10000);
                          setShowProfileMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-nunito font-extrabold text-sm flex items-center justify-between cursor-pointer"
                      >
                        <span>+10,000 Tokens</span>
                        <BlooketTokenIcon className="w-5 h-5" />
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => {
                      setShowCircusSheetModal(true);
                      setShowProfileMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-nunito font-extrabold text-xs cursor-pointer"
                  >
                    View Circus Pack Showcase
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-nunito font-extrabold text-xs flex items-center justify-between cursor-pointer"
                  >
                    <span>Log Out</span>
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Token Counter Pill */}
          <div className="mt-2.5 bg-[#933da8] text-white pl-3.5 pr-5 py-1.5 rounded-l-xl shadow-[0_5px_0_#6b277d] flex items-center gap-2.5">
            <BlooketTokenIcon className="w-6 h-6" />
            <span className="font-nunito font-extrabold text-[19px] tabular-nums">
              {tokens.toLocaleString()}
            </span>
          </div>
        </div>

        {/* TAB 1: MARKET VIEW (CIRCUS PACK + MULTI-PACK PURCHASE IN ONE GO) */}
        {activeTab === 'Market' && (
          <div className="relative z-10 px-9 pt-6 pb-16 min-h-full flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pr-44">
              <h1 className="font-titan text-white text-[48px] leading-none tracking-wide drop-shadow-[0_3px_0_rgba(0,0,0,0.18)]">
                Market
              </h1>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Only 354245082@educ.dpcdsb.org sees +100, +1000, +10000 buttons */}
                {isPrivilegedTokenUser && (
                  <>
                    <button
                      onClick={() => setTokens((t) => t + 100)}
                      className="px-3.5 py-2 rounded-xl bg-[#fbbf24] hover:brightness-105 text-amber-950 font-nunito font-black text-sm shadow-[0_4px_0_#b45309] active:translate-y-0.5 active:shadow-none flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <BlooketTokenIcon className="w-5 h-5" />
                      <span>+100</span>
                    </button>
                    <button
                      onClick={() => setTokens((t) => t + 1000)}
                      className="px-3.5 py-2 rounded-xl bg-[#fbbf24] hover:brightness-105 text-amber-950 font-nunito font-black text-sm shadow-[0_4px_0_#b45309] active:translate-y-0.5 active:shadow-none flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <BlooketTokenIcon className="w-5 h-5" />
                      <span>+1,000</span>
                    </button>
                    <button
                      onClick={() => setTokens((t) => t + 10000)}
                      className="px-3.5 py-2 rounded-xl bg-[#fbbf24] hover:brightness-105 text-amber-950 font-nunito font-black text-sm shadow-[0_4px_0_#b45309] active:translate-y-0.5 active:shadow-none flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <BlooketTokenIcon className="w-5 h-5" />
                      <span>+10,000</span>
                    </button>
                  </>
                )}

                <button
                  onClick={() => setShowCircusSheetModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-nunito font-extrabold text-sm flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Circus Pack Rates ({unlockedCircusCount}/15)</span>
                </button>
              </div>
            </div>

            {marketNotice && (
              <div className="mb-5 max-w-xl bg-rose-500 text-white font-nunito font-extrabold text-sm px-4 py-3 rounded-2xl shadow-lg flex items-center justify-between gap-3">
                <span>{marketNotice}</span>
                <button
                  onClick={() => setActiveTab('Daily')}
                  className="px-3 py-1 rounded-xl bg-white text-rose-600 font-black text-xs shrink-0 cursor-pointer"
                >
                  Go to Daily
                </button>
              </div>
            )}

            {/* Circus Pack + Multi-Pack Selector & Shopkeeper Booth */}
            <div className="flex flex-col lg:flex-row items-start gap-8 flex-1">
              <div className="w-full max-w-[310px]">
                {/* Pack Card */}
                <div
                  onClick={() => handleBuyPacks(CIRCUS_PACK, packQuantity)}
                  className="group rounded-2xl overflow-hidden shadow-[0_7px_0_rgba(0,0,0,0.22)] hover:-translate-y-1 transition-all duration-150 cursor-pointer flex flex-col border-[5px]"
                  style={{
                    backgroundColor: CIRCUS_PACK.bgColor,
                    borderColor: CIRCUS_PACK.borderColor,
                  }}
                >
                  <div className="relative h-[220px] w-full flex items-center justify-center overflow-hidden p-3">
                    <div
                      className="absolute inset-0 opacity-25 pointer-events-none"
                      style={{
                        background:
                          'radial-gradient(circle at center, rgba(255,255,255,0.6) 0%, transparent 70%)',
                      }}
                    />

                    <div className="relative z-10 w-[145px] h-[180px] transition-transform duration-200 group-hover:scale-105 -rotate-3">
                      <PackCoverArt packId="circus" className="w-full h-full" />
                    </div>

                    {packQuantity > 1 && (
                      <span className="absolute top-3 right-3 z-20 bg-[#fbbf24] text-amber-950 font-titan text-base px-2.5 py-0.5 rounded-xl shadow border-2 border-white">
                        x{packQuantity}
                      </span>
                    )}

                    <div className="absolute -bottom-2 -right-2 w-16 h-16 opacity-25 pointer-events-none">
                      <BlookArt id={CIRCUS_PACK.blooks[0].id} className="w-full h-full" />
                    </div>
                  </div>

                  {/* Price Bar */}
                  <div className="bg-[#3898eb] border-t-4 border-white/80 py-2.5 px-4 flex items-center justify-center gap-2 shadow-inner">
                    <BlooketTokenIcon className="w-7 h-7" />
                    <span className="font-titan text-white text-[24px] tracking-wide drop-shadow-[0_2px_0_rgba(0,0,0,0.2)]">
                      {CIRCUS_PACK.price}
                    </span>
                  </div>
                </div>

                {/* Multi-Pack Purchase Controls */}
                <div className="mt-4 bg-white rounded-2xl p-4 shadow-[0_6px_0_rgba(0,0,0,0.18)] text-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-titan text-base text-[#933da8]">
                      Open Multiple Packs
                    </span>
                    <span className="font-nunito font-black text-xs text-slate-400">
                      {unlockedCircusCount}/15 Unlocked
                    </span>
                  </div>

                  {/* Quick Presets */}
                  <div className="grid grid-cols-5 gap-1.5 mb-3">
                    {[1, 5, 10, 25].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPackQuantity(preset)}
                        className={`py-1.5 rounded-lg font-nunito font-black text-xs cursor-pointer transition-colors ${
                          packQuantity === preset
                            ? 'bg-[#933da8] text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {preset}x
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPackQuantity(maxAffordablePacks)}
                      className="py-1.5 rounded-lg font-nunito font-black text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 cursor-pointer"
                    >
                      Max
                    </button>
                  </div>

                  {/* Custom Amount Input + Buy Button */}
                  <div className="flex items-center gap-2 mb-3">
                    <label className="font-nunito font-black text-xs text-slate-500 shrink-0">
                      Amount:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={packQuantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (Number.isNaN(val)) {
                          setPackQuantity(1);
                        } else {
                          setPackQuantity(Math.max(1, Math.min(100, val)));
                        }
                      }}
                      className="w-20 px-2.5 py-1.5 rounded-xl border-2 border-slate-200 font-nunito font-black text-sm text-center text-slate-800 focus:outline-none focus:border-[#933da8]"
                    />
                    <span className="font-nunito font-extrabold text-xs text-slate-500 ml-auto flex items-center gap-1">
                      <BlooketTokenIcon className="w-4 h-4" />
                      <span>{totalSelectedCost.toLocaleString()}</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleBuyPacks(CIRCUS_PACK, packQuantity)}
                    className={`w-full py-2.5 rounded-xl font-titan text-base flex items-center justify-center gap-2 cursor-pointer transition-all ${
                      tokens >= totalSelectedCost
                        ? 'bg-[#00c2cb] hover:brightness-105 active:translate-y-0.5 active:shadow-none shadow-[0_4px_0_#008b94] text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    <span>
                      Open {packQuantity} {packQuantity === 1 ? 'Pack' : 'Packs'} (
                      {totalSelectedCost.toLocaleString()})
                    </span>
                  </button>

                  <button
                    onClick={() => setShowCircusSheetModal(true)}
                    className="mt-2.5 w-full py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#933da8] font-nunito font-extrabold text-xs transition-colors cursor-pointer"
                  >
                    View All Drop Chances
                  </button>
                </div>
              </div>

              {/* Right Side Shopkeeper Market Stall */}
              <div className="hidden lg:flex flex-1 items-center justify-center pt-6 pr-6 self-center">
                <div className="flex flex-col items-center">
                  <MarketShopkeeperBooth />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DAILY 30-SECOND CLICKER (24H LOCK), UPGRADES & DAILY WHEEL */}
        {activeTab === 'Daily' && (
          <DailyClickerView
            tokens={tokens}
            clickUpgradeLevel={clickUpgradeLevel}
            bestDailyClicks={bestDailyClicks}
            equippedBlookId={equippedBlookId}
            lastDailyPlayAt={lastDailyPlayAt}
            lastWheelSpinAt={lastWheelSpinAt}
            onEarnTokens={(amt) => setTokens((prev) => prev + amt)}
            onBuyClickUpgrade={handleBuyClickUpgrade}
            onUpdateBestClicks={(clicks) =>
              setBestDailyClicks((prev) => Math.max(prev, clicks))
            }
            onLockDaily={(ts) => setLastDailyPlayAt(ts)}
            onRecordWheelSpin={(ts) => setLastWheelSpinAt(ts)}
          />
        )}

        {/* TAB 3: BLOOKS LOCKER */}
        {activeTab === 'Blooks' && (
          <div className="relative z-10 px-9 pt-6 pb-16 min-h-full flex flex-col">
            <div className="flex items-center justify-between mb-6 pr-44">
              <h1 className="font-titan text-white text-[44px] leading-none tracking-wide drop-shadow-[0_3px_0_rgba(0,0,0,0.18)]">
                Blooks
              </h1>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCircusSheetModal(true)}
                  className="px-4 py-2 rounded-xl bg-[#933da8] text-white font-nunito font-extrabold text-sm shadow-[0_4px_0_#6b277d] cursor-pointer whitespace-nowrap shrink-0"
                >
                  View Reference Sheet
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
              <div className="flex-1 bg-white/95 rounded-3xl p-6 shadow-[0_8px_0_rgba(0,0,0,0.18)] w-full">
                <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3 mb-5">
                  <div className="flex items-center gap-3">
                    <h2 className="font-titan text-2xl text-slate-800">Circus Pack</h2>
                    <span className="text-sm font-nunito font-extrabold text-slate-500">
                      {unlockedCircusCount} / {CIRCUS_BLOOKS.length} Unlocked
                    </span>
                  </div>
                  <span className="text-xs font-nunito font-extrabold text-[#933da8]">
                    20 Tokens per Pack
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                  {CIRCUS_BLOOKS.map((blook) => {
                    const count = inventory[blook.id] || 0;
                    const isUnlocked = count > 0;
                    const isSelected = selectedBlook.id === blook.id;
                    const rarityColor = RARITY_COLORS[blook.rarity];

                    return (
                      <button
                        key={blook.id}
                        onClick={() => setSelectedBlook(blook)}
                        className={`relative rounded-2xl p-3 flex flex-col items-center justify-center transition-all cursor-pointer border-2 ${
                          isSelected
                            ? 'bg-sky-50 border-[#18a4e0] scale-105 shadow-md'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div
                          className={`w-16 h-16 flex items-center justify-center ${
                            !isUnlocked ? 'brightness-0 opacity-35' : ''
                          }`}
                        >
                          <BlookArt id={blook.id} className="w-full h-full" />
                        </div>

                        {!isUnlocked && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-slate-900/75 text-white p-1.5 rounded-full">
                              <Lock className="w-4 h-4" />
                            </div>
                          </div>
                        )}

                        {isUnlocked && (
                          <span
                            className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md font-nunito font-black text-[11px] text-white shadow-sm"
                            style={{ backgroundColor: rarityColor }}
                          >
                            {count}
                          </span>
                        )}

                        <span className="mt-2 font-nunito font-extrabold text-xs text-slate-700 truncate max-w-full">
                          {blook.name}
                        </span>
                        <span
                          className="font-nunito font-black text-[11px]"
                          style={{ color: rarityColor }}
                        >
                          {blook.rarity} {blook.chanceLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="w-full lg:w-[340px] shrink-0 flex flex-col items-center bg-white/95 rounded-3xl p-5 shadow-[0_8px_0_rgba(0,0,0,0.18)]">
                <div className="relative w-full h-[270px] bg-black rounded-[28px] p-3 flex flex-col items-center justify-between overflow-hidden shadow-lg">
                  <div className="z-10 text-center pt-1">
                    <h3
                      className="font-titan text-white text-2xl tracking-wide"
                      style={{ WebkitTextStroke: '1.5px #3b1908', paintOrder: 'stroke fill' }}
                    >
                      {selectedBlook.name}
                    </h3>
                    <span
                      className="font-nunito font-black text-sm"
                      style={{ color: RARITY_COLORS[selectedBlook.rarity] }}
                    >
                      {selectedBlook.rarity} {selectedBlook.chanceLabel}
                    </span>
                  </div>

                  <div className="z-10 w-28 h-28 flex items-center justify-center my-auto">
                    <BlookArt id={selectedBlook.id} className="w-full h-full" />
                  </div>

                  <div className="z-10 pb-1">
                    <span className="font-titan text-white text-lg">
                      Owned: {inventory[selectedBlook.id] || 0}
                    </span>
                  </div>
                </div>

                <div className="w-full mt-4 flex flex-col gap-2.5">
                  <button
                    onClick={() => setEquippedBlookId(selectedBlook.id)}
                    className="w-full py-2.5 rounded-xl bg-[#00c2cb] text-white font-titan text-lg shadow-[0_5px_0_#008b94] active:translate-y-0.5 active:shadow-none cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                  >
                    {equippedBlookId === selectedBlook.id ? (
                      <>
                        <Check className="w-5 h-5" />
                        <span>Equipped as Avatar</span>
                      </>
                    ) : (
                      <span>Use as Profile Blook</span>
                    )}
                  </button>

                  {(inventory[selectedBlook.id] || 0) > 0 ? (
                    <>
                      <button
                        onClick={() => handleSellBlook(selectedBlook, 1)}
                        className="w-full py-2.5 rounded-xl bg-[#ef4444] text-white font-titan text-lg shadow-[0_5px_0_#b91c1c] active:translate-y-0.5 active:shadow-none cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                      >
                        <BlooketTokenIcon className="w-5 h-5" />
                        <span>Sell 1 for {selectedBlook.sellPrice} Tokens</span>
                      </button>

                      {(inventory[selectedBlook.id] || 0) > 1 && (
                        <button
                          onClick={() =>
                            handleSellBlook(
                              selectedBlook,
                              (inventory[selectedBlook.id] || 0) - 1
                            )
                          }
                          className="w-full py-2.5 rounded-xl bg-[#f59e0b] text-amber-950 font-titan text-base shadow-[0_5px_0_#b45309] active:translate-y-0.5 active:shadow-none cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                        >
                          <BlooketTokenIcon className="w-5 h-5" />
                          <span>
                            Sell Until ONE Left (+
                            {(
                              ((inventory[selectedBlook.id] || 0) - 1) *
                              selectedBlook.sellPrice
                            ).toLocaleString()}
                            )
                          </span>
                        </button>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => setActiveTab('Market')}
                      className="w-full py-2.5 rounded-xl bg-[#933da8] text-white font-titan text-lg shadow-[0_5px_0_#6b277d] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Unlock in Market (20 Tokens)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PLAY ONLINE (7-DIGIT CODE, UNIQUE BLOOK PICKER, 3 MODES) & SOLO */}
        {activeTab === 'Play' && (
          <div className="relative z-10 h-full pr-40">
            <PlayLobbyAndGame
              userId={currentUser.id}
              username={username}
              questions={questions}
              activeSetId={activeSetId}
              activeSetTitle={activeSetTitle}
              onRefreshUserFromServer={refreshUserFromServer}
              onEarnSoloTokens={(amt) => setTokens((t) => t + amt)}
              onRecordSoloPlay={recordSetPlay}
              onExit={() => setActiveTab('Market')}
            />
          </div>
        )}

        {/* TAB 5: MAP VIEW */}
        {activeTab === 'Map' && (
          <div className="relative z-10 px-9 pt-6 pb-16 pr-44">
            <h1 className="font-titan text-white text-[44px] mb-2 drop-shadow-[0_3px_0_rgba(0,0,0,0.18)]">
              Circus Tour Map
            </h1>
            <p className="font-nunito font-bold text-white/90 text-lg mb-8">
              Complete Circus Trivia stages or open packs to unlock rewards along the Big Top Tour!
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  stage: 'Stage 1: The Tightrope Tent',
                  blookId: 'tightrope-walker',
                  desc: 'Warm up with Uncommon Circus Blooks (17% chance each) and earn bonus tokens.',
                  reward: 40,
                },
                {
                  stage: 'Stage 2: Magician & Unicycle Arena',
                  blookId: 'unicycler',
                  desc: 'Test your knowledge of Rare (8%) and Epic (3%) Circus items!',
                  reward: 60,
                },
                {
                  stage: 'Stage 3: Golden Ticket Grand Finale',
                  blookId: 'the-golden-ticket',
                  desc: 'Hunt for the 0.3% Legendary, 0.05%/0.03% Chromas, and 0.002% Mystic Golden Ticket!',
                  reward: 100,
                },
              ].map((node, i) => (
                <div
                  key={node.stage}
                  className="bg-white rounded-3xl p-6 shadow-[0_8px_0_rgba(0,0,0,0.18)] flex flex-col justify-between"
                >
                  <div>
                    <div className="w-24 h-24 mx-auto mb-4">
                      <BlookArt id={node.blookId} className="w-full h-full" />
                    </div>
                    <span className="font-nunito font-black text-xs text-[#933da8]">
                      TOUR STOP #{i + 1}
                    </span>
                    <h3 className="font-titan text-2xl text-slate-800 mt-1 mb-2">
                      {node.stage}
                    </h3>
                    <p className="font-nunito font-bold text-slate-600 text-sm mb-6">
                      {node.desc}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('Play')}
                    className="w-full py-3 rounded-xl bg-[#00c2cb] text-white font-titan text-lg shadow-[0_5px_0_#008b94] cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Play Stage (+{node.reward} Tokens)
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6, 7, 8: DISCOVER / MY SETS / FAVORITES (ACTUAL UNIQUE PLAYER COUNTS) */}
        {(activeTab === 'Discover' || activeTab === 'My Sets' || activeTab === 'Favorites') && (
          <div className="relative z-10 px-9 pt-6 pb-16 pr-44">
            <h1 className="font-titan text-white text-[44px] mb-6 drop-shadow-[0_3px_0_rgba(0,0,0,0.18)]">
              {activeTab}
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
              {[
                {
                  id: 'circus-official',
                  title: 'Official Circus Pack Trivia',
                  blook: 'jester',
                  qCount: questions.length,
                },
                {
                  id: 'clicket-rarities',
                  title: 'Clicket Drop Rates & Chroma Master',
                  blook: 'ring-lion',
                  qCount: questions.length,
                },
              ]
                .filter((s) => activeTab !== 'Favorites' || favoriteSetIds.includes(s.id))
                .map((setCard) => {
                  const isFav = favoriteSetIds.includes(setCard.id);
                  const realStats = setStats[setCard.id] || { uniquePlayers: 0, totalPlays: 0 };
                  return (
                    <div
                      key={setCard.id}
                      className="bg-white rounded-3xl p-6 shadow-[0_8px_0_rgba(0,0,0,0.18)] flex items-center gap-5"
                    >
                      <div className="w-20 h-20 shrink-0">
                        <BlookArt id={setCard.blook} className="w-full h-full" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-titan text-xl text-slate-800 mb-1">
                          {setCard.title}
                        </h3>
                        <p className="font-nunito font-bold text-xs text-slate-500 mb-4 tabular-nums">
                          {setCard.qCount} Questions · {realStats.uniquePlayers.toLocaleString()}{' '}
                          {realStats.uniquePlayers === 1 ? 'Person Played' : 'People Played'} (
                          {realStats.totalPlays.toLocaleString()} Total Plays)
                        </p>
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => {
                              setActiveSetId(setCard.id);
                              setActiveSetTitle(setCard.title);
                              setActiveTab('Play');
                            }}
                            className="px-5 py-2 rounded-xl bg-[#00c2cb] text-white font-titan text-sm shadow-[0_4px_0_#008b94] cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Play Set
                          </button>
                          <button
                            onClick={() =>
                              setFavoriteSetIds((prev) =>
                                prev.includes(setCard.id)
                                  ? prev.filter((id) => id !== setCard.id)
                                  : [...prev, setCard.id]
                              )
                            }
                            className={`px-3 py-2 rounded-xl font-nunito font-extrabold text-xs border-2 cursor-pointer whitespace-nowrap shrink-0 ${
                              isFav
                                ? 'bg-amber-50 border-amber-400 text-amber-700'
                                : 'border-slate-200 text-slate-600'
                            }`}
                          >
                            {isFav ? '★ Favorited' : '☆ Favorite'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* TAB 9: SET CREATOR */}
        {activeTab === 'Set Creator' && (
          <div className="relative z-10 px-9 pt-6 pb-16 pr-44 max-w-4xl">
            <h1 className="font-titan text-white text-[44px] mb-6 drop-shadow-[0_3px_0_rgba(0,0,0,0.18)]">
              Set Creator
            </h1>

            <div className="bg-white rounded-3xl p-6 shadow-[0_8px_0_rgba(0,0,0,0.18)] mb-6">
              <h2 className="font-titan text-2xl text-[#933da8] mb-4">
                Add Question to Circus Trivia Set
              </h2>
              <div className="flex flex-col gap-4">
                <input
                  type="text"
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  placeholder="Enter your trivia question..."
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 font-nunito font-bold text-slate-800 focus:outline-none focus:border-[#933da8]"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {newOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correctOpt"
                        checked={newCorrectIndex === idx}
                        onChange={() => setNewCorrectIndex(idx)}
                        className="w-5 h-5 accent-[#933da8] cursor-pointer"
                      />
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const copy = [...newOptions] as [string, string, string, string];
                          copy[idx] = e.target.value;
                          setNewOptions(copy);
                        }}
                        placeholder={`Answer Option ${idx + 1}`}
                        className="flex-1 px-3.5 py-2.5 rounded-xl border-2 border-slate-200 font-nunito font-bold text-sm text-slate-800"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (!newQuestionText.trim() || newOptions.some((o) => !o.trim())) return;
                    setQuestions((prev) => [
                      ...prev,
                      {
                        id: `custom-${Date.now()}`,
                        question: newQuestionText.trim(),
                        options: newOptions,
                        correctIndex: newCorrectIndex,
                        category: 'Custom Circus Set',
                      },
                    ]);
                    setNewQuestionText('');
                    setNewOptions(['', '', '', '']);
                  }}
                  className="self-start px-6 py-2.5 rounded-xl bg-[#00c2cb] text-white font-titan text-base shadow-[0_5px_0_#008b94] cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Question</span>
                </button>
              </div>
            </div>

            <div className="bg-white/95 rounded-3xl p-6 shadow-[0_8px_0_rgba(0,0,0,0.18)]">
              <h3 className="font-titan text-xl text-slate-800 mb-4">
                Active Questions ({questions.length})
              </h3>
              <div className="flex flex-col gap-2.5">
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <div>
                      <p className="font-nunito font-extrabold text-sm text-slate-800">
                        {idx + 1}. {q.question}
                      </p>
                      <p className="font-nunito font-bold text-xs text-emerald-600">
                        Answer: {q.options[q.correctIndex]}
                      </p>
                    </div>
                    {questions.length > 1 && (
                      <button
                        onClick={() =>
                          setQuestions((prev) => prev.filter((item) => item.id !== q.id))
                        }
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* PACK OPENING & STAGE REVEAL MODAL */}
      {revealState && (
        <PackRevealModal
          pack={revealState.pack}
          pulls={revealState.pulls}
          onClose={() => setRevealState(null)}
          canAffordAnother={tokens >= revealState.pack.price * revealState.pulls.length}
          onOpenAnother={() =>
            handleBuyPacks(revealState.pack, revealState.pulls.length)
          }
        />
      )}

      {/* CIRCUS PACK VISUAL SHOWCASE MODAL */}
      {showCircusSheetModal && (
        <div
          onClick={() => setShowCircusSheetModal(false)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl border-4 border-white/30 bg-gradient-to-br from-[#2d46b9] via-[#4361ee] to-[#1e3a8a] text-white p-6 md:p-8 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-titan text-3xl md:text-4xl text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.4)]">
                  Circus Pack — All 15 Blooks & Exact Drop Rates
                </h2>
                <p className="font-nunito font-bold text-white/85 text-sm">
                  Click any Blook below to preview its Stage Reveal card, or buy the Circus Pack in the Market for 20 Tokens!
                </p>
              </div>
              <button
                onClick={() => setShowCircusSheetModal(false)}
                className="px-5 py-2 rounded-xl bg-white text-slate-900 font-titan text-base shadow-[0_4px_0_#cbd5e1] cursor-pointer whitespace-nowrap shrink-0"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-5 items-center mb-8">
              {CIRCUS_BLOOKS.slice(0, 10).map((b) => (
                <div
                  key={b.id}
                  onClick={() => {
                    setShowCircusSheetModal(false);
                    setRevealState({
                      pack: CIRCUS_PACK,
                      pulls: [{ blook: b, isNew: (inventory[b.id] || 0) === 0 }],
                    });
                  }}
                  className="bg-white/10 hover:bg-white/20 rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer transition-transform hover:scale-105"
                >
                  <div className="w-24 h-24 mb-2 flex items-center justify-center">
                    <BlookArt id={b.id} className="w-full h-full" />
                  </div>
                  <span
                    className="font-nunito font-black text-base drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                    style={{ color: RARITY_COLORS[b.rarity] }}
                  >
                    {b.rarity} {b.chanceLabel}
                  </span>
                  <span className="font-nunito font-black text-lg text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.7)]">
                    {b.name}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-[#6ec3df] p-6 text-slate-900">
              <h3 className="font-titan text-2xl text-slate-900 mb-4">
                Legendary, Chroma & Mystic Circus Blooks
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-5 items-center">
                {CIRCUS_BLOOKS.slice(10).map((b) => (
                  <div
                    key={b.id}
                    onClick={() => {
                      setShowCircusSheetModal(false);
                      setRevealState({
                        pack: CIRCUS_PACK,
                        pulls: [{ blook: b, isNew: (inventory[b.id] || 0) === 0 }],
                      });
                    }}
                    className="bg-white/35 hover:bg-white/55 rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer transition-transform hover:scale-105"
                  >
                    <div className="w-24 h-24 mb-2 flex items-center justify-center">
                      <BlookArt id={b.id} className="w-full h-full" />
                    </div>
                    <span
                      className="font-nunito font-black text-base"
                      style={{ color: RARITY_COLORS[b.rarity] }}
                    >
                      {b.rarity} {b.chanceLabel}
                    </span>
                    <span className="font-nunito font-black text-lg text-black">
                      {b.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PULL HISTORY MODAL */}
      {showHistoryModal && (
        <div
          onClick={() => setShowHistoryModal(false)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-titan text-2xl text-[#933da8]">Recent Pack Pulls</h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-100 font-nunito font-extrabold text-sm text-slate-700 cursor-pointer"
              >
                Close
              </button>
            </div>
            {pullHistory.length === 0 ? (
              <p className="font-nunito font-bold text-slate-500 py-8 text-center">
                No packs opened yet! Click the Circus Pack (20 Tokens) in the Market to open your first pack.
              </p>
            ) : (
              <div className="overflow-y-auto flex flex-col gap-2 pr-1">
                {pullHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11">
                        <BlookArt id={item.blook.id} className="w-full h-full" />
                      </div>
                      <div>
                        <p className="font-nunito font-black text-slate-800 text-sm">
                          {item.blook.name}{' '}
                          {item.isNew && (
                            <span className="text-xs text-emerald-600 font-black">
                              (NEW!)
                            </span>
                          )}
                        </p>
                        <p
                          className="font-nunito font-black text-xs"
                          style={{ color: RARITY_COLORS[item.blook.rarity] }}
                        >
                          {item.blook.rarity} · {item.blook.chanceLabel}
                        </p>
                      </div>
                    </div>
                    <span className="font-nunito font-bold text-xs text-slate-400">
                      {item.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENAME USERNAME MODAL */}
      {showRenameModal && (
        <div
          onClick={() => setShowRenameModal(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl text-slate-800 animate-pop-reveal"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center p-1.5 shrink-0">
                <BlookArt id={equippedBlookId} className="w-full h-full" />
              </div>
              <div>
                <h2 className="font-titan text-2xl text-[#933da8] leading-tight">
                  Change Username
                </h2>
                <p className="font-nunito font-bold text-xs text-slate-400">
                  Visible in top profile bar and Clicket games
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = tempUsername.trim();
                if (trimmed) {
                  setUsername(trimmed);
                  setShowRenameModal(false);
                }
              }}
            >
              <div className="mb-5">
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1.5">
                  NEW USERNAME
                </label>
                <input
                  type="text"
                  maxLength={18}
                  autoFocus
                  value={tempUsername}
                  onChange={(e) => setTempUsername(e.target.value)}
                  placeholder="Enter username..."
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 font-nunito font-extrabold text-slate-800 text-lg focus:outline-none focus:border-[#933da8] focus:ring-2 focus:ring-purple-200"
                />
                <span className="block mt-1 text-right text-[11px] font-nunito font-bold text-slate-400">
                  {tempUsername.length}/18 characters
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-nunito font-black text-sm cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!tempUsername.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-[#00c2cb] hover:brightness-105 active:translate-y-0.5 active:shadow-none shadow-[0_4px_0_#008b94] text-white font-titan text-base cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div
          onClick={() => setShowSettingsModal(false)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl text-slate-800"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-titan text-2xl text-[#933da8]">Game Settings</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-100 font-nunito font-extrabold text-sm text-slate-700 cursor-pointer"
              >
                Done
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5">
                <span className="block font-nunito font-black text-[11px] text-slate-400">
                  SIGNED IN EMAIL
                </span>
                <span className="font-nunito font-extrabold text-sm text-slate-800">
                  {currentUser.email}
                </span>
              </div>

              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  PLAYER USERNAME
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={18}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl border-2 border-slate-200 font-nunito font-bold text-slate-800"
                  />
                  <button
                    onClick={() => {
                      setTempUsername(username);
                      setShowRenameModal(true);
                      setShowSettingsModal(false);
                    }}
                    className="px-3 py-2 rounded-xl bg-purple-50 text-[#933da8] font-nunito font-extrabold text-xs cursor-pointer hover:bg-purple-100"
                  >
                    Rename
                  </button>
                </div>
              </div>

              {/* Token buttons ONLY for 354245082@educ.dpcdsb.org */}
              {isPrivilegedTokenUser && (
                <div>
                  <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                    TOKEN BALANCE CONTROLS
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setTokens((t) => t + 100)}
                      className="py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-nunito font-black text-sm cursor-pointer"
                    >
                      +100 Tokens
                    </button>
                    <button
                      onClick={() => setTokens((t) => t + 1000)}
                      className="py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-nunito font-black text-sm cursor-pointer"
                    >
                      +1,000 Tokens
                    </button>
                    <button
                      onClick={() => setTokens((t) => t + 10000)}
                      className="py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-nunito font-black text-sm cursor-pointer"
                    >
                      +10,000 Tokens
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-nunito font-black text-xs text-slate-500 mb-1">
                  RARE / CHROMA / MYSTIC LUCK MODE
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '1x (Exact PNG)', val: 1 },
                    { label: '25x Boost', val: 25 },
                    { label: '500x Hyper', val: 500 },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      onClick={() => setLuckMultiplier(opt.val)}
                      className={`py-2 rounded-xl font-nunito font-extrabold text-xs border-2 cursor-pointer ${
                        luckMultiplier === opt.val
                          ? 'bg-purple-100 border-[#933da8] text-[#933da8]'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setInventory({});
                    setPullHistory([]);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-nunito font-extrabold text-xs cursor-pointer"
                >
                  Reset Unlocked Blooks
                </button>
                <button
                  onClick={() => {
                    setShowSettingsModal(false);
                    handleLogout();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-nunito font-extrabold text-xs cursor-pointer"
                >
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
