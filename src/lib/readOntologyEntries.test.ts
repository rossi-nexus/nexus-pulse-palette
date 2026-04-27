import { describe, it, expect } from "vitest";
import { readOntologyEntries } from "./readOntologyEntries";
import type { EnrichmentAcceptedItem } from "@/types/enrichment";

describe("readOntologyEntries", () => {
  describe("empty / malformed input", () => {
    it("returns [] for null", () => {
      expect(readOntologyEntries(null)).toEqual([]);
    });

    it("returns [] for undefined", () => {
      expect(readOntologyEntries(undefined)).toEqual([]);
    });

    it("returns [] for an empty array", () => {
      expect(readOntologyEntries([])).toEqual([]);
    });

    it("returns [] when input is an object (not array)", () => {
      expect(readOntologyEntries({ entries: ["Sonar"] })).toEqual([]);
    });

    it("returns [] when input is a number / string", () => {
      expect(readOntologyEntries(42)).toEqual([]);
      expect(readOntologyEntries("Sonar")).toEqual([]);
    });

    it("skips garbage items inside a valid array (null, numbers, etc.)", () => {
      const out = readOntologyEntries(["Sonar", null, 42, undefined, "Radar"]);
      expect(out).toHaveLength(2);
      expect(out.map((e) => e.name)).toEqual(["Sonar", "Radar"]);
    });

    it("skips object entries with no extractable name", () => {
      const out = readOntologyEntries([{ irrelevant: "field" }, { name: "" }]);
      expect(out).toEqual([]);
    });
  });

  describe("Shape 1: plain string array (legacy)", () => {
    it("returns DisplayEntry[] with meta=null for each string", () => {
      const out = readOntologyEntries(["Sonar", "Radar"]);
      expect(out).toEqual([
        { name: "Sonar", meta: null },
        { name: "Radar", meta: null },
      ]);
    });

    it("preserves casing as stored", () => {
      const out = readOntologyEntries(["Sonar", "RADAR", "lidar"]);
      expect(out.map((e) => e.name)).toEqual(["Sonar", "RADAR", "lidar"]);
    });
  });

  describe("Shape 2: EnrichmentAcceptedItem array (new canonical write shape)", () => {
    it("returns DisplayEntry with full meta object preserved", () => {
      const item: EnrichmentAcceptedItem = {
        entry_name: "Sonar",
        source: "manual",
        evidence: "From notes",
        confidence: "high",
        accepted_at: "2026-01-01T00:00:00.000Z",
      };
      const out = readOntologyEntries([item]);
      expect(out).toHaveLength(1);
      expect(out[0].name).toBe("Sonar");
      expect(out[0].meta).toEqual(item);
    });

    it("handles all valid source values", () => {
      const sources: EnrichmentAcceptedItem["source"][] = [
        "manual",
        "url_scrape",
        "document",
        "web_search",
        "registry",
        "pipeline_search",
        "pipeline_analysis",
      ];
      const items: EnrichmentAcceptedItem[] = sources.map((s) => ({
        entry_name: `Item-${s}`,
        source: s,
      }));
      const out = readOntologyEntries(items);
      expect(out).toHaveLength(sources.length);
      expect(out.map((e) => e.meta?.source)).toEqual(sources);
    });
  });

  describe("Shape 3: pipeline category-with-entries", () => {
    it("flattens string entries with source=pipeline_search", () => {
      const out = readOntologyEntries([
        { categoryName: "Surveillance", entries: ["Sonar", "Radar"] },
      ]);
      expect(out).toHaveLength(2);
      expect(out[0]).toEqual({
        name: "Sonar",
        meta: { entry_name: "Sonar", source: "pipeline_search" },
      });
      expect(out[1].meta?.source).toBe("pipeline_search");
    });

    it("flattens object entries with evidence as source=pipeline_analysis", () => {
      const out = readOntologyEntries([
        {
          categoryName: "Surveillance",
          entries: [
            { entryName: "Sonar", evidence: "Mentioned in product sheet", confidence: "high" },
          ],
        },
      ]);
      expect(out).toHaveLength(1);
      expect(out[0].name).toBe("Sonar");
      expect(out[0].meta?.source).toBe("pipeline_analysis");
      expect(out[0].meta?.evidence).toBe("Mentioned in product sheet");
      expect(out[0].meta?.confidence).toBe("high");
    });

    it("flattens object entries without evidence as source=pipeline_search", () => {
      const out = readOntologyEntries([
        { categoryName: "Surveillance", entries: [{ entryName: "Sonar" }] },
      ]);
      expect(out[0].meta?.source).toBe("pipeline_search");
      expect(out[0].meta?.evidence).toBeUndefined();
    });

    it("ignores invalid confidence values", () => {
      const out = readOntologyEntries([
        {
          categoryName: "X",
          entries: [{ entryName: "Sonar", confidence: "HIGH" /* uppercase */ }],
        },
      ]);
      expect(out[0].meta?.confidence).toBeUndefined();
    });
  });

  describe("Shape 4: older single-object variants", () => {
    it("reads {entryName, evidence} → pipeline_analysis", () => {
      const out = readOntologyEntries([
        { entryName: "Sonar", evidence: "From brochure" },
      ]);
      expect(out[0].name).toBe("Sonar");
      expect(out[0].meta?.source).toBe("pipeline_analysis");
      expect(out[0].meta?.evidence).toBe("From brochure");
    });

    it("reads {entryName} only → pipeline_search", () => {
      const out = readOntologyEntries([{ entryName: "Sonar" }]);
      expect(out[0].name).toBe("Sonar");
      expect(out[0].meta?.source).toBe("pipeline_search");
    });

    it("falls back through name aliases (categoryName, name, rawName, etc.)", () => {
      const out = readOntologyEntries([
        { name: "Alpha" },
        { rawName: "Beta" },
        { domainName: "Gamma" },
        { productName: "Delta" },
        { serviceName: "Epsilon" },
      ]);
      expect(out.map((e) => e.name)).toEqual([
        "Alpha",
        "Beta",
        "Gamma",
        "Delta",
        "Epsilon",
      ]);
    });
  });

  describe("mixed shapes in one array", () => {
    it("handles a realistic mix of legacy strings, new objects, and pipeline categories", () => {
      const out = readOntologyEntries([
        "LegacyString",
        { entry_name: "Manual", source: "manual" },
        { categoryName: "Cat", entries: ["FromPipeline"] },
        { entryName: "OlderVariant", evidence: "x" },
      ]);
      expect(out.map((e) => e.name)).toEqual([
        "LegacyString",
        "Manual",
        "FromPipeline",
        "OlderVariant",
      ]);
      expect(out[0].meta).toBeNull();
      expect(out[1].meta?.source).toBe("manual");
      expect(out[2].meta?.source).toBe("pipeline_search");
      expect(out[3].meta?.source).toBe("pipeline_analysis");
    });
  });
});
