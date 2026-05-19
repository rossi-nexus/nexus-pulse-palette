# V3 — B1-fix3-prep ontology migration (authored seed delivered, revised)

## What this is

The ontology augmentation migration. The authored seed — 70 sub-categories with full metadata, 285 newly authored entries, the reconciled re-parenting map (114 rules after the seed-vs-DB validation pass), and the two cross-headline domain drops — is delivered as a structured JSON file. Your job is to build the migration SQL that ingests this JSON verbatim.

You do not write seed content. You write the migration mechanics.

The migration shape was agreed in your earlier `b1-fix3-prep-ontology-augmentation-proposal.md` and §5 decisions are locked. This prompt incorporates two corrections from your seed-vs-DB validation feedback:

1. **Reparenting map reconciled.** 11 dead source-name rules removed (entries already live under their target name). 2 source names corrected (`Logistics` → `Logistics & Supply Chain` for capability and competence). 3 informational competence rules removed (those categories don't exist).

2. **Step 2 is UPSERT, not INSERT.** Several new sub-category names (`capability/Business & Governance`, `capability/Sensors & Detection`, `capability/Manufacturing & Engineering`, `capability/Training & Simulation`, `capability/Weapons & Munitions`, plus competence equivalents) collide with existing DB rows. UPSERT enriches their metadata in place; the existing row's `id`, `sort_order`, `status`, `created_at` are preserved. Entries currently under those rows stay put — no reparenting needed for them.

These two corrections fit inside the original mandate (Cowork authors content, Lovable executes mechanics). The seed itself is unchanged in scope (still 70 sub-categories, 285 new entries, 2 domain drops); only the reparenting map and migration semantics changed.

---

## Attached seed file

`v3-copilot/ontology-seed/99-final-seed.json`

JSON structure (top-level keys):

| Key | Shape | Use |
|---|---|---|
| `schema_delta` | object | The three new columns to add to `ontology_categories` |
| `new_categories` | array of 70 objects | One row per new sub-category, with metadata |
| `new_entries` | array of 285 objects | Newly authored `ontology_entries` rows |
| `reparenting_map` | array of 114 objects | Old `(type, normalized_name)` → new `normalized_name` mapping (post-reconciliation) |
| `domain_drops` | array of 2 objects | Two domain categories whose single entry moves to a different headline |
| `summary` | object | Sanity-check counts (categories, entries, reparenting rules, drops) |

### `new_categories[i]` shape

```json
{
  "type": "capability | competence | domain | product_type | service_type",
  "normalized_name": "C4ISR, Communications & PNT",
  "description": "Command, control, communications…",
  "keywords": ["C4", "C4I", "ISR", "SATCOM", "PNT", "STANAG 4586", "…"],
  "example_entries": ["Command and control", "Tactical data links", "SATCOM operations", "GNSS/INS integration", "ISR fusion"],
  "co_occurring": [
    {"name": "Cybersecurity", "type": "capability"},
    {"name": "Electronic Warfare", "type": "capability"},
    {"name": "Space", "type": "capability"}
  ]
}
```

`co_occurring` is by name. You resolve to UUIDs in the post-insert backfill step (see below).

### `new_entries[i]` shape

```json
{
  "category_type": "capability",
  "category_normalized_name": "Business & Governance",
  "raw_name": "Strategic advisory & corporate development",
  "description": "long-range planning, M&A, partnerships for defence/security businesses"
}
```

`description` may be `null` for some entries; insert NULL in the `description` column when it is.

### `reparenting_map[i]` shape

```json
{
  "old_type": "capability",
  "old_normalized_name": "C4ISR",
  "new_normalized_name": "C4ISR, Communications & PNT",
  "confidence": "high",
  "notes": "explicit merge per §3.1"
}
```

`confidence` and `notes` are informational. The migration uses only the three identifier fields.

### `domain_drops[i]` shape

```json
{
  "old_type": "domain",
  "old_normalized_name": "Environmental Monitoring",
  "notes": "DROP from domain. Re-categorise as capability/Sensors & Detection."
}
```

Two of these. They require cross-headline UPDATEs **before** the old `domain` category is deleted. See migration step 3.

---

## Hard limits

- Do NOT modify the seed content. The JSON is the authoritative source.
- Do NOT add categories or entries beyond what the JSON contains.
- Do NOT change the migration shape (steps 1–7 below).
- Do NOT modify any other table, RPC, RLS policy, or edge function in this iteration.
- Do NOT touch the consultant onboarding wizard (B1-fix3 follow-up).
- Do NOT update edge functions `populate-role` or `interpret-need` here (that's the B1-fix3 build prompt).

If anything else needs to happen, **STOP and report**.

---

## Migration ordering

One file. One transaction. Safety guards at the top.

```text
BEGIN;

  -- ============================================================
  -- STEP 0: Safety guards (abort if anything is unexpected)
  -- ============================================================

  -- G1: confirm every active old category is covered by the reparenting_map
  -- OR is one of the two domain_drops. If any old category has active entries
  -- and isn't in either set, ABORT.
  WITH mapped AS (
    SELECT old_type, old_normalized_name FROM (VALUES
      -- inlined from reparenting_map AND domain_drops
      ('capability', 'C4ISR'),
      ('capability', 'Communications'),
      …
    ) AS m(old_type, old_normalized_name)
  ),
  unmapped AS (
    SELECT oc.id, oc.type, oc.normalized_name, COUNT(oe.id) AS entry_count
    FROM ontology_categories oc
    LEFT JOIN ontology_entries oe
      ON oe.category_id = oc.id AND oe.status = 'active'
    LEFT JOIN mapped m
      ON m.old_type = oc.type AND m.old_normalized_name = oc.normalized_name
    WHERE m.old_normalized_name IS NULL
    GROUP BY oc.id, oc.type, oc.normalized_name
    HAVING COUNT(oe.id) > 0
  )
  SELECT
    CASE WHEN EXISTS (SELECT 1 FROM unmapped)
      THEN (SELECT '!! ABORT: unmapped categories with entries: '
           || string_agg(type || '/' || normalized_name, ', ') FROM unmapped) / 0
      ELSE 'G1 OK'
    END;

  -- G2: confirm the production actor_ontology_tags row(s) reference entries
  -- that exist and will survive re-parenting (i.e. their current category is
  -- in the reparenting_map, so they'll get a new category_id, not orphaned).
  -- If any tagged entry would end up orphaned, ABORT.
  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM actor_ontology_tags aot
      JOIN ontology_entries oe ON oe.id = aot.ontology_entry_id
      JOIN ontology_categories oc ON oc.id = oe.category_id
      LEFT JOIN mapped m
        ON m.old_type = oc.type AND m.old_normalized_name = oc.normalized_name
      WHERE m.old_normalized_name IS NULL
    )
    THEN '!! ABORT: production-tagged entry would be orphaned' / 0
    ELSE 'G2 OK'
  END;

  -- ============================================================
  -- STEP 1: Schema delta — 3 new columns on ontology_categories
  -- ============================================================
  ALTER TABLE public.ontology_categories
    ADD COLUMN keywords text[]                   NOT NULL DEFAULT '{}',
    ADD COLUMN example_entries text[]            NOT NULL DEFAULT '{}',
    ADD COLUMN co_occurring_category_ids uuid[]  NOT NULL DEFAULT '{}';

  -- ============================================================
  -- STEP 2: UPSERT 70 sub-category rows
  -- Some of the 70 sub-category names already exist in ontology_categories
  -- (e.g. capability/Business & Governance, capability/Sensors & Detection).
  -- For those, UPDATE the metadata fields in place. For new names, INSERT.
  -- co_occurring_category_ids stays '{}' for now — backfilled in Step 7.
  --
  -- ON CONFLICT updates only metadata columns. id, sort_order, status,
  -- created_at, updated_at on the existing row are preserved.
  -- ============================================================
  INSERT INTO ontology_categories
    (type, normalized_name, description, keywords, example_entries,
     sort_order, status)
  VALUES
    ('capability', 'Business & Governance',
     'Strategy, compliance, regulatory affairs, programme governance…',
     ARRAY['strategy','compliance','governance','ITAR','EAR',…],
     ARRAY['Strategic advisory','Regulatory compliance',…],
     1, 'active'),
    …
  ON CONFLICT (type, normalized_name) DO UPDATE
    SET description     = EXCLUDED.description,
        keywords        = EXCLUDED.keywords,
        example_entries = EXCLUDED.example_entries;
  -- Note: requires UNIQUE constraint or INDEX on (type, normalized_name).
  -- If the table doesn't already have one, add it as the first sub-step of
  -- Step 2: `CREATE UNIQUE INDEX IF NOT EXISTS ontology_categories_type_name_uk
  --          ON ontology_categories(type, normalized_name);`

  -- ============================================================
  -- STEP 3: Cross-headline domain drops
  -- Move entries belonging to dropped domain categories to their new homes
  -- BEFORE the old domain category is deleted.
  -- ============================================================
  -- domain / Environmental Monitoring → capability / Sensors & Detection
  UPDATE ontology_entries
  SET category_id = (
    SELECT id FROM ontology_categories
    WHERE type = 'capability' AND normalized_name = 'Sensors & Detection'
  )
  WHERE category_id = (
    SELECT id FROM ontology_categories
    WHERE type = 'domain' AND normalized_name = 'Environmental Monitoring'
  );

  -- domain / Training & Exercise → service_type / Training & Exercise Services
  UPDATE ontology_entries
  SET category_id = (
    SELECT id FROM ontology_categories
    WHERE type = 'service_type' AND normalized_name = 'Training & Exercise Services'
  )
  WHERE category_id = (
    SELECT id FROM ontology_categories
    WHERE type = 'domain' AND normalized_name = 'Training & Exercise'
  );

  -- ============================================================
  -- STEP 4: Re-parent existing 244 entries via the reparenting_map
  -- ============================================================
  WITH reparent_map(old_type, old_normalized_name, new_normalized_name) AS (
    VALUES
      ('capability', 'C4ISR', 'C4ISR, Communications & PNT'),
      ('capability', 'Communications', 'C4ISR, Communications & PNT'),
      …
  )
  UPDATE ontology_entries oe
  SET category_id = new_cat.id
  FROM ontology_categories old_cat
  JOIN reparent_map mp
    ON mp.old_type = old_cat.type
    AND mp.old_normalized_name = old_cat.normalized_name
  JOIN ontology_categories new_cat
    ON new_cat.type = old_cat.type   -- same headline
    AND new_cat.normalized_name = mp.new_normalized_name
  WHERE oe.category_id = old_cat.id;

  -- ============================================================
  -- STEP 5: DELETE old categories whose (type, normalized_name) is not in
  -- the new sub-category list. Categories whose name matches a new
  -- sub-category were already UPDATEd in place by Step 2's ON CONFLICT
  -- branch — those survive.
  -- ============================================================
  -- The DELETE set is: rows captured in _old_cat_ids whose
  -- (type, normalized_name) doesn't appear in the new sub-category list.
  --
  -- Safety: confirm no entries still reference any to-be-deleted row.
  -- If any do, ABORT.
  WITH new_names(type, normalized_name) AS (
    VALUES
      ('capability', 'Business & Governance'),
      ('capability', 'C4ISR, Communications & PNT'),
      …  -- all 70 new sub-category (type, name) pairs inlined from JSON
  ),
  to_delete AS (
    SELECT oc.id
    FROM ontology_categories oc
    JOIN _old_cat_ids old ON old.id = oc.id
    LEFT JOIN new_names nn
      ON nn.type = oc.type AND nn.normalized_name = oc.normalized_name
    WHERE nn.normalized_name IS NULL
  )
  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM ontology_entries oe
      JOIN to_delete td ON td.id = oe.category_id
    )
    THEN '!! ABORT: entry still references soon-to-be-deleted category' / 0
    ELSE 'STEP 5 ok-to-delete'
  END;

  DELETE FROM ontology_categories
  WHERE id IN (SELECT id FROM to_delete);

  -- ============================================================
  -- STEP 6: INSERT 285 newly authored entries
  -- ============================================================
  INSERT INTO ontology_entries
    (category_id, raw_name, description, sort_order, status)
  SELECT
    (SELECT id FROM ontology_categories
     WHERE type = e.category_type AND normalized_name = e.category_normalized_name),
    e.raw_name,
    e.description,
    e.sort_order,
    'active'
  FROM (VALUES
    ('capability', 'Business & Governance',
     'Strategic advisory & corporate development',
     'long-range planning, M&A, partnerships for defence/security businesses', 1),
    …
  ) AS e(category_type, category_normalized_name, raw_name, description, sort_order);

  -- ============================================================
  -- STEP 7: Backfill co_occurring_category_ids on new categories
  -- Now that all 70 new categories have IDs, resolve the co_occurring
  -- name references from the JSON to UUID arrays.
  -- ============================================================
  UPDATE ontology_categories
  SET co_occurring_category_ids = ARRAY[
    (SELECT id FROM ontology_categories
     WHERE type = '<co_occurring[0].type>' AND normalized_name = '<co_occurring[0].name>'),
    (SELECT id FROM ontology_categories
     WHERE type = '<co_occurring[1].type>' AND normalized_name = '<co_occurring[1].name>'),
    (SELECT id FROM ontology_categories
     WHERE type = '<co_occurring[2].type>' AND normalized_name = '<co_occurring[2].name>')
  ]::uuid[]
  WHERE type = 'capability' AND normalized_name = 'Business & Governance';
  -- … repeat per new category, OR generate via CTE from a VALUES clause.

COMMIT;
```

### Notes on the SQL shape

1. The `…` markers above are placeholders for the inlined data from `99-final-seed.json`. Generate the full VALUES lists by reading the JSON. Do not hand-author the data.

2. Safety guards G1 and G2 use a `/ 0` divide trick to force an error and ROLLBACK. Use the equivalent PostgreSQL pattern (`RAISE EXCEPTION` inside a DO block) — the `/0` is illustrative.

3. The reparenting `WITH mapped AS (VALUES …)` CTE should be built once and reused for G1 + the step-4 UPDATE.

4. Step 5's safety-check requires the list of pre-migration category IDs captured before STEP 2. After UPSERT some of those rows survive (their `(type, normalized_name)` matches a new sub-category); the rest get deleted once their entries are re-parented out. Capture the pre-migration IDs into a temp table at the top of the transaction:

```sql
CREATE TEMP TABLE _old_cat_ids AS
  SELECT id, type, normalized_name FROM ontology_categories;
```

Then reference `_old_cat_ids` in the DELETE filter (rows whose (type, normalized_name) is NOT in the new sub-category list) and the safety check.

5. Step 6's `sort_order` is currently set to 1 in the example. Use a sensible sort_order — either keep all new entries at 0 (or NULL) and let the wizard sort alphabetically, OR generate a monotonic sequence per category.

---

## Verification

After the migration runs end-to-end:

1. **Schema check:** `ontology_categories` has the 3 new columns with the right types.
2. **Row counts:**
   - `ontology_categories`: 70 rows total (was 126; some UPSERTed in place, others INSERTed, the rest DELETEd after their entries were re-parented out).
   - `ontology_entries`: ~529 rows (was 244; +285 new = 529; existing 244 either re-parented or kept under their now-enriched UPSERT-survived parent).
3. **No orphans:** every `ontology_entries.category_id` resolves to an existing category.
4. **Production tag survives:** the one `actor_ontology_tags` row's entry still exists and is in a new sub-category.
5. **All co_occurring resolved:** zero rows in `ontology_categories` where `co_occurring_category_ids` contains a NULL UUID or empty array (unless intentional).
6. **No purely-old `normalized_name` survives:** querying for any old category name that is NOT also a new sub-category name returns zero rows. (Categories whose name was both old AND new — e.g. `capability/Business & Governance` — survive via UPSERT with updated metadata; that is expected.)

```sql
-- Quick post-migration sanity dump
SELECT 'categories' AS what, COUNT(*) FROM ontology_categories
UNION ALL
SELECT 'entries (active)', COUNT(*) FROM ontology_entries WHERE status = 'active'
UNION ALL
SELECT 'entries with NULL category', COUNT(*) FROM ontology_entries WHERE category_id IS NULL
UNION ALL
SELECT 'categories with empty co_occurring', COUNT(*) FROM ontology_categories
  WHERE cardinality(co_occurring_category_ids) = 0;
```

Report the numbers in the build summary.

---

## Deployment

Run this migration in a quiet window. The DELETE of 126 categories briefly takes an exclusive lock — concurrent ontology reads will block for the transaction duration (~1 second at these volumes). Recommend off-hours deployment.

Migration filename: `supabase/migrations/<timestamp>_b1_fix3_prep_ontology_augmentation.sql`. Include this header comment at the top:

```sql
-- B1-fix3-prep: ontology augmentation migration
--
-- Adds 3 metadata columns to ontology_categories (keywords, example_entries,
-- co_occurring_category_ids), restructures the existing 126 single-level
-- categories into 70 richer sub-categories grouped by 5 headlines, re-parents
-- the existing 244 entries under the new categories, and adds 285 newly
-- authored entries.
--
-- Source seed: v3-copilot/ontology-seed/99-final-seed.json
-- Authored by: Cowork (NEXUS v3 ontology design)
-- §5 decisions: ~500 entries target / Nordic-primary weighting / defer
--                entry-description backfill / new Regulatory & Compliance
--                row / new Air Operations row.
--
-- After this lands: B1-fix3 build prompt (consultant four-action UX, edge
-- function metadata rendering, RPC for status='proposed' writes).
-- The 15-category cap on capability, competence, and product_type is now
-- in effect — further growth on those headlines requires revisiting the cap.
--
-- Deployment: run in a quiet window. The DELETE on 126 categories briefly
-- holds an exclusive lock.
--
-- Rollback: this migration cannot be cleanly rolled back. If a problem is
-- discovered post-deploy, write a forward migration to fix. Pre-deploy
-- safety guards (G1, G2, and the STEP 5 check) catch all known failure
-- modes inside the transaction.
```

---

## Verification (final report format)

Report after the migration completes:

```
## Schema delta
- Three new columns added to ontology_categories: PASS / FAIL
  - keywords text[]: PASS
  - example_entries text[]: PASS
  - co_occurring_category_ids uuid[]: PASS

## Safety guards
- G1 (unmapped old categories): zero unmapped — PASS
- G2 (production-tagged entries survive): PASS — entry id <…> preserved

## Row counts (before → after)
- ontology_categories: 126 → 70 (PASS / FAIL)
- ontology_entries (active): 244 → 529 (PASS / FAIL)
- ontology_entries with NULL category_id: 0 → 0 (PASS / FAIL)

## Co-occurring backfill
- Categories with empty co_occurring_category_ids: 0 (PASS / FAIL)
- Categories with NULL UUID in co_occurring: 0 (PASS / FAIL)

## Domain drops
- domain/Environmental Monitoring entries moved to capability/Sensors & Detection: PASS / FAIL
- domain/Training & Exercise entries moved to service_type/Training & Exercise Services: PASS / FAIL

## Hard limits respected
- tsc clean: PASS / FAIL (no TS changes expected)
- No edits to RPCs, edge functions, RLS policies: PASS / FAIL
- No edits to wizard / consultant onboarding: PASS / FAIL
- Migration is a single transaction with safety guards: PASS / FAIL

## Notes for Tore
- Anything surprising from the safety guards (e.g. categories with unexpected
  normalized_name values that the inferred mapping didn't catch).
- The one production tag's preserved entry id and its new category.
- Any sort_order decisions made for new entries (alpha vs monotonic).
```

---

## After this lands

B1-fix3 build prompt follows. Scope:

1. **Edge functions:** update `populate-role` and `interpret-need` to render the new category metadata (`description`, `keywords`, `example_entries`, `co_occurring_category_ids` → resolved names) in the prompt block sent to the model. Apply the prompt-window discipline noted in your earlier proposal §2 (filter by selected categories' `co_occurring`, render full metadata for first-pass match, entries-only for far-related).

2. **Wizard four-action UX:** the consultant sees four actions on each AI-proposed entry — map-to-existing (default), accept-as-new, map-and-propose, reject. Map-to-existing ranks suggestions by name fuzzy match + the new category metadata. Accept-as-new and map-and-propose write to `ontology_entries` with `status='proposed'`.

3. **RPC update:** `fn_onboard_verified_actor` writes proposed entries (`status='proposed'`) rather than dropping unmatched, preserving the consultant's accepted-as-new decisions.

4. **Audit log:** every consultant action on a proposal is logged for the future learning loop (deferred training task).

C2 (admin approval surface for `status='proposed'` entries) is a separate later iteration. Until C2 ships, proposed entries accumulate harmlessly — they remain invisible to non-admin readers because of existing RLS.
