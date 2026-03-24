import { CoachSuggestion, OpportunityGap } from "./types";

export interface CoachTemplate {
  id: string;
  title: string;
  when: string[];
  why: string;
  prompt: string;
}

export const coachTemplates: CoachTemplate[] = [
  {
    id: "decision-memo",
    title: "Draft The Decision Memo",
    when: ["docs", "browser", "slides", "notes"],
    why: "Use AI to turn scattered thinking into a crisp recommendation with tradeoffs.",
    prompt:
      "I am making an AI risk decision. Draft a decision memo with: context, options, risks, recommendation, and open questions. Use concise leadership-ready language.",
  },
  {
    id: "eval-plan",
    title: "Design The Eval Plan",
    when: ["browser", "docs", "research"],
    why: "AI is strong at turning vague concerns into measurable criteria and adversarial tests.",
    prompt:
      "Help me design an evaluation plan for this AI risk question. Give me: target behavior, failure modes, pass/fail rubric, adversarial test set, and likely false positives/negatives.",
  },
  {
    id: "risk-tradeoff",
    title: "Pressure-Test The Risk Tradeoff",
    when: ["docs", "browser", "slack", "meeting"],
    why: "Before alignment meetings, use AI to sharpen the strongest arguments on each side.",
    prompt:
      "Analyze this AI risk decision as a tradeoff. For each option, compare safety upside, abuse risk, enforcement ambiguity, operational cost, and likely reviewer objections. End with a recommendation and 3 counterarguments.",
  },
  {
    id: "meeting-debrief",
    title: "Convert Notes Into Action",
    when: ["notes", "meeting", "calendar"],
    why: "Summaries are table stakes. The real leverage is decisions, risks, and actions.",
    prompt:
      "Summarize these notes into 4 sections: decisions made, risks raised, open questions, and next actions. Flag anything that needs escalation or leadership follow-up.",
  },
  {
    id: "prompt-upgrade",
    title: "Upgrade The Prompt",
    when: ["all"],
    why: "If the prompt is weak, the answer will cap out early. Fix the prompt before repeating the work.",
    prompt:
      "Rewrite my current prompt so the next assistant response is sharper. Add context, audience, explicit deliverable, evaluation criteria, and a self-critique instruction.",
  },
];

export function buildSuggestionQueue(
  workMode: string,
  categoriesUsed: Set<string>,
  priorities: string[],
  opportunityGap?: OpportunityGap,
): CoachSuggestion[] {
  const suggestions: CoachSuggestion[] = [];
  for (const template of coachTemplates) {
    if (template.when.includes("all") || template.when.includes(workMode)) {
      suggestions.push({
        title: template.title,
        why: template.why,
        action: priorities[0] ?? "Raise the quality bar on your next AI interaction.",
        prompt: template.prompt,
      });
    }
  }

  if (opportunityGap) {
    suggestions.unshift({
      title: `Use AI Earlier In ${labelize(opportunityGap.workMode)}`,
      why: `${opportunityGap.observedShare}% of monitored time lands here, but only ${opportunityGap.aiShare}% of your logged AI use does.`,
      action: opportunityGap.advice,
      prompt: promptForGap(opportunityGap.workMode),
    });
  }

  if (!categoriesUsed.has("eval_design")) {
    suggestions.unshift({
      title: "Use AI For Eval Design Today",
      why: "You are not getting enough leverage from eval planning and adversarial test design.",
      action: "Before the next decision, ask AI to build the rubric and edge cases.",
      prompt:
        "Design a lightweight eval for this AI risk question. Give me metrics, failure modes, edge-case prompts, and a pass/fail rubric.",
    });
  }

  return suggestions.slice(0, 4);
}

function promptForGap(workMode: string) {
  switch (workMode) {
    case "docs":
      return "I am drafting or reviewing a decision document. Turn my rough material into: context, decision, options, tradeoffs, recommendation, and open questions. Flag what is still underspecified.";
    case "browser":
      return "I am researching an AI risk topic. Convert what I am reading into: key claims, evidence quality, open uncertainties, eval ideas, and concrete next actions.";
    case "meeting":
      return "I just finished a meeting. Turn these notes into: decisions made, risks raised, unresolved disagreements, owners, and next steps.";
    case "slack":
      return "Rewrite this message for a high-stakes cross-functional audience. Keep the substance, sharpen the framing, flag likely objections, and suggest a calmer alternative if needed.";
    case "slides":
      return "Turn this material into slide-ready points: headline, why it matters, evidence, likely pushback, and backup detail.";
    case "research":
      return "Take this AI risk problem and turn it into an eval plan: target behavior, failure modes, adversarial cases, rubric, and likely blind spots.";
    default:
      return "Rewrite this current task into a stronger AI prompt with context, stakes, exact deliverable, evaluation criteria, and output format.";
  }
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
