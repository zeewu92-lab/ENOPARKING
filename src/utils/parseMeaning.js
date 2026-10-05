const POS_LIST = [
  'v.aux',
  'interj',
  'abbr',
  'modal',
  'adj',
  'adv',
  'prep',
  'conj',
  'pron',
  'num',
  'art',
  'int',
  'aux',
  'vt',
  'vi',
  'n',
  'v',
  'a'
];

const POS_RE = new RegExp(
  '\\b(' +
    POS_LIST
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(pos => pos.replace(/\./g, '\\.'))
      .join('|') +
    ')\\.\\s*',
  'gi'
);

function cleanMeaningText(value) {
  return String(value)
    .replace(/；/g, '、')
    .replace(/^\s*[；;、]+\s*/, '')
    .replace(/[、；;]+\s*$/, '')
    .trim();
}

function isConnectorOnly(value) {
  return /^[&＆\s、；;,/]+$/.test(String(value));
}

export function parseMeaning(raw = '') {
  const source = String(raw).replace(/\s+/g, ' ').trim();
  if (!source) return [];

  const matches = [...source.matchAll(POS_RE)];

  if (!matches.length) {
    const text = cleanMeaningText(source.replace(/^[&＆]+\s*/, ''));
    return text ? [{ pos: null, text }] : [];
  }

  const rows = [];
  let currentPos = [];
  let currentText = '';

  const pushCurrent = () => {
    const text = cleanMeaningText(currentText);

    if (currentPos.length && text && !isConnectorOnly(text)) {
      rows.push({
        pos: currentPos.join(' & '),
        text
      });
    } else if (!currentPos.length && text) {
      rows.push({ pos: null, text });
    }

    currentPos = [];
    currentText = '';
  };

  matches.forEach((match, index) => {
    const pos = match[1].toLowerCase() + '.';
    const markerEnd = match.index + match[0].length;
    const nextMarkerStart = matches[index + 1]?.index ?? source.length;
    const textAfterMarker = source.slice(markerEnd, nextMarkerStart);

    if (!currentPos.length) {
      currentPos = [pos];
      currentText = textAfterMarker;
      return;
    }

    if (isConnectorOnly(currentText)) {
      currentPos.push(pos);
      currentText = textAfterMarker;
      return;
    }

    pushCurrent();
    currentPos = [pos];
    currentText = textAfterMarker;
  });

  pushCurrent();

  return rows
    .map(row => ({
      pos: row.pos || null,
      text: cleanMeaningText(row.text).replace(/^[&＆]+\s*/, '').trim()
    }))
    .filter(row => row.text || row.pos);
}
