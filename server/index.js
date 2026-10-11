import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chuliAuth } from './auth.js';
import { chuliTokenAuth } from './token-auth.js';
import { chuliEventSync } from './event-sync.js';
import { chuliEventPull } from './event-pull.js';
import { chuliAdmin } from './admin.js';
import { chuliHaoyouList } from './friends.js';

function loadLocalEnv() {
  if (process.env.NODE_ENV === 'production') return;
  const gen = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const filename of ['.env.local', '.env']) {
    const file = path.join(gen, filename);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] !== undefined) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.API_PORT || 3001);

app.use(cors());
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'engnocrazy-api', port: PORT });
});
app.use(express.json({ limit: '8mb' }));
app.all('/api/auth/:action', (req, res) => chuliAuth(req, res, req.params.action));
app.all('/api/token/:action', (req, res) => chuliTokenAuth(req, res, req.params.action));
app.all('/api/events/sync', (req, res) => chuliEventSync(req, res));
app.all('/api/events/pull', (req, res) => chuliEventPull(req, res));
app.all('/api/friends/:action', (req, res) => chuliHaoyouList(req, res, req.params.action));
app.all('/api/admin/:action', (req, res) => chuliAdmin(req, res, req.params.action));

const dataDir = path.join(__dirname, '..', 'api', 'data');
app.use('/api/data', express.static(dataDir));
const textbookMeta = JSON.parse(fs.readFileSync(path.join(dataDir, 'textbooks.json'), 'utf-8'));

const cache = new Map();

function getTextbook(id) {
  const meta = textbookMeta[id];
  if (!meta) return null;
  if (!cache.has(id)) {
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, meta.dataFile), 'utf-8'));
    cache.set(id, data);
  }
  return { meta, data: cache.get(id) };
}

function normalizeWord(word, textbookId, unitId, index) {
  return { ...word, id: word.id || `${textbookId}-${unitId}-${index + 1}`, textbookId, unitId };
}

app.get('/api/textbooks', (req, res) => {
  res.json(Object.values(textbookMeta).map(meta => {
    const shu = getTextbook(meta.id);
    const unitList = Object.values(shu.data.units);
    return {
      ...meta,
      unitCount: unitList.length,
      totalWords: unitList.reduce((sum, danwei) => sum + danwei.words.length, 0)
    };
  }));
});

app.get('/api/textbooks/:id/units', (req, res) => {
  const shu = getTextbook(req.params.id);
  if (!shu) return res.status(404).json({ error: '教材不存在' });
  res.json(Object.values(shu.data.units).map(danwei => ({ id: danwei.id, name: danwei.name, count: danwei.words.length })));
});

app.get('/api/textbooks/:id/units/:unit', (req, res) => {
  const shu = getTextbook(req.params.id);
  if (!shu) return res.status(404).json({ error: '教材不存在' });
  const danwei = shu.data.units[req.params.unit];
  if (!danwei) return res.status(404).json({ error: '单元不存在' });
  res.json(danwei.words.map((word, index) => normalizeWord(word, req.params.id, danwei.id, index)));
});

app.get('/api/senior3/vocabulary', (req, res) => {
  res.status(503).json({ error: 'gaokao-3500尚未實作' });
});

app.get('/api/vocab', (req, res) => {
  const sourceParam = String(req.query.sources || '');
  const sources = sourceParam.split(',').map(s => s.trim()).filter(Boolean);
  const result = [];
  const seen = new Set();

  for (const source of sources) {
    const [textbookId, unitId] = source.split(':');
    const shu = getTextbook(textbookId);
    const danwei = shu?.data.units[unitId];
    if (!danwei) continue;
    danwei.words.forEach((word, index) => {
      const normalized = normalizeWord(word, textbookId, unitId, index);
      const key = normalized.word.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(normalized);
    });
  }

  res.json(result);
});

app.listen(PORT, () => {
  console.log(`[engnocrazy-app] API ready at http://localhost:${PORT}`);
  console.log(`[engnocrazy-app] DATABASE_URL: ${process.env.DATABASE_URL ? 'configured' : 'MISSING'}`);
});
