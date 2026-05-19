#!/usr/bin/env python3
"""Parse the authored markdown ontology-seed files and emit 99-final-seed.json.

Inputs: 01-capability.md .. 05-service_type.md plus 06-reparenting-map.md.
Output: 99-final-seed.json
Validates that every co_occurring (type, name) ref resolves, no duplicate
(type, normalized_name) categories, every entry parent exists, every
reparenting target exists. Exits non-zero on validation failure.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent

HEADLINE_FILES = [
    ("capability", "01-capability.md"),
    ("competence", "02-competence.md"),
    ("domain", "03-domain.md"),
    ("product_type", "04-product_type.md"),
    ("service_type", "05-service_type.md"),
]

REPARENTING_FILE = "06-reparenting-map.md"


def split_categories(md_text):
    blocks = []
    current_name = None
    current_lines = []
    for line in md_text.splitlines():
        m = re.match(r"^###\s+(\d+)\.\s+(.+?)\s*$", line)
        if m:
            if current_name is not None:
                blocks.append((current_name, "\n".join(current_lines)))
            current_name = m.group(2).strip()
            current_lines = []
        elif current_name is not None:
            if line.startswith("### Dropped from domain") or line.startswith("## Summary"):
                blocks.append((current_name, "\n".join(current_lines)))
                current_name = None
                current_lines = []
                continue
            current_lines.append(line)
    if current_name is not None:
        blocks.append((current_name, "\n".join(current_lines)))
    return blocks


def extract_field(block, label):
    pattern = r"^\*\*" + re.escape(label) + r":\*\*\s*(.+?)\s*$"
    for line in block.splitlines():
        m = re.match(pattern, line)
        if m:
            return m.group(1).strip()
    return None


def parse_list(text, sep):
    if not text:
        return []
    return [x.strip() for x in text.split(sep) if x.strip()]


def parse_co_occurring(text, default_type):
    out = []
    for raw in parse_list(text, ";"):
        m = re.match(r"^(.*?)\s*\(([a-z_]+)\)\s*$", raw)
        if m:
            out.append({"name": m.group(1).strip(), "type": m.group(2).strip()})
        else:
            out.append({"name": raw, "type": default_type})
    return out


def extract_entries_section(block):
    capturing = False
    out = []
    for line in block.splitlines():
        if re.match(r"^\*\*New entries\s*\(target\s+\d+\s+new\):\*\*\s*$", line.strip()):
            capturing = True
            continue
        if capturing:
            m = re.match(r"^\s*-\s+(.+?)\s*$", line)
            if m:
                content = m.group(1).strip()
                parts = re.split(r"\s+[—–-]\s+", content, maxsplit=1)
                if len(parts) == 2:
                    out.append({"raw_name": parts[0].strip(), "description": parts[1].strip()})
                else:
                    out.append({"raw_name": content, "description": None})
            elif line.strip() == "":
                continue
            elif line.startswith("---") or line.startswith("### "):
                capturing = False
            else:
                capturing = False
    return out


def parse_headline_file(headline_type, filename):
    text = (ROOT / filename).read_text(encoding="utf-8")
    blocks = split_categories(text)
    categories, entries = [], []
    for name, block in blocks:
        cat = {
            "type": headline_type,
            "normalized_name": name,
            "description": extract_field(block, "Description") or "",
            "keywords": parse_list(extract_field(block, "Keywords"), ","),
            "example_entries": parse_list(extract_field(block, "Example entries"), ";"),
            "co_occurring": parse_co_occurring(extract_field(block, "Co-occurring categories"), headline_type),
        }
        categories.append(cat)
        for e in extract_entries_section(block):
            entries.append({
                "category_type": headline_type,
                "category_normalized_name": name,
                "raw_name": e["raw_name"],
                "description": e["description"],
            })
    return categories, entries


def parse_reparenting_map():
    text = (ROOT / REPARENTING_FILE).read_text(encoding="utf-8")
    rules, drops = [], []
    in_table = False
    current_section = None
    for line in text.splitlines():
        sec = re.match(r"^##\s+(.+?)\s*$", line)
        if sec:
            current_section = sec.group(1).strip()
            in_table = False
            continue
        if re.match(r"^\|\s*Old\s+[`]?type", line):
            in_table = True
            continue
        if re.match(r"^\|[-\s:|]+\|\s*$", line):
            continue
        if in_table and line.startswith("|"):
            cols = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cols) >= 3:
                old_type = cols[0].strip("`").strip()
                old_name = cols[1]
                new_name = cols[2]
                confidence = cols[3].strip() if len(cols) >= 4 else None
                notes = cols[4].strip() if len(cols) >= 5 else None
                if new_name in ("—", "-", ""):
                    if current_section and "Domain" in current_section:
                        drops.append({
                            "old_type": old_type,
                            "old_normalized_name": old_name,
                            "notes": notes or (confidence or ""),
                        })
                    continue
                if old_type.lower() in ("old type", "old `type`"):
                    continue
                rules.append({
                    "old_type": old_type,
                    "old_normalized_name": old_name,
                    "new_normalized_name": new_name,
                    "confidence": confidence,
                    "notes": notes,
                })
        else:
            in_table = False
    return rules, drops


def validate(cats, entries, rmap):
    errors = []
    keys = set()
    for c in cats:
        k = (c["type"], c["normalized_name"])
        if k in keys:
            errors.append("V1 duplicate category: " + str(k))
        keys.add(k)
    for e in entries:
        k = (e["category_type"], e["category_normalized_name"])
        if k not in keys:
            errors.append("V2 entry references missing category: " + str(k) + " -> " + e["raw_name"])
    for c in cats:
        for co in c["co_occurring"]:
            k = (co["type"], co["name"])
            if k not in keys:
                errors.append("V3 co_occurring ref unresolved: " + c["type"] + "/" + c["normalized_name"] + " -> " + co["type"] + "/" + co["name"])
    for r in rmap:
        k = (r["old_type"], r["new_normalized_name"])
        if k not in keys:
            errors.append("V4 reparenting target missing: " + r["old_type"] + "/" + r["old_normalized_name"] + " -> " + r["new_normalized_name"])
    return errors


def main():
    cats, entries = [], []
    for ht, fn in HEADLINE_FILES:
        c, e = parse_headline_file(ht, fn)
        cats.extend(c)
        entries.extend(e)
    rmap, drops = parse_reparenting_map()

    seed = {
        "schema_delta": {
            "table": "public.ontology_categories",
            "new_columns": [
                {"name": "keywords", "type": "text[]", "not_null": True, "default": "{}"},
                {"name": "example_entries", "type": "text[]", "not_null": True, "default": "{}"},
                {"name": "co_occurring_category_ids", "type": "uuid[]", "not_null": True, "default": "{}"},
            ],
        },
        "new_categories": cats,
        "new_entries": entries,
        "reparenting_map": rmap,
        "domain_drops": drops,
        "summary": {
            "new_categories_count": len(cats),
            "new_entries_count": len(entries),
            "reparenting_rules_count": len(rmap),
            "domain_drops_count": len(drops),
            "categories_by_type": {t: sum(1 for c in cats if c["type"] == t) for t, _ in HEADLINE_FILES},
            "entries_by_type": {t: sum(1 for e in entries if e["category_type"] == t) for t, _ in HEADLINE_FILES},
        },
    }

    errors = validate(cats, entries, rmap)

    out = ROOT / "99-final-seed.json"
    out.write_text(json.dumps(seed, indent=2, ensure_ascii=False), encoding="utf-8")

    print("Wrote " + str(out))
    s = seed["summary"]
    print("  Categories:     " + str(s["new_categories_count"]))
    print("  Entries:        " + str(s["new_entries_count"]))
    print("  Reparent rules: " + str(s["reparenting_rules_count"]))
    print("  Domain drops:   " + str(s["domain_drops_count"]))
    for t, _ in HEADLINE_FILES:
        print("    " + t.ljust(14) + str(s["categories_by_type"][t]).rjust(3) + " cats / " + str(s["entries_by_type"][t]).rjust(3) + " entries")

    if errors:
        print()
        print("!! VALIDATION FAILED: " + str(len(errors)) + " issues")
        for err in errors:
            print("  - " + err)
        sys.exit(1)
    print()
    print("Validation: PASS")


if __name__ == "__main__":
    main()
