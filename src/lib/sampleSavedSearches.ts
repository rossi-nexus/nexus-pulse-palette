// AX5 — Templates for the "Adopt a sample search" empty-state cards.
export interface SampleSavedSearch {
  id: string;
  name: string;
  description: string;
  threshold: number;
  need_payload: Record<string, unknown>;
}

export const SAMPLE_SAVED_SEARCHES: SampleSavedSearch[] = [
  {
    id: "no_c4isr",
    name: "Norwegian C4ISR suppliers",
    description: "Verified actors in Norway with C4ISR systems capability.",
    threshold: 0.65,
    need_payload: {
      summary: [],
      roles: [
        {
          id: "sample-c4isr",
          name: "C4ISR systems supplier",
          targets: { capabilities: [{ rawName: "C4ISR systems", selected: true }] },
        },
      ],
      constraints: { geography: { countries: ["NO"] } },
    },
  },
  {
    id: "cuas_iso",
    name: "Counter-UAS specialists with active certifications",
    description: "Counter-UAS operations, ISO 9001 preferred.",
    threshold: 0.70,
    need_payload: {
      summary: [],
      roles: [
        {
          id: "sample-cuas",
          name: "Counter-UAS operator",
          targets: { capabilities: [{ rawName: "Counter-UAS operations", selected: true }] },
        },
      ],
      constraints: { certifications: { preferred: ["ISO 9001"] } },
    },
  },
  {
    id: "bergen_maritime",
    name: "Maritime preparedness actors near Bergen",
    description: "Maritime domain, within 100km of Bergen.",
    threshold: 0.65,
    need_payload: {
      summary: [],
      roles: [
        {
          id: "sample-maritime",
          name: "Maritime preparedness actor",
          targets: { domains: [{ rawName: "Maritime", selected: true }] },
        },
      ],
      constraints: { geography: { countries: ["NO"], cities: ["Bergen"], radius_km: 100 } },
    },
  },
];
