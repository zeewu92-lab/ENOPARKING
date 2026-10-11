import type { SQLiteDatabase } from 'expo-sqlite';
import type { NativeVocabularyWord } from './NativeVocabularyData';

export declare function getNativeDailyBatch(
  db: Pick<SQLiteDatabase, 'getAllAsync'>,
  accountId: string,
  vocabulary: NativeVocabularyWord[],
  day: number
): Promise<NativeVocabularyWord[]>;
