import type { InstructionStep } from "@shared/schema";

export type InstructionLink = {
  stepIndex: number;
  text: string;
  ingredientId: number;
  ingredientSource?: "ingredient" | "frequentAddon";
  multiplier?: number;
};

export const parseInstructionLines = (instructions?: string) =>
  (instructions || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+[.)]\s*/, ""));

export const buildInstructionSteps = (instructions: string | undefined, links: InstructionLink[]): InstructionStep[] => {
  const steps = parseInstructionLines(instructions);

  return steps.map((stepText, stepIndex) => {
    const applicableLinks = links
      .filter((link) => link.stepIndex === stepIndex && link.text.trim())
      .sort((a, b) => b.text.length - a.text.length);

    if (applicableLinks.length === 0) {
      return { segments: [{ type: "text", text: stepText }] };
    }

    const segments: InstructionStep["segments"] = [];
    let cursor = 0;

    while (cursor < stepText.length) {
      let matched = false;

      for (const link of applicableLinks) {
        const position = stepText.toLowerCase().indexOf(link.text.toLowerCase(), cursor);
        if (position !== cursor) continue;

        if (position > cursor) {
          segments.push({ type: "text", text: stepText.slice(cursor, position) });
        }

        const sameLinks = applicableLinks.filter(
          (candidate) =>
            candidate.text.toLowerCase() === link.text.toLowerCase() &&
            (typeof candidate.multiplier === "number" && Number.isFinite(candidate.multiplier)
              ? candidate.multiplier
              : 1) ===
              (typeof link.multiplier === "number" && Number.isFinite(link.multiplier) ? link.multiplier : 1)
        );

        const uniqueIngredientIds = Array.from(new Set(sameLinks.map((candidate) => Number(candidate.ingredientId)).filter((id) => id > 0)));
        const ingredientSource = link.ingredientSource === "frequentAddon" ? "frequentAddon" : "ingredient";

        segments.push({
          type: "ingredient",
          text: stepText.slice(position, position + link.text.length),
          ingredientId: uniqueIngredientIds[0] || Number(link.ingredientId),
          ingredientIds: uniqueIngredientIds.length > 0 ? uniqueIngredientIds : undefined,
          ingredientSource,
          multiplier: typeof link.multiplier === "number" && Number.isFinite(link.multiplier) ? link.multiplier : 1,
        });
        cursor = position + link.text.length;
        matched = true;
        break;
      }

      if (!matched) {
        const nextIngredientStart = applicableLinks
          .map((link) => stepText.toLowerCase().indexOf(link.text.toLowerCase(), cursor))
          .filter((idx) => idx >= 0)
          .sort((a, b) => a - b)[0];

        const end = typeof nextIngredientStart === "number" ? nextIngredientStart : stepText.length;
        segments.push({ type: "text", text: stepText.slice(cursor, end) });
        cursor = end;
      }
    }

    return { segments: segments.filter((segment) => segment.text.length > 0) };
  });
};
