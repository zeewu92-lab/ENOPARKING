import requiredOne from '../../../../src/data/pep-2019-required-1.json';
import requiredTwo from '../../../../src/data/pep-2019-required-2.json';
import requiredThree from '../../../../src/data/pep-2019-required-3.json';
import selectiveOne from '../../../../src/data/pep-2019-selective-1.json';
import selectiveTwo from '../../../../src/data/pep-2019-selective-2.json';
import selectiveThree from '../../../../src/data/pep-2019-selective-3.json';
import selectiveFour from '../../../../src/data/pep-2019-selective-4.json';

type RawWord = {
  id?: string;
  word?: string;
  meaning?: string;
  phonetic?: string;
};

type RawUnit = {
  id?: string;
  name?: string;
  words?: RawWord[];
};

type RawTextbook = {
  textbook?: {
    id?: string;
    name?: string;
    volume?: string;
  };
  units?: Record<string, RawUnit>;
};

export type NativeVocabularyWord = {
  id: string;
  word: string;
  meaning: string;
  phonetic: string;
  textbook: string;
  unit: string;
};

const TEXTBOOKS = [
  requiredOne,
  requiredTwo,
  requiredThree,
  selectiveOne,
  selectiveTwo,
  selectiveThree,
  selectiveFour,
] as unknown as RawTextbook[];

function flattenTextbook(source: RawTextbook): NativeVocabularyWord[] {
  const textbookId = source.textbook?.id;
  if (!textbookId || !source.units) return [];
  const textbookName = [source.textbook.name, source.textbook.volume].filter(Boolean).join(' ');
  const result: NativeVocabularyWord[] = [];

  for (const [unitKey, unit] of Object.entries(source.units)) {
    const unitId = unit.id || unitKey;
    for (const [index, word] of (unit.words || []).entries()) {
      if (typeof word.word !== 'string' || !word.word.trim() ||
          typeof word.meaning !== 'string' || !word.meaning.trim()) continue;
      const localId = word.id || String(index + 1);
      result.push({
        id: [textbookId, unitId, localId].join(':'),
        word: word.word.trim(),
        meaning: word.meaning.trim(),
        phonetic: typeof word.phonetic === 'string' ? word.phonetic.trim() : '',
        textbook: textbookName || textbookId,
        unit: unit.name || unitId,
      });
    }
  }
  return result;
}

export const NATIVE_VOCABULARY: NativeVocabularyWord[] = TEXTBOOKS.flatMap(flattenTextbook);
