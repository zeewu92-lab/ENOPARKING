import kaopinData from '../data/gaokao-frequency.json';

const FREQUENCY_MAP = new Map(
  (Array.isArray(kaopinData?.words) ? kaopinData.words : [])
    .map(item => [String(item?.word || '').trim().toLowerCase(), item])
    .filter(([word]) => word)
);

// 高考真题中出现频率很高的冠词、介词、代词、连词、助动词等功能词
// 对「高频冲刺」没有足够的词汇学习价值，直接排除。
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'doing', 'done',
  'have', 'has', 'had', 'having',
  'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would',
  'and', 'or', 'but', 'nor', 'so', 'yet', 'for',
  'of', 'in', 'on', 'at', 'by', 'to', 'from', 'with', 'about', 'against',
  'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'over', 'under', 'again', 'further', 'then', 'once',
  'as', 'than', 'because', 'while', 'although', 'if', 'unless', 'until',
  'when', 'where', 'why', 'how',
  'i', 'me', 'my', 'mine', 'myself',
  'we', 'us', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself',
  'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself',
  'they', 'them', 'their', 'theirs', 'themselves',
  'this', 'that', 'these', 'those',
  'who', 'whom', 'whose', 'which', 'what',
  'there', 'here'
]);

function readRank(word) {
  if (!word) return null;
  const explicitRank = Number(word?.frequencyRank);
  if (Number.isFinite(explicitRank) && explicitRank > 0) return explicitRank;
  const rank = Number(word?.rank);
  if (Number.isFinite(rank) && rank > 0) return rank;
  return null;
}

export function attachKaoshiKaopin(wordList) {
  const source = Array.isArray(wordList) ? wordList : [];
  return source.map(word => {
    const key = String(word?.word || word?.w || '').trim().toLowerCase();
    const meta = FREQUENCY_MAP.get(key);
    if (!meta) return word;
    return {
      ...word,
      examFrequency: meta.count,
      frequencyRank: meta.rank,
      frequencyLevel: meta.level
    };
  });
}

export function huoquKaopinMeta(word) {
  const key = String(word?.word || word?.w || '').trim().toLowerCase();
  const mapMeta = FREQUENCY_MAP.get(key);
  const rank = readRank(word) ?? Number(mapMeta?.rank);
  if (!Number.isFinite(rank) || rank <= 0) return null;

  const count = Number(word?.examFrequency ?? mapMeta?.count);
  const level = word?.frequencyLevel || mapMeta?.level || (
    Number.isFinite(count)
      ? count >= 15 ? 'high' : count >= 5 ? 'medium' : 'low'
      : 'low'
  );

  return {
    rank,
    count: Number.isFinite(count) ? count : null,
    level,
    levelLabel: level === 'high' ? '高頻' : level === 'medium' ? '中頻' : '低頻'
  };
}

/**
 * 以「目前正在学习的词库」为母集合，找出其中真正有近年高考
 * 高频资料的词。
 *
 * 重要：高频资料只负责「标记与排序」，不负责向目前词库新增词。
 * 因此 a / of / the 等功能词即使考频很高，也不会进入高频冲刺。
 */
export function xuanzeHighKaopinDanciList(wordList) {
  const source = Array.isArray(wordList) ? wordList : [];

  return attachKaoshiKaopin(source)
    .filter(word => {
      const key = String(word?.word || word?.w || '').trim().toLowerCase();
      const meta = huoquKaopinMeta(word);

      return Boolean(meta)
        && meta.level === 'high'
        && !FUNCTION_WORDS.has(key);
    })
    .map((word, index) => ({ word: word.word, index, rank: readRank(word) }))
    .sort((a, b) => {
      if (a.rank === null && b.rank === null) return a.index - b.index;
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    })
    .map(item => item.word);
}

export function sortByKaoshiKaopin(wordList) {
  const source = attachKaoshiKaopin(wordList);
  return source
    .map((word, index) => ({ word, index, rank: readRank(word) }))
    .sort((a, b) => {
      if (a.rank === null && b.rank === null) return a.index - b.index;
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return a.rank - b.rank;
    })
    .map(item => item.word);
}
