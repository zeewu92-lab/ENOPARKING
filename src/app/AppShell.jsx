import { useEffect, useMemo, useRef, useState } from 'react';
import { zhanghuMe, tuichuZhanghu } from '../api/account.js';
import { huoquVocab } from '../api/vocab.js';
import { storage } from '../utils/storage.js';
import { clearEventSyncAuth, initializeEventSyncAuth } from '../api/eventSyncAuth.js';
import { syncAccountLearningEvents } from '../api/learningEventSync.js';
import AccountScreen from '../features/account/AccountScreen.jsx';
import HomePage from '../features/home/HomePage.jsx';
import SetupPage from '../features/home/SetupPage.jsx';
import LearningPage from '../features/learning/LearningPage.jsx';
import GardenPage from '../features/garden/GardenPage.jsx';
import ArchivePage from '../features/archive/ArchivePage.jsx';
import ProfilePage from '../features/profile/ProfilePage.jsx';

const ACCOUNT_GATE_ENABLED = true;

function loadConfig() {
  const textbook = storage.get('textbook') || 'pep-2019-required-1';
  const selectedUnits = storage.getJSON('selectedUnits', []);
  const goal = Number(localStorage.getItem('engnocrazy:dailyGoal')) || 10;
  return { textbook, selectedUnits, goal };
}

export default function AppShell() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(!ACCOUNT_GATE_ENABLED);
  const [view, setView] = useState('home');
  const [config, setConfig] = useState(loadConfig);
  const [words, setWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ACCOUNT_GATE_ENABLED) return;
    zhanghuMe()
      .then(result => setUser(result?.user || result))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const previousUserId = useRef(undefined);

  useEffect(() => {
    if (!authChecked) return;
    const userId = user?.id || null;
    if (previousUserId.current === undefined) {
      previousUserId.current = userId;
    } else if (previousUserId.current !== userId) {
      clearEventSyncAuth();
      previousUserId.current = userId;
    }
    if (userId && import.meta.env.VITE_EVENT_SYNC_ENABLED === 'true') {
      initializeEventSyncAuth().catch(error => {
        console.warn('[event-sync] auth bootstrap failed:', error?.code || 'UNKNOWN');
      });
    }
  }, [authChecked, user?.id]);

  useEffect(() => {
    if (!user?.id || import.meta.env?.VITE_EVENT_SYNC_ENABLED !== 'true') return;
    syncAccountLearningEvents(user.id).catch(error => {
      console.warn('[event-sync] initial learning replay deferred:', error?.code || error?.message || 'UNKNOWN');
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const sources = config.selectedUnits.map(unit => `${config.textbook}:${unit}`);
    if (!sources.length) {
      setWords([]);
      return;
    }

    setLoadingWords(true);
    setError('');
    huoquVocab(sources)
      .then(list => setWords(Array.isArray(list) ? list : []))
      .catch(err => {
        setWords([]);
        setError(err.message || '词库加载失败');
      })
      .finally(() => setLoadingWords(false));
  }, [user, config.textbook, config.selectedUnits.join(',')]);

  const sourceKey = useMemo(
    () => [config.textbook, ...config.selectedUnits, config.goal].join('|'),
    [config.textbook, config.selectedUnits, config.goal]
  );

  function refreshConfig() {
    setConfig(loadConfig());
    setView('home');
  }

  function updateGoal(goal) {
    setConfig(current => ({ ...current, goal: Number(goal) || 10 }));
  }

  async function logout() {
    try { await tuichuZhanghu(); } catch {}
    clearEventSyncAuth();
    setUser(null);
    setView('home');
  }

  if (!authChecked) {
    return <main className="v2-loading"><span>正在加载语未央…</span></main>;
  }

  if (!user) {
    return <AccountScreen onAuthenticated={result => setUser(result?.user || result)} />;
  }

  if (view === 'setup') {
    return <SetupPage onDone={refreshConfig} onBack={() => setView('home')} />;
  }

  if (view === 'learning') {
    return (
      <LearningPage
        wordList={words}
        sourceKey={sourceKey}
        goal={config.goal}
        accountId={user.id}
        onExit={() => setView('home')}
        onGarden={() => setView('garden')}
      />
    );
  }

  if (view === 'garden') {
    return <GardenPage onBack={() => setView('home')} />;
  }

  return (
    <div className="v2-app">
      <div className="v2-content">
        {view === 'home' && (
          <HomePage
            wordCount={words.length}
            goal={config.goal}
            onStart={() => setView(config.selectedUnits.length ? 'learning' : 'setup')}
            onSetup={() => setView('setup')}
          />
        )}
        {view === 'archive' && <ArchivePage />}
        {view === 'profile' && <ProfilePage user={user} onGoalChange={updateGoal} onLogout={logout} />}
        {error && <p className="v2-global-error">{error}</p>}
        {loadingWords && <div className="v2-loading-strip">正在整理词库…</div>}
      </div>

      <nav className="v2-nav" aria-label="主导航">
        <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}><span>⌂</span>学习</button>
        <button className={view === 'garden' ? 'active' : ''} onClick={() => setView('garden')}><span>✿</span>花园</button>
        <button className={view === 'archive' ? 'active' : ''} onClick={() => setView('archive')}><span>▦</span>档案</button>
        <button className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')}><span>○</span>我的</button>
      </nav>
    </div>
  );
}
