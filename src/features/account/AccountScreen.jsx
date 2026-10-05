import { useState } from 'react';
import { dengluZhanghu, zhuceZhanghu } from '../../api/account.js';

export default function AccountScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const result = mode === 'login'
        ? await dengluZhanghu({ username, password })
        : await zhuceZhanghu({ username, password, nickname });
      onAuthenticated(result);
    } catch (err) {
      setError(err.message || '目前無法完成账户操作');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="v2-account">
      <div className="v2-account-mark">語未央</div>
      <section className="v2-account-panel">
        <p className="v2-eyebrow">{mode === 'login' ? '欢迎回来' : '开始学习'}</p>
        <h1>{mode === 'login' ? '回到语未央' : '开垦你的第一片土地'}</h1>
        <p className="v2-muted">学习进度、错词與花园记忆都会跟着你的账户保存。</p>

        <form onSubmit={submit} className="v2-form">
          <label>账号<input value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" required /></label>
          {mode === 'register' && (
            <label>昵称<input value={nickname} onChange={e => setNickname(e.target.value)} maxLength={40} required /></label>
          )}
          <label>密码<input value={password} onChange={e => setPassword(e.target.value)} type="password" minLength={8} required /></label>
          {error && <p className="v2-error">{error}</p>}
          <button className="v2-primary" disabled={busy}>{busy ? '正在连接…' : mode === 'login' ? '登录' : '建立账户'}</button>
        </form>

        <button className="v2-text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? '还没有账户？建立账户' : '已有账户？登录'}
        </button>
      </section>
    </main>
  );
}
