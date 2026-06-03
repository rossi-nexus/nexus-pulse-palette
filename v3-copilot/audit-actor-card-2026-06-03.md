# Actor card audit and redesign proposal — 2026-06-03

Scope: `/actors/:id` (DB-side) + personal-collection equivalent + per-product
surfaces. Reference actor: Equipnor AS (`653d8628-…`). Read-only audit; one
defensive inline patch landed on `enrich-product-page` (see §1d).

---

## Phase 1 — Audit findings

### 1a. Section inventory (DB-side `/actors/:id`, render order)

Pulled from `src/pages/ActorProfile.tsx` (2 875 lines, sections rendered top-to-bottom).

| # | Section | Source table(s) | Edit mode | Visual | Provenance shown |
|---|---|---|---|---|---|
| 1 | Header (legal name, logo, hero, tags badge) | `actors`, `actor_media (logo/hero)` | Admin/verifier inline (MediaSlotEditor) | Banner + circle logo | None (logo/hero have no source label) |
| 2 | Tags | `actor_personal_tags` (personal side) / N/A on DB | Inline on personal only | Pill row | Partial — personal only |
| 3 | Identity (legal name, org #, websites, addresses, trade names, classification) | `actors` cols | Inline edit via toolbar | Two-column key/value | None (no per-field "verified at") |
| 4 | Capacity | `actor_capacity_attributes` | Admin only | Compact rows in `CapacityPanel` | Partial (verifier_confidence in schema, not surfaced) |
| 5 | Capabilities | `actor_ontology_tags` + `ontology_entries` (capability cat) | Chip-add | Chip grid via `OntologyEntryList` | Partial — chip click reveals source/evidence in `MetadataPanel` |
| 6 | Competences | same as 5 | Chip-add | Chip grid | Same — chip click |
| 7 | Domains | same | Chip-add | Chip grid | Same |
| 8 | Products | `actor_ontology_tags` (product cat) + `actor_descriptions(type='product')` + `actor_media(type='product')` | Chip-add + per-card "Enrich" + manual URL | `ProductCardGrid` cards | Per-card has Enrich button + new modal shows source_url/last_enriched_at — but card front shows nothing |
| 9 | Services | same shape as products | Chip-add + Enrich | Card grid | Same as 8 |
| 10 | Security Classification | `actor_certifications` | Admin only | List rows | Partial — confidence in schema not surfaced |
| 11 | Standards & Certifications | `actor_standards` | Admin only | List rows | Same |
| 12 | Customer History | `actor_customer_history` | Admin only | List rows | Same |
| 13 | Contacts | `actor_contacts` | Admin add/edit | Name/title/email/phone rows | None on card; source col exists but unused |
| 14 | Notes | `actor_notes` (personal layer) | Inline | Markdown-ish text | Personal-only |
| 15 | Source & Provenance | `actors.source`, `websites[]` | Admin | Plain text + link rows | This is the only section explicitly about provenance — and it's actor-level, not per-field |
| 16 | Related entities | `actor_relationships` | Admin | Mini-card grid | None |
| 17 | Aliases & former names | `actor_aliases` | Admin via dialog | Pill row | Partial (alias_type shown, source_url hidden) |
| 18 | Outcome history | `programme_outcomes` filtered by actor | Read-only | Timeline | Full (by definition — outcome is provenance) |
| 19 | Actions | RPCs (merge, verify, refresh) | Admin only | Button row | n/a |

**Personal-side equivalent** (`isPersonal=true` branch in same component):
identical render order, but sections 4/10/11/12/13/16/17 are hidden and the
"From your collection" panel (`FromYourCollectionPanel.tsx`, 492 lines) lives
in place of section 15. No visual divider — it just appears mid-page when
the actor row is a `user_personal_actors` row.

### 1b. Writers per section

Grouped by writer family.

| Section | Onboarding (A/B/C/D) | Enrichment | Manual | System |
|---|---|---|---|---|
| Identity | `fn_onboard_verified_actor` (A), `fn_approve_and_verify` (B), registry-import edge fn (C), `fn_verify_actor` (D) | `enrich-from-url`, `enrich-from-registry` | Inline edits | `fn_geocode_missing_…` (lat/lon) |
| Capacity | — | `analyze-actor` (proposes via consultant queue) | Admin dialog | — |
| Capabilities / Competences / Domains | A,B,D write via JSONB → consultant promotes | `analyze-actor`, `enrich-from-url`, `enrich-from-document`, `enrich-from-web-search`, `enrich-from-team-page` | Chip-add inline | `fn_backfill_actor_descriptions` (touches summary, not chips) |
| Products / Services | Same as chips | Same as chips **+ `enrich-product-page`** (descriptions+media+specs) | Chip-add, manual URL, manual image upload via `MediaSlotEditor` | — |
| Classification / Standards | Consultant onboarding | `enrich-from-document`, `enrich-from-web-search` | Admin dialog | — |
| Customer History | Consultant onboarding | `analyze-actor`, `enrich-from-url`, `enrich-from-web-search` | Admin dialog | — |
| Contacts | — | `enrich-from-team-page` (the scorer-backed one) | Admin add | — |
| Media (logo/hero/product/datasheet) | — | `scrape-actor-media` (logo+hero), `enrich-product-page` (product+datasheet) | `MediaSlotEditor` upload | — |
| Source & Provenance | All onboarding | enrichment functions append to `websites[]` | Admin edit | Audit log triggers |
| Related entities / Aliases | Admin onboarding | — | Admin dialog | — |

Trust per writer: A/B/C/D + admin inline = **verified**; consultant draft =
**pending**; auto enrichment functions = **auto**; user manual on personal
side = **user-asserted**.

### 1c. Provenance visibility today

What the user actually sees vs. what's in the schema:

- **Identity fields** — verified status badge exists at actor level
  (`verifierConfidence`, `verifiedAt`, `decaysAt`) but no per-field "this
  street address was last confirmed on …". The schema can support it; the UI
  doesn't.
- **Chips (capabilities/competences/domains)** — **best surface today**.
  Click a chip → `MetadataPanel` shows `source`, `evidence`, `source_url`,
  `accepted_at`, `confidence`. Working as designed. Legacy strings render
  with "Source: unknown".
- **Product cards** — front of card shows ontology raw_name + a small level
  badge. Nothing about whether description came from `analyze-actor` vs
  `enrich-product-page` vs manual. Modal (after batch #4) shows
  `source_url` + `last_enriched_at` — invisible until you open it.
- **Contacts** — `source` column exists (`manual` / scrape / etc.) but card
  shows only name/title/email/phone. No "auto-extracted from /teamet/" hint.
- **Descriptions** — `actor_descriptions.source` populated by writers
  (`analyze-actor` writes `auto`, consultant writes `manual`,
  `enrich-product-page` writes `auto_enrichment`). UI never reads it.
- **Media** — `actor_media.source` (`auto_scrape`, `auto_enrichment`,
  manual) populated but never surfaced. `crop_data.linked_product_name`
  drives product grouping but its provenance is opaque.

**Bottom line:** chips are the only place provenance is first-class. Every
other section hides it.

### 1d. Scrape quality audit (Equipnor failure mode)

Live DB state (queried during this audit):

```
actor_descriptions for Equipnor : 0 rows
actor_media       for Equipnor : 2 rows (logo + hero from auto_scrape, 2026-05-28)
```

So the messy images Tore screenshotted are **not currently persisted in the
DB** — they were produced by a recent `enrich-product-page` run whose insert
either failed silently (no error toast surfaced) or was reverted. The
described pattern, however, is reproducible from reading the code:

**Old code path** (`enrich-product-page` lines 519–534, before this patch):
1. `extractImages(html, productUrl)` returns up to 8 images surviving a
   filename deny-list (`favicon|logo|sprite|tracker|pixel|icon`).
2. **Every surviving image is force-tagged with the product being
   processed** — `crop_data.linked_product_name = productName` for all of
   them, no per-image association check.
3. Result: scraping the Equipnor home page (which has flag SVGs, partner
   logos for Reveal/Accuwatt/Fischer-Connectors/Persistent-System/Avss, and
   generic banners) while processing "C4ISR System" assigned every survivor
   to C4ISR. Same scrape against "Anti-Drone System" picked up
   `Flying-with-White-Light-300x168.png` (a partner brand asset).

**Signals the scraper used:** filename deny-list only. No association check.
The page's *URL* was scored before fetch (good), but once fetched, image
selection was "if it isn't obviously a tracker, link it".

**Signals it should use** (now implemented inline, see patch below):
- Filename contains the product slug or ≥75 % of its multi-word tokens.
- `alt` text contains the product name or all tokens.
- For `og:image`: only counts when the OG URL itself contains a slug/token.
- Declared width or height < 120 px → drop (flag/icon).
- SVGs whose filename hints at flags/countries → drop.
- Filename matches widened deny-list (now includes `flag`, `partner`,
  `badge`, `award`, `country_flag`, etc.).

**Inline defensive fix applied** (`supabase/functions/enrich-product-page/index.ts`):

1. **Widened `IMAGE_DENY_RE`** — adds `flag`, `country_flag`, `partner`,
   `badge`, `award`, `placeholder`, `spacer`, `banner_ad`.
2. **Tiny-image guard** — drops `<img>` with declared `width<120` or
   `height<120`.
3. **Flag-SVG guard** — drops `*.svg` whose filename mentions `flag` or a
   country trigram (`nor`, `swe`, `fin`, `dnk`, `usa`, `gbr`).
4. **New `hasStrongProductAssociation()`** — gating function that returns
   `linked=true` only when there's an explicit signal.
5. **Insert path now splits linked vs orphan** — surviving images are still
   stored, but those without an association signal are stored with
   `crop_data.linked_product_name = null` and
   `crop_data.candidate_product_name = productName` +
   `crop_data.link_reason = "no explicit product-association signal"`. The
   product card grid filters by `linked_product_name`, so orphans no longer
   pollute any product. They become reviewer-queue candidates instead.
6. **Diagnostics added** — response now exposes `images_linked` and
   `images_orphaned` so future runs are traceable.

This is the only behaviour change applied in this turn. Everything else is
proposal-only.

### 1e. Editor workflow audit

What an admin or owner does today to fix gaps on an existing actor:

| Missing thing | Today's path | Click count | Friction |
|---|---|---|---|
| Capability | Scroll to Capabilities → "Add" combobox → search ontology → click | 3 | OK — chip combobox is the strong pattern |
| Product | Same combobox in Products section | 3 | OK to add, but then Enrich is a second action (3+ more clicks per product) |
| Image (per product) | `ProductCardGrid` → product card → "Add image" pop-out → upload OR Enrich | 4–6 | Mixed — Enrich tries auto but no clear "this failed" guidance |
| Contact | Scroll to Contacts → "Add contact" dialog → 5-field form → save | 5+ | Heavy form; no scrape-team-page button on this surface (it lives in admin utilities) |
| Address | Scroll to Identity → click address row → inline edit → blur to save | 3 | OK |
| Alias | Scroll to Aliases → "Add alias" dialog → name + type + date → save | 4 | OK but buried far down |
| Relationship | Scroll to Related entities → dialog → search target actor → pick type | 5 | High-friction (rarely used) |

**Where it gets hard:**
- No "what's missing on this actor" affordance. The editor has to scroll
  every section and judge for themselves.
- No wizard guidance — each section is independently editable but there is
  no orchestrated "fill the gaps" flow.
- `scrape-actor-media` (logo+hero) and `enrich-from-team-page` (contacts)
  are reachable from admin utilities but not from the actor page itself.
- Provenance for any change made manually never surfaces — verifier_id and
  verified_at are admin-only DB columns.

### 1f. Path A vs Path C consolidation

**Path A — Direct DB onboarding (`fn_onboard_verified_actor`):** consultant
fills the blank Add Actor wizard, writes directly into `actors` with
`verification_status='verified'`. No registry lookup. Output: verified row.

**Path C — Registry import then enrich (registry-import edge function):**
hits BRREG/CVR/PRH for a known org number, creates an `actors` row with
registry-sourced legal name + address + org_number, status `verified`.
Consultant then enriches the remaining fields (capabilities, contacts,
products, media) manually — same surfaces as A.

**Divergence point:** only the **first screen**. A starts with a blank
form. C starts with a pre-populated form. From the second screen on,
identical.

**Merge point:** the consultant's enrichment work after the first screen is
the same edit surface — chips, contacts, products. Both paths produce a
verified actor and a backlog of "now enrich the rest".

**Edge cases C currently misses:**
- Foreign suppliers (no Nordic registry hit) → today consultant falls back
  to A.
- Government entities / NGOs not in Brønnøysund → same fallback.
- Multi-country groups with parent in registry but Norwegian subsidiary
  needing enrichment → registry returns parent, consultant has to manually
  re-key the subsidiary.

**Recommendation:** **hybrid (see §2g).** One entry point, registry-first
with automatic fallback to blank form when no hit, and the post-creation
enrichment surface is the proposed §2c wizard regardless of which path
populated the initial row.

---

## Phase 2 — Redesign proposal

### 2a. Section structure + visual hierarchy

Today: 19 sections stacked vertically with identical `ProfileSection`
chrome. Proposal: regroup into 5 cards with collapsible bodies, each card
has a clear role and presence indicator.

```
┌─ HEADER ───────────────────────────────────────────────────────────────┐
│ [LOGO] Equipnor AS                          [VERIFIED · decays 14 Dec] │
│ Anti-Drone · C4ISR · UAV                    [Role badge: ADMIN VIEW]   │
│ Tønsberg, NO · equipnor.no                  [Complete this card ▸]     │
└────────────────────────────────────────────────────────────────────────┘

┌─ 1. IDENTITY & REGISTRY ─────────────────────────── ● Complete ─────┐
│ Legal name · Org # · Addresses · Trade names · Websites · Classif.  │
│ Each row carries a small provenance chip (see 2b).                  │
└─────────────────────────────────────────────────────────────────────┘

┌─ 2. WHAT THEY DO ────────────────────────────────── ◐ Partial ──────┐
│ Tabs: Capabilities | Competences | Domains | Products | Services    │
│ Chips today, plus product/service tabs swap chip grid for card grid │
│ with the redesigned per-product card (see 2e).                      │
└─────────────────────────────────────────────────────────────────────┘

┌─ 3. CREDENTIALS ─────────────────────────────────── ○ Missing ──────┐
│ Security Classification · Standards · Customer History · Capacity   │
│ Today four separate sections — same shape, group them.              │
└─────────────────────────────────────────────────────────────────────┘

┌─ 4. PEOPLE & RELATIONSHIPS ──────────────────────── ◐ Partial ──────┐
│ Contacts · Aliases · Related entities                               │
└─────────────────────────────────────────────────────────────────────┘

┌─ 5. PROVENANCE & OUTCOMES ───────────────────────── ● Complete ─────┐
│ Source URLs · Audit log (consultant view) · Outcome history         │
└─────────────────────────────────────────────────────────────────────┘

┌─ MY COLLECTION ON EQUIPNOR ──────────────── (visually separated) ───┐
│ Distinct background colour. User notes/tags/personal evidence.       │
│ Read-only on canonical view; full edit on /personal/:id.             │
└─────────────────────────────────────────────────────────────────────┘
```

**Conventions:**
- Each card header carries a presence dot: ● complete · ◐ partial · ○
  missing · ⚠ stale (past `decays_at`).
- Cards are independently collapsible; collapsed state remembered per user.
- Verification colour band on left edge: green = verified, amber =
  consultant-pending, slate = auto, blue = user-asserted, red = stale.
- Tabs inside "What they do" reuse the existing chip grid + the redesigned
  product card; no duplicate code.

### 2b. Provenance + trust visibility

Universal badge taxonomy applied to every chip, card, row:

| Badge | Meaning | When shown |
|---|---|---|
| ✓ Verified · {date} | `verifier_id` set, not past decay | All verified rows |
| ⏳ Pending review | In consultant queue | Items waiting verification |
| 🤖 Auto-extracted | `source IN ('auto', 'auto_enrichment', 'auto_scrape')` | Anything written by an enrich-* edge function |
| ✎ User-asserted | Personal layer or consultant draft pre-submit | Personal-side + draft |
| ⚠ Stale | `decays_at < now()` | Verified items past expiry |

Per surface:
- **Chips:** keep current `MetadataPanel` (works well), add the badge to
  the chip itself as a tiny coloured dot in the top-right corner.
- **Cards (products/services/contacts/customers):** badge in card header
  next to the title. Hover shows source URL + last action.
- **Identity rows:** inline badge after each value.
- **Media (logo/hero/product image):** badge as small overlay in
  bottom-right of the image, plus full provenance in the existing
  MediaSlotEditor.

Source labels (consistent across all surfaces):
- `auto_enrichment` → "Auto-extracted from {hostname}"
- `auto_scrape` → "Auto-extracted (homepage)"
- `manual` → "Added by {user.name}"
- `consultant_completion` → "Verified by {verifier.name} on {date}"
- `registry` → "From {BRREG|CVR|PRH} · {date}"
- `pipeline_*` → "Discovered via pipeline search ({session date})"

### 2c. Build-the-card wizard for editors

Trigger: a **"Complete this card"** button in the header, visible when any
section has presence dot ◐ or ○. Opens a side sheet (not modal — sheet
keeps the profile visible).

Step flow:
1. **Scan** — compute missing/partial sections by querying the same data
   each section uses (capabilities count, contacts count, has-address,
   has-logo, etc.).
2. **Plan** — present a checklist of gaps. Editor reviews and unchecks any
   they want to skip permanently ("not applicable to this actor"). Skipped
   items write `actor_section_skips(actor_id, section_key, reason)` so they
   don't reappear next time.
3. **Walk** — sequential steps, one per remaining gap. Each step renders
   the *right* input for that section:
   - Missing capability/competence/domain → ontology combobox (reuses
     existing `EnrichmentToolbar`).
   - Missing product → combobox + immediate per-product enrich panel.
   - Missing image → embed `MediaSlotEditor` + optional `scrape-actor-media`
     trigger.
   - Missing contact → embed `enrich-from-team-page` trigger first, then
     manual form if no results.
   - Missing address → registry refresh button + manual fallback.
   - Missing aliases / relationships → minimal forms.
4. **Confirm** — summary of what was added/skipped; one-click "save and
   close". Each manual add writes with `source='manual'` and
   `verifier_id=auth.uid()` so the badge taxonomy reflects the work.

Constraint: does not duplicate onboarding (which creates a new actor); only
fills gaps on existing rows.

### 2d. My Collection divider on DB profile (P_A)

When a user has personal evidence about a verified actor (via
`user_personal_actors.merged_actor_id`), the DB profile gains a 6th card
at the bottom titled **"My collection on {actor_name}"** with:

- Distinct background colour (slate-tinted) and a `[Personal]` chip in the
  header.
- Read-only here. Full edit lives on `/personal/{personal_id}`. A link
  "Edit in my collection ▸" jumps there.
- Personal notes, personal tags, personal evidence (URL list, files
  uploaded by the user).
- **Conflict handling:** when a personal-side field disagrees with
  canonical (e.g., user wrote "based in Oslo" but canonical says Tønsberg),
  render the conflict as a small banner inside the card: "You noted a
  different address. [Compare] [Suggest correction]". "Suggest correction"
  routes through the existing one-way suggest flow.

### 2e. Per-product detail view + enrich refinement (P_B)

**Refined enrich flow** (called out in §1d, partially landed inline):
1. Discovery (unchanged) — score candidate URLs.
2. Page fetch + extraction (unchanged).
3. **Strong-association filter** (landed inline) — images without an
   explicit product-association signal are stored as orphan candidates,
   not linked.
4. Description / specs / datasheets — these stay product-linked (because
   the page itself was matched on a strong product-URL score).
5. **Reviewer queue** — orphan candidates surface in a new admin utility
   "Unlinked product media" so a human can re-assign or delete them.

**Detail view:** recommend **sub-route** `/actors/:id/products/:slug`
instead of the modal. Reasons:
- Deep-linkable and shareable (consultant can paste the URL).
- Allows a richer layout (image carousel + spec table + datasheet column).
- Modal stack on top of an already-busy profile is the wrong affordance
  for "this is the canonical product page on our platform".
- Trade-off: an extra route + breadcrumb. Worth it.

**Auto-discovery framing:** the per-card button reads **"Try auto-fill
(best effort)"** when no override URL is set; **"Re-enrich from {url}"**
when an override exists. Manual URL paste is the primary, auto-discover is
the secondary affordance — flips today's emphasis.

**Actors whose website does not display products** (Equipnor case): when
discovery returns no candidate above threshold (today: score < 10), the
response should surface "We couldn't find a product page on
{actor.websites[0]}. Try one of these instead:" with auto-suggested
manufacturer brand domains parsed from page copy (e.g., Equipnor's site
mentions Reveal/Accuwatt/Fischer-Connectors — those become quick-link
suggestions). Implementation note: add a `discovered_referenced_brands`
field to the diagnostics; UI renders them as clickable URL chips that
pre-fill the manual override box.

### 2f. Role-aware breadcrumb / badge (P_C)

Small pill in the header strip, right-aligned next to the verified badge:

- **ADMIN VIEW** — full edit, all sections, audit log visible.
- **CONSULTANT VIEW** — same edit rights on assigned actors; audit
  visible.
- **OWNER VIEW** — actor's verifier sees their own verifications
  highlighted.
- **PERSONAL VIEW** — only My Collection card editable; canonical
  read-only.
- **READER VIEW** — everything read-only.

Per-action labelling: destructive admin actions in the Actions card stay
labelled "(Admin)" even when the user is an admin, so the role hat is
visible at the action site too.

Implementation: derive role from `users.role` + actor ownership
(`verifier_id === auth.uid()`) + ABAC scope once 6.5.1 lands. Until then,
admin / consultant / other tri-state is enough.

### 2g. Path A vs Path C recommendation: **hybrid**

Single "Add actor" entry point. Two-screen flow:

1. **Screen 1 — Identify.** Org number (or country + name) + country
   picker. Submitting tries registry (BRREG/CVR/PRH based on country) →
   if hit, pre-fills screen 2; if miss, screen 2 opens blank.
2. **Screen 2 — Confirm & enrich.** Pre-filled or blank form for the
   identity card. On save, creates `actors` row with
   `verification_status='verified'` and launches the §2c wizard for the
   remaining gaps.

Edge cases preserved:
- Foreign suppliers → registry miss → blank screen 2 → still creates
  verified row.
- Government / NGO not in Brønnøysund → same as above.
- Multi-country group / subsidiary → screen 1 explicitly asks "are you
  adding the entity that owns this org number, or a subsidiary?" with
  default = "the entity itself".

Trade-off: registry success rate determines perceived speed. Today's
separate A/C paths let the consultant skip registry when they know it'll
miss; hybrid forces a probe. Mitigation: a "Skip registry, go straight to
blank form" link on screen 1.

### 2h. Implementation sequencing

Recommended 3 batches.

**Batch A — Section regrouping + provenance badges (M complexity)**
- Refactor `ActorProfile.tsx` from 19 sections into 5 cards (§2a).
- Add badge taxonomy component (§2b); wire it everywhere by reading the
  existing `source` / `verified_at` / `decays_at` columns.
- Add per-card presence dot.
- *Depends on:* nothing. Can ship immediately.
- *Risk:* the 2 875-line `ActorProfile.tsx` is large; this is a structural
  refactor — needs careful diff review.

**Batch B — Editor experience: wizard + role badge + My Collection card (L complexity)**
- Build the "Complete this card" sheet (§2c) + `actor_section_skips`
  table.
- Add role-aware pill (§2f).
- Add the My Collection card on canonical profile (§2d) with conflict
  banner.
- *Depends on:* Batch A (consumes the new card structure).

**Batch C — Per-product detail route + reviewer queue + hybrid Add Actor (L complexity)**
- New `/actors/:id/products/:slug` route (§2e).
- "Unlinked product media" admin utility for orphan reviewer queue (the
  inline fix from §1d puts items there; this batch builds the surface).
- Hybrid Add Actor flow (§2g) — combines A+C entry points.
- Manufacturer-brand suggestion on discovery miss.
- *Depends on:* Batches A+B (uses new card structure for the product
  detail page).

Optional Batch D (defer): backfill provenance labels for legacy rows where
`source IS NULL`. Not blocking.

---

## Inline fixes applied

`supabase/functions/enrich-product-page/index.ts` — defensive image
linking (see §1d for full description). Summary:
- Widened `IMAGE_DENY_RE` (flag, partner, badge, etc.).
- Drop tiny `<img>` (width or height < 120).
- Drop flag-style SVGs by filename.
- New `hasStrongProductAssociation()` gate: linked vs orphan.
- Insert path splits — orphan candidates persisted with
  `crop_data.linked_product_name=null` + `link_reason` so they don't
  pollute product cards.
- Diagnostics expose `images_linked` / `images_orphaned`.

No DB schema change required (`actor_media.crop_data` is JSONB). Existing
rows are unaffected; only future enrich runs benefit. Re-running on
Equipnor will produce 0 mislinked images (instead of 8).

---

## Open questions for Tore

1. **Tabs vs separate cards inside "What they do" (§2a).** Tabs hide
   Capabilities while looking at Products. Acceptable trade-off?
2. **Section skip list (§2c).** Do we want consultants to be able to mark
   sections "not applicable" permanently per actor, or should the wizard
   re-show them on every visit?
3. **Sub-route for products (§2e).** Are you OK introducing a new URL
   shape, or do you want the modal kept and just made bigger?
4. **Hybrid Add Actor (§2g).** Is "always try registry first" acceptable,
   or do you want the "skip registry" link to be the default for
   consultants?
5. **Role badge wording (§2f).** "ADMIN VIEW" / "PERSONAL VIEW" — keep
   uppercase shouty or soften to "Admin" / "Personal"?
6. **Backfill scope.** The inline fix only helps future runs. Do you want
   batch D to also re-process already-stored mislinked rows
   (`source='auto_enrichment'` with weak association)?
