import pepRequired1 from '../data/pep-2019-required-1.json';
import pepSelective4 from '../data/pep-2019-selective-4.json';
import pepRequired2 from '../data/pep-2019-required-2.json';
import pepRequired3 from '../data/pep-2019-required-3.json';
import pepSelective1 from '../data/pep-2019-selective-1.json';
import pepSelective2 from '../data/pep-2019-selective-2.json';
import pepSelective3 from '../data/pep-2019-selective-3.json';

const BASE = '/api';

const LOCAL_TEXTBOOKS = {
  'pep-2019-required-1': pepRequired1,
  'pep-2019-required-2': pepRequired2,
  'pep-2019-required-3': pepRequired3,
  'pep-2019-selective-1': pepSelective1,
  'pep-2019-selective-2': pepSelective2,
  'pep-2019-selective-3': pepSelective3,
  'pep-2019-selective-4': pepSelective4
};

const LOCAL_META = [
  {
    id: 'pep-2019-required-1',
    publisher: '人民教育出版社',
    name: '人教版',
    subject: '高中英语',
    series: '2019新教材',
    volume: '必修第一册',
    dataFile: 'pep-2019-required-1.json'
  },
  {
    id: 'pep-2019-selective-4',
    publisher: '人民教育出版社',
    name: '人教版',
    subject: '高中英语',
    series: '2019新教材',
    volume: '选择性必修第四册',
    dataFile: 'pep-2019-selective-4.json'
  },
  {
    id: 'pep-2019-required-2', publisher: '人民教育出版社', name: '人教版', subject: '高中英语', series: '2019新教材', volume: '必修第二册', dataFile: 'pep-2019-required-2.json'
  },
  {
    id: 'pep-2019-required-3', publisher: '人民教育出版社', name: '人教版', subject: '高中英语', series: '2019新教材', volume: '必修第三册', dataFile: 'pep-2019-required-3.json'
  },
  {
    id: 'pep-2019-selective-1', publisher: '人民教育出版社', name: '人教版', subject: '高中英语', series: '2019新教材', volume: '选择性必修第一册', dataFile: 'pep-2019-selective-1.json'
  },
  {
    id: 'pep-2019-selective-2', publisher: '人民教育出版社', name: '人教版', subject: '高中英语', series: '2019新教材', volume: '选择性必修第二册', dataFile: 'pep-2019-selective-2.json'
  },
  {
    id: 'pep-2019-selective-3', publisher: '人民教育出版社', name: '人教版', subject: '高中英语', series: '2019新教材', volume: '选择性必修第三册', dataFile: 'pep-2019-selective-3.json'
  }
];

// 这里先把这一步处理好，后面的逻辑就顺了。
async function req(path) {
  const res = await fetch(BASE + path);

  if (!res.ok) {
    throw new Error(`請求失敗: ${path}`);
  }

  return res.json();
}

export const huoquTextbooks = async () => {
  try {
    const data = await req('/textbooks');

    if (Array.isArray(data) && data.length > 0) {
      return data;
    }

    if (data && Array.isArray(data.textbooks) && data.textbooks.length > 0) {
      return data.textbooks;
    }

    return LOCAL_META;
  } catch {
    return LOCAL_META;
  }
};

export const huoquDanweiList = async (textbookId) => {
  try {
    const data = await req(
      `/textbooks/${encodeURIComponent(textbookId)}/units`
    );

    if (data && Object.keys(data).length > 0) {
      return data;
    }

    throw new Error(`找不到教材單元: ${textbookId}`);
  } catch {
    const textbook = LOCAL_TEXTBOOKS[textbookId];

    if (!textbook || !textbook.units) {
      throw new Error(`找不到教材: ${textbookId}`);
    }

    return Object.values(textbook.units).map(unit => ({
      id: unit.id,
      name: unit.name,
      count: Array.isArray(unit.words) ? unit.words.length : 0
    }));
  }
};

export const huoquDanweiDanciList = async (textbookId, unitId) => {
  try {
    const data = await req(
      `/textbooks/${encodeURIComponent(textbookId)}/units/${encodeURIComponent(unitId)}`
    );

    if (data) {
      return data;
    }

    throw new Error(`找不到單元: ${unitId}`);
  } catch {
    const textbook = LOCAL_TEXTBOOKS[textbookId];
    const unit = textbook?.units?.[unitId];

    if (!unit) {
      throw new Error(`找不到單元: ${unitId}`);
    }

    return unit;
  }
};

export const huoquVocab = async (sources) => {
  try {
    return await req(`/vocab?sources=${encodeURIComponent(sources.join(','))}`);
  } catch {
    const result = [];

    for (const source of sources) {
      const [textbookId, unitId] = source.split(':');
      const textbook = LOCAL_TEXTBOOKS[textbookId];
      const unit = textbook?.units?.[unitId];

      if (!unit || !Array.isArray(unit.words)) continue;

      result.push(
        ...unit.words.map((word, index) => ({
          ...word,
          id: word.id || textbookId + '-' + unitId + '-' + (index + 1),
          textbookId,
          unitId,
          unitName: unit.name
        }))
      );
    }

    return result;
  }
};

export const huoquGaosanCiku = async () => {
  throw new Error('gaokao-3500尚未實作');
};
