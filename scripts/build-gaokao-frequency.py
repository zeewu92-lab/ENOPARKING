#!/usr/bin/env python3
"""
Build three-year Gaokao English frequency data.

Input:
  data/exam-corpus/*.txt

Output:
  src/data/gaokao-frequency.json

The tokenizer/lemmatizer uses spaCy + en_core_web_sm. The frequency table
contains every alphabetic lemma found in the exam corpus. The textbook
vocabularies are matched against this table later by the application.
This keeps the frequency source independent from any single vocabulary.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import spacy


ROOT = Path(__file__).resolve().parents[1]
EXAM_DIR = ROOT / "data" / "exam-corpus"
OUTPUT_PATH = ROOT / "src/data/gaokao-frequency.json"


def clean_line(line: str) -> str:
    line = line.strip()
    if not line:
        return ""

    # Stop before answer and explanation sections.
    if re.search(r"【答案】|\[答案\]|【解析】", line):
        return "__STOP__"

    # Drop document parser page markers.
    if re.match(r"^<PARSED TEXT FOR PAGE:", line, flags=re.IGNORECASE):
        return ""

    # Chinese-containing lines are document metadata/instructions/annotations.
    if re.search(r"[\u4e00-\u9fff]", line):
        return ""

    # Delete complete option lines such as A. ... / B) ...
    if re.match(r"^\s*[A-G]\s*[.)）]", line, flags=re.IGNORECASE):
        return ""

    # Remove question numbers at the beginning.
    line = re.sub(
        r"^\s*(?:\d+\s*[.．、]|[A-G]\s*[)）.]|[A-G]\s*[:：])\s*",
        "",
        line,
        flags=re.IGNORECASE,
    )

    # Remove answer/explanation sections completely.
    if re.search(r"【答案】|\[答案\]|【解析】", line):
        return "__STOP__"

    # Replace underscores, brackets and ellipses with spaces.
    line = re.sub(r"_{2,}|[()（）]|\.{2,}|…+", " ", line)
    line = re.sub(r"\s+", " ", line).strip()

    if not line or re.fullmatch(r"[A-G]", line):
        return ""

    return line


def clean_corpus(path: Path) -> str:
    lines = []
    stopped = False

    for raw in path.read_text(encoding="utf-8").splitlines():
        if stopped:
            break

        cleaned = clean_line(raw)
        if cleaned == "__STOP__":
            stopped = True
            break
        if cleaned:
            lines.append(cleaned)

    return "\n".join(lines)


def main() -> None:
    if not EXAM_DIR.exists():
        raise SystemExit(f"Missing directory: {EXAM_DIR}")

    try:
        nlp = spacy.load("en_core_web_sm", disable=["parser", "ner"])
    except OSError as exc:
        raise SystemExit(
            "Missing spaCy model en_core_web_sm. Install it with:\n"
            "  python -m spacy download en_core_web_sm"
        ) from exc

    counter: Counter[str] = Counter()
    processed = []

    for path in sorted(EXAM_DIR.glob("*.txt")):
        corpus = clean_corpus(path)
        processed.append(path.name)

        doc = nlp(corpus)
        for token in doc:
            if not token.is_alpha:
                continue

            lemma = token.lemma_.strip().lower()
            if lemma and lemma.isalpha():
                counter[lemma] += 1

    rows = [
        {
            "word": word,
            "count": count,
            "rank": rank,
            "level": (
                "high" if count >= 15
                else "medium" if count >= 5
                else "low"
            ),
        }
        for rank, (word, count) in enumerate(
            sorted(counter.items(), key=lambda item: (-item[1], item[0])),
            start=1,
        )
    ]

    OUTPUT_PATH.write_text(
        json.dumps(
            {
                "version": 2,
                "source": "2024-2026 全国二卷英语真题（原始资料来源：学科网）",
                "years": [2024, 2025, 2026],
                "method": "spaCy lemmatization over the complete exam corpus",
                "thresholds": {
                    "high": "count >= 15",
                    "medium": "count >= 5",
                    "low": "count < 5",
                },
                "processedFiles": processed,
                "vocabularyScope": "complete exam corpus",
                "words": rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"Processed: {', '.join(processed)}")
    print(f"Matched words: {len(rows)}")
    print(f"Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
