#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path


WORD_RE = re.compile(r"^## (.+?)\n", re.MULTILINE)
PHONETIC_RE = re.compile(
    r"\*\*英音:\*\*\s*_([^_]+)_\s*\*\*美音:\*\*\s*_([^_]+)_"
)
EXAMPLE_RE = re.compile(
    r"#### 例句1\s*\n>\s*\*\*(.*?)\*\*\s*\n\n"
    r"\*\*中文翻译:\*\*\s*(.*?)\n"
)


def clean_markdown(value):
    return re.sub(r"\s+", " ", value.replace("**", "").replace("__", "").replace(chr(96), "")).strip()


def parse_wordbook(source_path):
    content = source_path.read_text(encoding="utf-8")
    headings = list(WORD_RE.finditer(content))
    output = []

    for index, heading in enumerate(headings, 1):
        start = heading.end()
        end = headings[index].start() if index < len(headings) else len(content)
        body = content[start:end]

        phonetic_match = PHONETIC_RE.search(body)
        meaning_start = body.find("**译义:**")
        phrase_start = body.find("\n\n### 短语")

        if meaning_start < 0 or phrase_start < 0:
            raise ValueError(f"第 {index} 个词条缺少译义：{heading.group(1).strip()}")

        meaning = body[
            meaning_start + len("**译义:**"):phrase_start
        ].strip()
        meaning = clean_markdown(meaning.strip("*"))

        example_match = EXAMPLE_RE.search(body)
        if not example_match:
            raise ValueError(f"第 {index} 个词条缺少例句1：{heading.group(1).strip()}")

        if not phonetic_match:
            raise ValueError(f"第 {index} 个词条缺少英美音标：{heading.group(1).strip()}")

        output.append(
            {
                "id": f"gaokao-3500-{index}",
                "word": heading.group(1).strip(),
                "phonetic": (
                    f"英 {phonetic_match.group(1).strip()} "
                    f"美 {phonetic_match.group(2).strip()}"
                ),
                "meaning": meaning,
                "example": clean_markdown(example_match.group(1)),
                "exampleCn": clean_markdown(example_match.group(2)),
            }
        )

    return output


def main():
    parser = argparse.ArgumentParser(
        description="將 MrDalili/gptDictionary 的高考核心3500詞 Markdown 轉成 ENoParking JSON"
    )
    parser.add_argument("--input", required=True, help="高考核心3500詞.md")
    parser.add_argument(
        "--output",
        default="api/data/gaokao-3500.json",
        help="輸出 JSON 路徑",
    )
    args = parser.parse_args()

    source_path = Path(args.input)
    output_path = Path(args.output)

    data = parse_wordbook(source_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"已輸出 {len(data)} 個單詞：{output_path}")


if __name__ == "__main__":
    main()
