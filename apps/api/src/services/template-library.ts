const formatGroups = [
  { format: "post", category: "Social posts", names: ["Product introduction", "Customer proof", "Expert tip", "Founder note", "New feature", "Quick guide"] },
  { format: "story", category: "Stories", names: ["Chef favorite", "Behind the scenes", "Ask your audience", "One-minute tip", "Customer moment", "This or that"] },
  { format: "carousel", category: "Carousels", names: ["How-to guide", "Before and after", "Service breakdown", "Common questions", "Step-by-step", "Myth versus fact"] },
  { format: "poster", category: "Posters", names: ["Event announcement", "Campaign statement", "Community spotlight", "New collection", "Brand manifesto", "Seasonal feature"] },
  { format: "brochure", category: "Brochures", names: ["Company overview", "Service menu", "Product guide", "Capabilities", "Client welcome", "Impact report"] },
  { format: "flyer", category: "Flyers", names: ["Local event", "Seasonal menu introduction", "Workshop invitation", "Open house", "Grand opening", "Special announcement"] },
  { format: "thumbnail", category: "Video thumbnails", names: ["Tutorial cover", "Product reveal", "Customer question", "Quick walkthrough", "Expert insight", "Behind the build"] },
  { format: "video", category: "Video covers", names: ["Product demonstration", "Founder introduction", "How it works", "Customer story", "Feature spotlight", "A day in the workflow"] },
  { format: "linkedin-banner", category: "LinkedIn banners", names: ["Company expertise", "Hiring announcement", "Founder perspective", "Industry insight", "Team milestone", "Service overview"] },
  { format: "pinterest-pin", category: "Pinterest pins", names: ["Step-by-step guide", "Idea collection", "Product inspiration", "Checklist", "Quick reference", "Seasonal ideas"] },
  { format: "facebook-cover", category: "Facebook covers", names: ["Brand introduction", "Community invitation", "Seasonal campaign", "New location", "Customer appreciation", "Product collection"] },
  { format: "business-card", category: "Business cards", names: ["Professional profile", "Studio identity", "Contact essentials", "Modern minimal", "Creative studio", "Service specialist"] },
  { format: "festival-greeting", category: "Indian festival greetings", names: ["Festive wishes", "Community celebration", "Seasonal message", "Gather together", "Light and joy", "A note of gratitude"] },
] as const;

const layouts = ["editorial", "split", "bold", "collage", "framed", "magazine", "type-led", "triptych", "spotlight", "grid", "sparkle", "radiant"] as const;
const variantTreatments = ["Editorial", "Split", "Bold", "Collage", "Framed", "Magazine", "Type-led", "Triptych", "Spotlight", "Grid"] as const;
const palettes = [
  ["#24364B", "#B69A6A", "#F5F3EE"],
  ["#303A46", "#73869A", "#F2F4F5"],
  ["#31453B", "#9AA88E", "#F3F2EA"],
  ["#4A3940", "#A87D62", "#F6F1EB"],
  ["#263D52", "#7594A5", "#F1F4F4"],
  ["#343536", "#9A9285", "#F3F1ED"],
  ["#33433F", "#B59B70", "#F5F2E9"],
  ["#353C50", "#8991A6", "#F1F1F3"],
] as const;
const slotNames = ["headline", "body", "image", "logo", "callToAction", "brandColors"] as const;

export const starterTemplates = formatGroups.flatMap((group, formatIndex) =>
  group.names.flatMap((name, conceptIndex) =>
    variantTreatments.map((treatment, treatmentIndex) => {
      const variant = conceptIndex * variantTreatments.length + treatmentIndex;
      const layout = layouts[treatmentIndex]!;
      const palette = palettes[(formatIndex + Math.floor(variant / 2)) % palettes.length]!;
      return {
        id: `starter-${group.format}-${variant + 1}`,
        name: `${name} - ${treatment}`,
        format: group.format,
        language: "en",
        category: group.category,
        templateJson: {
          category: group.category,
          layout,
          slots: [...slotNames],
          palette: [...palette],
          variant,
          treatment,
        },
      };
    }),
  ),
);
