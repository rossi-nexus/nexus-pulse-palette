import { describe, it, expect } from "vitest";
import { appendManualOntologyItems } from "./actorEnrichment";
import type { EnrichmentAcceptedItem } from "@/types/enrichment";

describe("appendManualOntologyItems", () => {
  describe("empty / undefined inputs", () => {
    it("starts from [] when existing is undefined", () => {
      const out = appendManualOntologyItems(undefined, ["Sonar"]);
      expect(out).toHaveLength(1);
      expect((out[0] as EnrichmentAcceptedItem).entry_name).toBe("Sonar");
    });

    it("starts from [] when existing is null", () => {
      const out = appendManualOntologyItems(null, ["Sonar"]);
      expect(out).toHaveLength(1);
    });

    it("starts from [] when existing is not an array", () => {
      const out = appendManualOntologyItems("garbage", ["Sonar"]);
      expect(out).toHaveLength(1);
    });

    it("appends nothing when newItems is empty", () => {
      const out = appendManualOntologyItems(["Existing"], []);
      expect(out).toEqual(["Existing"]);
    });

    it("skips empty / whitespace-only string entries", () => {
      const out = appendManualOntologyItems([], ["", "   ", "Sonar"]);
      expect(out).toHaveLength(1);
      expect((out[0] as EnrichmentAcceptedItem).entry_name).toBe("Sonar");
    });
  });

  describe("normalization of bare strings", () => {
    it("normalizes a bare string into an EnrichmentAcceptedItem with source=manual and accepted_at", () => {
      const before = Date.now();
      const out = appendManualOntologyItems([], ["Radar"]);
      const item = out[0] as EnrichmentAcceptedItem;
      expect(item.entry_name).toBe("Radar");
      expect(item.source).toBe("manual");
      expect(item.accepted_at).toBeDefined();
      expect(new Date(item.accepted_at!).getTime()).toBeGreaterThanOrEqual(
        before - 1,
      );
    });

    it("trims whitespace on bare string entries", () => {
      const out = appendManualOntologyItems([], ["  Radar  "]);
      expect((out[0] as EnrichmentAcceptedItem).entry_name).toBe("Radar");
    });
  });

  describe("EnrichmentAcceptedItem inputs", () => {
    it("preserves all metadata fields on full objects", () => {
      const input: EnrichmentAcceptedItem = {
        entry_name: "Lidar",
        source: "web_search",
        source_url: "https://example.com",
        evidence: "Mentioned in product sheet",
        confidence: "high",
        accepted_at: "2026-01-01T00:00:00.000Z",
      };
      const out = appendManualOntologyItems([], [input]);
      expect(out[0]).toMatchObject(input);
    });

    it("fills in accepted_at when omitted", () => {
      const out = appendManualOntologyItems([], [
        { entry_name: "Lidar", source: "url_scrape" },
      ]);
      expect((out[0] as EnrichmentAcceptedItem).accepted_at).toBeDefined();
    });
  });

  describe("case-insensitive dedup", () => {
    it("does not append a string that matches an existing string (case-insensitive)", () => {
      const out = appendManualOntologyItems(["Sonar"], ["sonar"]);
      expect(out).toEqual(["Sonar"]);
    });

    it("does not append a string that matches an existing EnrichmentAcceptedItem entry_name", () => {
      const existing: EnrichmentAcceptedItem[] = [
        { entry_name: "Sonar", source: "manual" },
      ];
      const out = appendManualOntologyItems(existing, ["sonar"]);
      expect(out).toHaveLength(1);
      expect(out[0]).toEqual(existing[0]);
    });

    it("does not append a string that matches a name inside a pipeline category-with-entries shape", () => {
      const existing = [
        { categoryName: "Surveillance", entries: ["Sonar", "Radar"] },
      ];
      const out = appendManualOntologyItems(existing, ["sonar", "RADAR"]);
      expect(out).toHaveLength(1); // pipeline category preserved, no new items added
      expect(out[0]).toEqual(existing[0]);
    });

    it("does not append a string that matches an older {entryName} variant", () => {
      const existing = [{ entryName: "Sonar", evidence: "foo" }];
      const out = appendManualOntologyItems(existing, ["sonar"]);
      expect(out).toEqual(existing);
    });

    it("appends new items while skipping duplicates in the same call", () => {
      const out = appendManualOntologyItems(["Sonar", "Radar"], [
        "lidar",
        "RADAR",
        "Lidar", // dup of the one we just queued
      ]);
      expect(out).toHaveLength(3);
      expect((out[2] as EnrichmentAcceptedItem).entry_name).toBe("lidar");
    });
  });

  describe("pipeline-shape preservation", () => {
    it("keeps a pipeline category-with-entries object untouched when a new manual entry is appended", () => {
      const pipelineEntry = {
        categoryName: "Surveillance",
        entries: [
          { entryName: "Sonar", evidence: "Found in brochure" },
        ],
      };
      const out = appendManualOntologyItems([pipelineEntry], ["Radar"]);
      expect(out).toHaveLength(2);
      // Pipeline entry is the same reference / structure
      expect(out[0]).toBe(pipelineEntry);
      expect(out[0]).toEqual(pipelineEntry);
      // New manual entry is a normalized object
      const newItem = out[1] as EnrichmentAcceptedItem;
      expect(newItem.entry_name).toBe("Radar");
      expect(newItem.source).toBe("manual");
    });

    it("keeps an older {entryName, evidence} object untouched when a new entry is appended", () => {
      const older = { entryName: "Sonar", evidence: "From web" };
      const out = appendManualOntologyItems([older], ["Radar"]);
      expect(out[0]).toBe(older);
      expect(out).toHaveLength(2);
    });
  });
});
