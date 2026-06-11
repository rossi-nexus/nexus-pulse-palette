# SX-01 Pre-flight Audit + Proposal — Step 2 Interpretation Brain & Axis-as-Questioner

**Status:** Audit + proposal only. No code changes in this turn.
**Author:** Lovable agent · 2026-06-11
**Queue position:** WS1 prompt 01 of the Search Excellence stream. Precedes SX-02 (build).
**Pattern:** Mirrors `prompt-v3-axis-01-preflight-audit-and-proposal.md` and `audit-actor-card-2026-06-03.md`.

---

## Executive summary

Three gaps block the next stage of Search Excellence:

1. **Axis is a stub.** `AxisSidebar.tsx` renders one static line and a disabled `<input>`. The only dynamic content is the `clarificationPoints[]` from Step 2's `interpret-need` response, which the sidebar passively echoes. There is no model call, no per-step context, no question→action loop, no tracked-change writeback. **Severity: CRITICAL** for the SX roadmap (Axis-as-questioner is WS1's load-bearing concept).
2. **Constraints encode procurement shape, not effect + real-world context.** `Constraints` covers physical geography, classification, capacity, certifications, standards, contract duration, urgency, budget, language, and a free-text `search_context`. It does **not** encode (a) geography *intent* — local/regional/national/allied/unrestricted sourcing, (b) **resilience posture** — steady-state vs crisis/wartime, or (c) **value-chain sensitivity** — chokepoint / foreign-dependency / single-source exposure. The `search_context` enum already contains `supply_chain_analysis`, so the seam exists but is not typed. **Severity: MODERATE → CRITICAL** for military/resilience use cases.
3. **No effect chain.** `Role[]` is a flat priority-ordered list. `RoleDependency` exists on the type but is rendered only as a one-line "Depends on: X — description" footnote in `RolesSection.tsx` and is not produced as a chain. `SummaryPoint.covered_by_roles` already wires summary→role coverage, but there is no ordered effect chain (sense → fuse → decide → act) that Step 3's market map or Step 5's coverage view can consume. **Severity: MODERATE**.

All three gaps can be closed **additively** — no migration of existing locked sessions, no breaking change to the `submit_interpretation` tool schema, no disruption to the track-changes (`source`/`status`) model. The proposal below defines the schema seams now and defers reasoning-engine work (resilience scoring, chokepoint analysis) to later SX prompts.

---

## Phase 1 — Audit

### 1a. Interpretation pipeline inventory

**File:** `supabase/functions/interpret-need/index.ts` (truncated read, ~329 lines visible of 726).

- **System prompt** is one large string (`SYSTEM_PROMPT`, ll. 11–100). It instructs the model on summary shape (3–6 points), role decomposition (3–7 roles, domain-segmented), ontology selection (use real IDs only, propose-new mechanism), and exhaustive per-axis constraint extraction with inline examples. Each constraint axis has a dedicated paragraph (lines 57–96) plus an `inference_paths` instruction that drives the downstream "Why constrained?" UI.
- **Tool-call schema:** single function `submit_interpretation` (ll. 102–294) returning `summary[]`, `roles[]`, `constraints{}`, `clarification_points[]`. This is the canonical contract.
- **Constraint fields emitted** (ll. 173–276): `geography{countries,regions,cities}` (physical only — no `radius_km` or `referencePoint` despite the TS type declaring them), `company_size`, `security_classification.required_level` (enum), `readiness{max_response_time,description}`, `capacity{description,min_value,max_value,unit,min_team_size,max_mobilization_days,confidence}`, `standards{required,preferred}`, `certifications{required,preferred,confidence}`, `language{required,confidence}`, `urgency{level,rationale,confidence}`, `budget{max_eur,currency_original,confidence}`, `contract_duration{duration,value,unit,type}`, `search_context` (free string in schema; UI restricts to four enum values), and `inference_paths{}`.
- **Model:** Lovable AI Gateway, tool-call mode. Specific model id not visible in lines 1–329 but the function is JWT-gated per Rule #23 (auth check ll. 302–309, user verification ll. 321–329).

**Drift between emitted shape and `src/types/interpretation.ts`:**

| Type field | Edge function emits | Drift |
|---|---|---|
| `Constraints.geography.maxDistanceKm` | not in tool schema | **MODERATE** — type advertises a field never produced |
| `Constraints.geography.referencePoint` | not in tool schema | **MODERATE** — same |
| `Constraints.certifications` | emitted | type declares `standards` only at one place and `certifications` at another — `ConstraintPills.tsx` already defensively reads either |
| `RoleDependency.id` | not emitted (only `depends_on_role_name` + `description`) | **COSMETIC** — UI rehydrates with `crypto.randomUUID()` somewhere (assumed; not verified in this audit) |
| `SummaryPoint.covered_by_roles` (role UUIDs) | emits `covered_by_role_indices` (positional ints) | **MODERATE** — caller must re-map indices to UUIDs after roles are assigned ids |

None of these block the SX-02 build but they should be reconciled before the type surface grows further (Rule #24 — shared types only).

### 1b. Step 2 UI inventory

| Component | Renders | Edit surface |
|---|---|---|
| `InterpretationStep.tsx` | top-level container: not-started → processing → editing → locked | drives lock/unlock; renders SummarySection / RolesSection / ConstraintsSection in editing mode, read-only in locked review |
| `SummarySection.tsx` (not opened — referenced) | bullet list of `SummaryPoint`s | accept/reject/edit/add; coverage hint from `covered_by_roles` |
| `RolesSection.tsx` | flat ordered list of `RoleCard`s with drag-reorder | per-role: edit name, delete/restore, expand to see description+reasoning+ontology targets+dependencies; ontology toggle via checkbox; dependencies shown as one-line text only |
| `ConstraintsSection.tsx` | one `ConstraintRow` per declared axis + "Add constraint" menu | inline edit per axis; `addableTypes` is a closed list of 8 keys |
| `ConstraintPills.tsx` | derived compact pills above result list (Step 3+) | remove-pill closes one axis-value at a time; calls `onRemove(key)` which the slide-over re-runs |
| `EditConstraintsSlideOver.tsx` | rich edit drawer over the locked interpretation | reset-to-original; apply re-runs the search |

**Where new dimensions surface with least disruption:** `ConstraintsSection`'s `addableTypes` array + `defaults` map + a new `ConstraintRow` block. `ConstraintPills.buildConstraintPills()` and `EditConstraintsSlideOver` mirror the same shape. Adding an axis touches three files for the user-facing surface, plus the tool schema in `interpret-need` and the type in `src/types/interpretation.ts`.

**RoleDependency in UI today:** read-only one-line footnote per dependency (`RolesSection.tsx` ll. 286–296). Not editable, not visualised as a graph, not ordered. Cannot today represent an effect chain — only pairwise annotations.

### 1c. Axis current state

- **`AxisSidebar.tsx`** (61 lines, full read): header, one hardcoded paragraph ("Describe your need or attach files and URLs. I'll analyze everything in the next step."), a `clarificationPoints.map()` block that renders each `{question, context}` from Step 2 as a static bubble, and a disabled input + send button. **No live model call.**
- **Wiring:** `PipelineView.tsx` mounts `<AxisSidebar clarificationPoints={stepA2.clarificationPoints} />` once at line 381 — **global**, not per-step. `clarificationPoints` are produced exclusively by `interpret-need` (Step 2) and persisted in `session_step_states.locked_output` alongside the interpretation. No other step contributes context to Axis.
- **Context Axis can see today:** only the `clarificationPoints[]` prop. It does not receive the current step id, the locked outputs of prior steps, the selected role/actor, or any session metadata. Everything else lives one component up in `PipelineView`.
- **Existing inference home for Axis:** **none**. No edge function or hook is wired to Axis. This is greenfield — the closest pattern is `populate-role` (single-shot JWT-gated edge function returning structured JSON) but Axis needs a different shape (question generation + answer interpretation).

### 1d. Constraint → downstream usage

- **Path traced:** `useSearch.ts` → `search-role` edge function → ranking RPC (v2 from AX3a).
- **Inside `search-role`** (read ll. 1–120): the constraints are **not** referenced by typed field name. `rg -n "geograph|countries"` against `search-role/index.ts` returns zero matches. The constraints object is passed through and inlined into the LLM query-synthesis prompt as free-text context (see `QUERY_SYNTHESIS_PROMPT` ll. 10–34 — "Include geographic terms from the constraints if present"). The actual hard filter on `country` happens later in the v2 ranking RPC (AX3a), not in `search-role`.
- **Implication for new dimensions:** A new field like `geography.sourcing_intent` or `resilience.posture` will be invisible to `search-role` and the ranking RPC until each is taught about it. The seam this preflight defines must therefore be both **typed** (so the RPC can switch on it) **and** **prompt-injected** (so `search-role`'s query synthesis can reason about it). This is a real-but-deferred consumption task — SX-02 defines the data, SX-03 wires the consumers.

---

## Phase 2 — Proposal

### 2a. New interpretation dimensions

All additive to `Constraints` and `Role`. Backward-compatible: existing locked sessions read as if the new fields are absent (default = unconstrained / steady-state).

#### (i) Geography intent — sourcing scope

**Why:** Today `geography.countries=[NO]` means "filter to Norwegian-located actors". It cannot say "we want anything reachable from Norway in peace", "allied-only", or "domestic supply required for sovereignty reasons". Different intents demand different downstream behaviour even when the country list is identical.

**Proposed shape** (extends existing `GeographicConstraint`):

```ts
export type SourcingIntent =
  | "local"        // sub-national: same region/city as reference point
  | "national"     // domestic sourcing required (sovereignty)
  | "regional"     // e.g. Nordic, Baltic
  | "allied"       // NATO/EU/Five Eyes — political alignment
  | "unrestricted"; // global, lowest-cost or best-fit wins

export interface GeographicConstraint {
  // existing
  countries?: string[];
  regions?: string[];
  cities?: string[];
  maxDistanceKm?: number;
  referencePoint?: string;
  // new
  sourcing_intent?: SourcingIntent;          // default "unrestricted"
  sourcing_intent_rationale?: string;        // free text from interpret-need or Axis
}
```

**Extraction** (`interpret-need` system prompt): add a "Sourcing Intent" extraction paragraph alongside Security Classification. Trigger phrases: "sovereign", "domestic", "Norwegian-only", "allied partners", "NATO suppliers", "Nordic preferred", "wherever best". Default `unrestricted` when unspecified. Add an `inference_paths.sourcing_intent` entry citing the source phrase.

**Downstream effect** (SX-03 prompt, not this one): the v2 ranking RPC weighs `country` as a hard filter only when `sourcing_intent in (national, regional, allied)`; otherwise it stays soft. `search-role` query synthesis adds "domestic" / "allied" terminology when applicable.

#### (ii) Resilience posture

**Why:** A military user searching "is this value chain intact in crisis and war" today gets a distance filter. The interpretation has no switch that says "evaluate this against disruption scenarios, not steady-state procurement".

**Proposed shape** (new top-level constraint):

```ts
export type ResiliencePosture =
  | "steady_state"           // default — peacetime procurement
  | "crisis_response"        // pandemic, natural disaster, civil emergency
  | "wartime_continuity";    // armed conflict, sustained disruption

export interface ResilienceConstraint {
  posture?: ResiliencePosture;        // default "steady_state"
  scenarios?: string[];                // free-text scenarios the user named
  confidence?: "high" | "medium" | "low";
}

// added to Constraints:
export interface Constraints {
  // ...existing
  resilience?: ResilienceConstraint;
}
```

**Extraction:** triggers include "crisis", "war", "wartime", "preparedness", "Total Defence", "totalforsvar", "beredskap", "valuable in conflict", "must survive disruption". Defaults to `steady_state` when unspecified. Stored in `inference_paths.resilience`.

**Downstream effect** (SX-03+): when posture ≠ `steady_state`, `sourcing_intent` defaults harden (e.g. `crisis_response` implies at minimum `regional`; `wartime_continuity` implies at minimum `national`). The ranking engine adds a resilience subscore. The market-map (Step 3) renders a posture badge.

#### (iii) Value-chain sensitivity

**Why:** Even within an "allied" sourcing intent, a single-source dependency on a foreign component breaks the value chain under disruption. This needs a typed seam now so SX-04's reasoning engine can light up.

**Proposed shape** (new constraint; minimal — seam only):

```ts
export type ChokepointConcern =
  | "single_source"          // only one viable supplier
  | "foreign_dependency"     // critical input from outside sourcing intent
  | "transport_chokepoint"   // physical route (e.g. Suez, Bosphorus)
  | "energy"                 // power/fuel
  | "telecom"                // comms infra
  | "raw_materials";         // critical minerals etc.

export interface ValueChainConstraint {
  sensitive?: boolean;                       // user explicitly flagged
  chokepoint_concerns?: ChokepointConcern[]; // structured tags
  notes?: string;                            // free text
  confidence?: "high" | "medium" | "low";
}

// added to Constraints:
export interface Constraints {
  // ...existing
  value_chain?: ValueChainConstraint;
}
```

**Extraction:** triggers include "supply chain", "single-source risk", "chokepoint", "foreign dependency", "rare earths", "GPS-denied", "GNSS resilience", and the existing `search_context=supply_chain_analysis` (which should now auto-imply `value_chain.sensitive=true` as a default).

**Downstream effect:** **none in SX-02.** This is a seam. SX-04 ships the analyser that consumes the structured concerns and walks the actor's declared inputs/suppliers/standards. We define the type now so SX-04 doesn't need a migration.

#### (iv) Effect chain

**Why:** Roles are flat-priority today. The user mental model is sequential: sense → communicate → fuse → decide → act. Representing the chain is what makes Step 3 market-map renderable as a flow and Step 5 coverage/gap meaningful per stage.

**Proposed shape** (additive — does **not** replace `dependencies[]`):

```ts
export interface EffectChainNode {
  role_id: string;        // FK into Interpretation.roles[].id
  stage: string;          // user-readable label, e.g. "sense", "decide"
  stage_index: number;    // ordered position in the chain (0-based)
}

export interface EffectChain {
  id: string;
  name?: string;          // optional chain name (multi-chain support later)
  nodes: EffectChainNode[];
  source: "axis" | "manual";
  status: "accepted" | "rejected" | "pending";
}

export interface Interpretation {
  // ...existing
  effect_chains?: EffectChain[];  // optional, additive
}
```

**Compatibility:** absent on every existing locked session. UI renders the flat role list when missing, the chain flow when present. `RoleDependency` stays for cross-cutting "Role X depends on Role Y for input" annotations that don't fit a linear stage.

**Generation:** `interpret-need` proposes one effect chain when the need is naturally sequential (most military/preparedness needs are). Axis can propose, edit, or strip the chain via the same tracked-change semantics (`source: "axis"`).

---

### 2b. Axis-as-questioner architecture

#### Questioner model

Axis becomes **per-step-aware**. The sidebar is no longer global static; it receives `currentStep` and the locked outputs that step has access to, and generates 2–3 plain-language clarifying questions sharpened to that step's open ambiguities.

**Question generation contract** (new edge function `axis-question`):

```ts
// request
{
  session_id: string,
  step: "A1" | "A2" | "A3" | "A4" | "A5",
  step_context: {
    // step-specific; for A2 includes interpretation + clarification_points
    // for A3 includes role being searched + early actor list, etc.
  }
}

// response
{
  questions: Array<{
    id: string,
    question: string,           // plain English, 1 sentence
    context: string,            // why we're asking
    answer_kind: "free_text"
                | "single_choice"
                | "multi_choice"
                | "boolean",
    options?: string[],         // when answer_kind ∈ {single,multi}_choice
    proposed_action: {          // what Axis will do if answered
      kind: "update_constraint"
          | "rescope_role"
          | "split_role"
          | "rerun_role"
          | "set_effect_chain"
          | "noop",
      target?: { constraint_path?: string; role_id?: string },
      value?: unknown,          // bound at answer-time
    },
  }>;
}
```

**Type extension:** `ClarificationPoint` is preserved for backward compatibility and gets a sibling type:

```ts
export interface AxisQuestion extends ClarificationPoint {
  id: string;
  answer_kind: "free_text" | "single_choice" | "multi_choice" | "boolean";
  options?: string[];
  proposed_action: AxisAction;
  answered_at?: string;
  answer?: unknown;
  applied_change_id?: string;   // FK to a tracked change
}
```

**Answer capture:** when the user answers in the sidebar, the answer flows through a second edge function call (`axis-resolve`) which converts `proposed_action` + `value` into one or more tracked changes (`source: "axis"`, `status: "pending"`) applied to the interpretation. The user sees the change appear in Step 2 with the existing teal "edited" indicator and can accept/reject like any other tracked change.

#### Axis-as-actor (scoped step actions)

The contract between Axis and a step is the **tracked change**, not a black-box re-analyse. Every action Axis performs is:

1. **Scoped** — touches one constraint axis or one role, never the whole interpretation.
2. **Reversible** — appears as a `source: "axis"` change with `status: "pending"`; the user accepts or rejects.
3. **Logged** — written to a per-session `axis_actions` table (also satisfies Rule #30 audit logging seam).

Examples:

| User answer | proposed_action | Effect |
|---|---|---|
| "Domestic only" | `update_constraint(geography.sourcing_intent = "national")` | One change pill, accept to apply |
| "We need GPS-denied operation too" | `rescope_role(role_id=X, add target: domains+="GNSS-denied")` then `rerun_role(X)` | Role marked re-running; only that role re-fetches |
| "This is wartime continuity" | `update_constraint(resilience.posture = "wartime_continuity")` + auto-propose `sourcing_intent` hardening | Two linked tracked changes, accepted atomically (RPC, Rule #25) |

Rerun is **scoped to the affected role(s)**, never the whole pipeline — preserving the existing A3/A4 sequential, locked-output contract.

#### Inference home & data-sovereignty abstraction

- **Edge functions:** `axis-question` and `axis-resolve`. Both JWT-gated (Rule #23). Co-located in `supabase/functions/` and import from a new `_shared/axis-prompts.ts`.
- **Model choice:** `google/gemini-3-flash-preview` for question generation (fast, tool-calling, cheap). `google/gemini-2.5-pro` reserved for `axis-resolve` only when the action involves multi-axis inference (e.g. resilience-implies-sourcing-intent reasoning). Per `ai-models-catalog`.
- **Data-sovereignty abstraction (roadmap §7 Dec. 4):** introduce `supabase/functions/_shared/llm-client.ts` exposing `callLLM({ model, tools, messages, requestKind })` that wraps the Lovable AI Gateway. **All new Axis call sites go through this helper.** Existing edge functions are not migrated in SX-02 — they will be backported in a dedicated cleanup prompt (Rule #31). This is the only place the gateway URL and `Lovable-API-Key` header live, so swapping provider or routing tenant-X to a different region is a one-file change. **Flagged explicitly** — Tore should confirm scope (Axis-only vs migrate-all-now) before SX-02 lands.

---

### 2c. Forward seams (WS2 / WS3)

- **WS2 System Builder (capability dossier):** the `EffectChain` + selected-actor set is the natural input. By storing the chain as `{role_id, stage, stage_index}` we keep it dossier-renderable as a flow with one actor slotted per stage. No change needed in WS2 to consume.
- **WS3 tenant scoping:** every new constraint dimension (`sourcing_intent`, `resilience`, `value_chain`) lives inside `Constraints`, which is already persisted per-session and per-saved-search. Tenant scoping is a row-level concern (programmes + ABAC, Rule #26), not a field-level one — the proposed schema does not block it. **Confirmed safe.**
- The `llm-client.ts` abstraction also unblocks WS3 model-per-tenant routing later (Dec. 4 sovereignty work).

---

### 2d. Implementation plan

| # | Scope | Depends on | Verification gate |
|---|---|---|---|
| **SX-02** | Build Step 2 dimensions: extend `Constraints` with `geography.sourcing_intent`, `resilience`, `value_chain`; teach `interpret-need` to extract them; add UI rows in `ConstraintsSection` + pills + slide-over; add optional `effect_chains[]` to `Interpretation` and a minimal flow renderer. **Additive only — no migration.** | This preflight approved | Run a known-resilience query ("Narvik C4ISR, must survive wartime disruption"); verify `resilience.posture="wartime_continuity"`, `sourcing_intent="national"`, `value_chain.sensitive=true`; verify UI rows render and are editable; verify locked older sessions still load. |
| **SX-03** | Axis-as-questioner foundation: create `_shared/llm-client.ts`; create `axis-question` + `axis-resolve` edge functions (JWT-gated); rebuild `AxisSidebar` to consume `currentStep` + per-step context, render typed answer inputs, post answers to `axis-resolve`, surface returned changes as tracked `source:"axis"` items. Reuse `ClarificationPoint` rendering path. | SX-02 | Open Step 2 with a vague need; Axis surfaces 2–3 questions; answering "domestic only" produces a pending tracked change setting `sourcing_intent=national`; accept/reject works; rerun is scoped. |
| **SX-04** | Downstream consumption: teach `search-role` and the v2 ranking RPC about `sourcing_intent` (hard-filter switch) and `resilience.posture` (subscore + query-synthesis flavouring). Light analyser for `value_chain.chokepoint_concerns` (informational badges in Step 3, no hard filter yet). | SX-02 | EXPLAIN ANALYZE: country becomes hard filter only when intent ∈ {national,regional,allied}; ranking subscore for resilience non-zero on flagged actors; pills show new constraints. |
| **SX-05 (optional)** | Backport sweep (Rule #31): migrate `interpret-need`, `populate-role`, `search-role`, `analyze-actor` to use `_shared/llm-client.ts`. Reconcile `interpretation.ts` type drift from §1a (unused `maxDistanceKm`/`referencePoint`, summary index↔UUID mapping). | SX-03 | All edge functions still pass smoke tests; no behavioural change; one file owns the gateway URL. |

**Migration:** none required. Every change is additive (new optional fields, new optional `effect_chains`). Existing `session_step_states.locked_output` rows continue to parse.

---

## Open questions for Tore

1. **Sourcing intent default.** Should the default be `unrestricted` (matches today's behaviour, safe), or `regional` for users inside a programme with a declared regional posture (more opinionated, may surprise)? I propose `unrestricted` with programme-level override later.
2. **Resilience-implies-sourcing hardening.** When `posture = wartime_continuity`, should Axis auto-harden `sourcing_intent` to `national` as a pending change, or only suggest it via a question? I propose **propose-via-question** — keeps every change user-confirmed.
3. **`llm-client.ts` scope.** Migrate **only the new Axis functions** in SX-03 (smaller, safer), or **migrate all four existing edge functions** in the same prompt? Per Rule #31 the backport sweep is required; the question is whether it happens inside SX-03 or as SX-05. I propose SX-05 to keep SX-03 reviewable.
4. **Effect chain in `interpret-need`.** Should `interpret-need` propose an effect chain on every interpretation, or only when the need is structurally sequential? Auto-proposing always is simpler; conditional avoids spurious chains for pure market-mapping queries. I propose **conditional with a confidence flag**.
5. **Axis question persistence.** Persist `AxisQuestion[]` and answers in `session_step_states.locked_output` (consistent with current `clarificationPoints`), or in a new `axis_actions` table (cleaner audit, more migration)? I propose **`locked_output` now, dedicated table when audit logging (Rule #30) lands**.

---

## What is explicitly NOT in this proposal

- No ontology changes.
- No actor card changes.
- No admin utilities.
- No ranking engine changes (SX-04 territory).
- No outcome capture loop changes.
- No new RPC, no new SQL migration in SX-02 itself (additive JSONB inside existing `locked_output`).

---

*End of pre-flight audit.*
