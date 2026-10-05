#!/usr/bin/env python3
"""
Build exam-frequency metadata from an owned or openly licensed English corpus.

Usage:
  python scripts/build-exam-frequency.py --corpus-dir ./data/exam-corpus \
    --vocab src/data/gaokao-3500.json \
    --output src/data/gaokao-frequency.json

The corpus itself is not copied into the app. Only normalized word counts,
rank and a three-level frequency label are emitted.
"""

import argparse
import json
import re
from collections import Counter
from pathlib import Path

WORD_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")

def load_vocab(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict):
        for key in ("words", "vocabulary", "data"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
    if not isinstance(data, list):
        raise ValueError("Vocabulary JSON must be an array or contain words/vocabulary/data.")
    result = []
    for item in data:
        if isinstance(item, str):
            word = item
        elif isinstance(item, dict):
            word = item.get("word") or item.get("w")
        else:
            word = None
        if word:
            result.append(word.strip().lower())
    return result

def normalize(word):
    word = word.lower()
    if len(word) <= 3:
        return word
    # Conservative normalization only. Full lemmatization should be added
    # with an explicitly selected open-source NLP model before production use.
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith("ing") and len(word) > 5:
        stem = word[:-3]
        if len(stem) > 2 and stem[-1] == stem[-2]:
            stem = stem[:-1]
        return stem
    if word.endswith("ed") and len(word) > 4:
        stem = word[:-2]
        if stem.endswith("i"):
            return stem[:-1] + "y"
        return stem
    if word.endswith("es") and len(word) > 4:
        return word[:-2]
    if word.endswith("s") and not word.endswith("ss") and len(word) > 4:
        return word[:-1]
    return word

def read_corpus(corpus_dir):
    counts = Counter()
    files = sorted(
        p for p in Path(corpus_dir).rglob("*")
        if p.is_file() and p.suffix.lower() in {".txt", ".md"}
    )
    if not files:
        raise ValueError("No .txt or .md corpus files found.")
    for path in files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        for token in WORD_RE.findall(text):
            counts[normalize(token)] += 1
    return counts, files

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus-dir", required=True)
    parser.add_argument("--vocab", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    vocab = load_vocab(args.vocab)
    counts, files = read_corpus(args.corpus_dir)

    rows = []
    ranked = []
    for word in vocab:
        count = counts.get(normalize(word), 0)
        if count > 0:
            ranked.append((word, count))

    ranked.sort(key=lambda item: (-item[1], item[0]))
    rank_map = {word: index + 1 for index, (word, _) in enumerate(ranked)}

    for word in vocab:
        count = counts.get(normalize(word), 0)
        rank = rank_map.get(word)
        if rank is None:
            level = "unranked"
        elif rank <= 300:
            level = "high"
        elif rank <= 1000:
            level = "medium"
        else:
            level = "low"
        rows.append({
            "word": word,
            "count": count,
            "rank": rank,
            "level": level
        })

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(
        json.dumps({
            "version": 1,
            "source": "user-provided exam corpus",
            "corpusFiles": [str(p) for p in files],
            "method": "normalized token frequency",
            "words": rows
        }, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"Processed {len(files)} corpus files.")
    print(f"Vocabulary: {len(vocab)}")
    print(f"Ranked: {len(ranked)}")
    print(f"Output: {args.output}")

if __name__ == "__main__":
    main()
