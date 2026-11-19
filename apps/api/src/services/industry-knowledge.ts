export const industryKnowledgeCache = {
  version: 1,
  lastReviewed: "2026-11-05",
  limitation: "A small locally maintained prompt cache of general content patterns; not live market research, current statistics, or legal/regulatory advice.",
  entries: [
    { terms: ["health", "clinic", "hospital", "medical", "wellness"], guidance: ["Use clear, reassuring language and practical service information.", "Avoid diagnosis, treatment promises, or unsupported health outcomes."] },
    { terms: ["restaurant", "food", "cafe", "bakery"], guidance: ["Show menu details, service moments, and genuine behind-the-scenes process.", "Do not invent ingredients, dietary claims, awards, or customer quotes."] },
    { terms: ["education", "school", "college", "tutor"], guidance: ["Explain learning experiences and enrollment steps in plain language.", "Avoid guaranteed grades, admissions, or employment outcomes."] },
    { terms: ["finance", "bank", "investment", "insurance"], guidance: ["Keep product descriptions factual and direct readers to qualified staff for individual decisions.", "Avoid guaranteed returns or unsupported financial promises."] },
    { terms: ["real estate", "property", "housing"], guidance: ["Use verified listing details and clear next steps.", "Do not invent prices, availability, investment returns, or property features."] },
    { terms: ["salon", "beauty", "spa"], guidance: ["Show services and booking steps with inclusive, respectful language.", "Avoid guaranteed appearance or health outcomes."] },
  ],
} as const;

export function getIndustryKnowledge(industry: string | null, description: string | null) {
  const text = `${industry ?? ""} ${description ?? ""}`.toLocaleLowerCase();
  const matching = industryKnowledgeCache.entries.find((entry) => entry.terms.some((term) => text.includes(term)));
  return {
    version: industryKnowledgeCache.version,
    lastReviewed: industryKnowledgeCache.lastReviewed,
    source: matching ? `local-curated-${matching.terms[0]}` : "local-general",
    guidance: matching?.guidance ?? [
      "Describe the offer, process, and next step using facts supplied by the business.",
      "Avoid unsupported claims, invented customer stories, or fabricated outcomes.",
    ],
    limitation: industryKnowledgeCache.limitation,
  };
}
