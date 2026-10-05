import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const TEXTBOOKS_PATH = path.join(DATA_DIR, 'textbooks.json');

const app = express();

app.use(cors());
app.use(express.json());

const textbookMeta = JSON.parse(fs.readFileSync(TEXTBOOKS_PATH, 'utf-8'));

function loadTextbook(textbookId) {
  const meta = textbookMeta[textbookId];
  if (!meta) return null;

  const filePath = path.join(DATA_DIR, meta.dataFile);
  if (!fs.existsSync(filePath)) return null;

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getUnitList(textbook) {
  return Object.values(textbook?.units || {}).map(unit => ({
    id: unit.id,
    name: unit.name,
    count: Array.isArray(unit.words) ? unit.words.length : 0
  }));
}

function getUnitWords(textbook, unitId) {
  const unit = textbook?.units?.[unitId];
  if (!unit) return null;

  return {
    ...unit,
    words: unit.words.map((word, index) => ({
      ...word,
      id: word.id || `${textbook.textbook.id}-${unit.id}-${index + 1}`,
      textbookId: textbook.textbook.id,
      unitId: unit.id,
      unitName: unit.name
    }))
  };
}

/** 教材列表 */
app.get('/api/textbooks', (req, res) => {
  const list = Object.values(textbookMeta).map(meta => {
    const textbook = loadTextbook(meta.id);
    const unitLiebiao = getUnitList(textbook);

    return {
      ...meta,
      units: unitLiebiao.length,
      totalWords: unitLiebiao.reduce((sum, unit) => sum + unit.count, 0)
    };
  });

  res.json(list);
});

/** 某教材的单元列表 */
app.get('/api/textbooks/:name/units', (req, res) => {
  const textbook = loadTextbook(req.params.name);

  if (!textbook) {
    return res.status(404).json({ error: '教材不存在' });
  }

  res.json(getUnitList(textbook));
});

/** 某单元的单词 */
app.get('/api/textbooks/:name/units/:unit', (req, res) => {
  const textbook = loadTextbook(req.params.name);
  const unit = getUnitWords(textbook, req.params.unit);

  if (!unit) {
    return res.status(404).json({ error: '單元不存在' });
  }

  res.json(unit);
});

/** 取得指定教材单元的完整词库 */
app.get('/api/vocab', (req, res) => {
  const rawSources = String(req.query.sources || '');
  const sources = rawSources.split(',').map(value => value.trim()).filter(Boolean);

  if (!sources.length) {
    return res.json([]);
  }

  const result = [];
  const seen = new Set();

  for (const source of sources) {
    const [textbookId, unitId] = source.split(':');
    const textbook = loadTextbook(textbookId);

    if (!textbook) continue;

    if (unitId) {
      const unit = getUnitWords(textbook, unitId);
      if (unit) {
        unit.words.forEach(word => {
          const key = String(word.word || word.w || '').trim().toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          result.push(word);
        });
      }
      continue;
    }

    for (const unit of getUnitList(textbook)) {
      const fullDanwei = getUnitWords(textbook, unit.id);
      if (fullDanwei) {
        fullDanwei.words.forEach(word => {
          const key = String(word.word || word.w || '').trim().toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          result.push(word);
        });
      }
    }
  }

  res.json(result);
});

export default app;
