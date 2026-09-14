type Base = { id: string; label: string; hint?: string; required?: boolean; placeholder?: string; unit?: string };

export type Question =
  | (Base & { type: "text" })
  | (Base & { type: "number" })
  | (Base & { type: "textarea" })
  | { id: string; type: "radio"; label: string; hint?: string; required?: boolean; options: string[] }
  | { id: string; type: "checkbox-group"; label: string; hint?: string; options: string[] }
  | { id: string; type: "scale"; label: string; hint?: string; required?: boolean; min: number; max: number; minLabel?: string; maxLabel?: string };

export interface FormDef {
  slug: string;
  title: string;
  intro: string;
  minutes: number;
  sections: { title: string; questions: Question[] }[];
  doneHref: string;
  doneLabel: string;
  /** which onboarding task this completes (for read-back state) */
  taskId?: string;
}

export const FORMS: Record<string, FormDef> = {
  intake: {
    slug: "intake",
    title: "Health questionnaire",
    intro: "Your doctor reads this before you meet, so your consultation is a conversation rather than a checklist. About 8 minutes.",
    minutes: 8,
    taskId: "questionnaire",
    doneHref: "/book/specialist-consultation",
    doneLabel: "Book your consultation",
    sections: [
      {
        title: "About you",
        questions: [
          { id: "height", type: "number", label: "Height", unit: "cm", required: true, placeholder: "170" },
          { id: "weight", type: "number", label: "Current weight", unit: "kg", required: true, placeholder: "96.4", hint: "Weigh yourself this morning if you can." },
          { id: "weightHistory", type: "textarea", label: "Your weight over the last few years", hint: "What has changed, and what have you tried? A few lines is plenty.", required: true },
        ],
      },
      {
        title: "Health",
        questions: [
          { id: "conditions", type: "checkbox-group", label: "Have you been diagnosed with any of these?", options: ["Type 2 diabetes", "High blood pressure", "High cholesterol", "Sleep apnoea", "PCOS", "Thyroid condition", "Depression or anxiety", "Gallbladder problems", "Pancreatitis", "None of these"] },
          { id: "medications", type: "textarea", label: "Medications you take now", hint: "Name and dose if you know them. Include anything over the counter.", placeholder: "For example: metformin 500 mg twice a day" },
          { id: "allergies", type: "text", label: "Allergies", placeholder: "None known" },
          { id: "glp1", type: "radio", label: "Have you used a weight-loss injection before?", options: ["Never", "Yes, in the past", "Yes, currently"], required: true },
        ],
      },
      {
        title: "Safety",
        questions: [
          { id: "pregnancy", type: "radio", label: "Are you pregnant, planning a pregnancy in the next year, or breastfeeding?", options: ["No", "Yes", "Not applicable"], required: true },
          { id: "alcohol", type: "radio", label: "Alcohol in a typical week", options: ["None", "1–7 units", "8–14 units", "More than 14 units"], required: true },
          { id: "eatingDisorder", type: "radio", label: "Have you ever been treated for an eating disorder?", options: ["No", "Yes"], required: true },
        ],
      },
      {
        title: "Goals",
        questions: [
          { id: "goal", type: "textarea", label: "What would you like to be different in 3 months?", hint: "Health, energy, movement, clothes — not just the scale.", required: true },
          { id: "support", type: "checkbox-group", label: "What kind of support helps you most?", options: ["Clear instructions", "Regular check-ins", "Nutrition guidance", "Someone to talk to", "Community"] },
        ],
      },
    ],
  },
  "week-1-checkin": {
    slug: "week-1-checkin",
    title: "How is your first week going?",
    intro: "Three quick questions so your nurse can spot side effects early. About 2 minutes.",
    minutes: 2,
    taskId: "week1",
    doneHref: "/",
    doneLabel: "Back to home",
    sections: [
      {
        title: "This week",
        questions: [
          { id: "overall", type: "radio", label: "Overall, how are you getting on with the medication?", options: ["Great", "Okay", "Struggling"], required: true },
          { id: "effects", type: "checkbox-group", label: "Any of these since your first dose?", options: ["Nausea", "Constipation", "Tiredness", "Headache", "Injection-site reaction", "Dizziness", "None"] },
          { id: "note", type: "textarea", label: "Anything for your nurse?", placeholder: "Optional" },
        ],
      },
    ],
  },
  "mid-programme-nps": {
    slug: "mid-programme-nps",
    title: "Mid-programme check-in",
    intro: "Halfway through. Two minutes, and it changes how we support you for the rest of the programme.",
    minutes: 2,
    taskId: "nps",
    doneHref: "/",
    doneLabel: "Back to home",
    sections: [
      {
        title: "How is it going?",
        questions: [
          { id: "nps", type: "scale", label: "How likely are you to recommend Beyond BMI to a friend?", min: 0, max: 10, minLabel: "Not likely", maxLabel: "Very likely", required: true },
          { id: "best", type: "textarea", label: "What has been the best part so far?", required: true },
          { id: "hardest", type: "textarea", label: "What has been the hardest?", required: true },
        ],
      },
    ],
  },
  "monthly-pulse": {
    slug: "monthly-pulse",
    title: "Monthly pulse check",
    intro: "Two questions. If anything scores low, your nurse gets in touch.",
    minutes: 1,
    taskId: "pulse",
    doneHref: "/",
    doneLabel: "Back to home",
    sections: [
      {
        title: "This month",
        questions: [
          { id: "supported", type: "scale", label: "How supported do you feel right now?", min: 1, max: 5, minLabel: "Not at all", maxLabel: "Completely", required: true },
          { id: "need", type: "textarea", label: "Is there anything you need from us this month?", placeholder: "Optional" },
        ],
      },
    ],
  },
  "programme-nps": {
    slug: "programme-nps",
    title: "How was your 90-Day Programme?",
    intro: "Three questions. We read every one.",
    minutes: 2,
    taskId: "nps",
    doneHref: "/plans",
    doneLabel: "See your options",
    sections: [
      {
        title: "Looking back",
        questions: [
          { id: "rating", type: "scale", label: "Overall, out of 10?", min: 0, max: 10, required: true },
          { id: "changed", type: "textarea", label: "What changed for you?", required: true },
          { id: "improve", type: "textarea", label: "What could we have done better?" },
        ],
      },
    ],
  },
};

/** Fixed sample answers for the read-back state of a completed intake form. */
export const SAMPLE_INTAKE_ANSWERS: Record<string, string> = {
  height: "181 cm",
  weight: "118.2 kg",
  weightHistory: "Steady gain over about six years, mostly since a desk job. Tried low-carb twice; lost 8 kg each time and regained within a year.",
  conditions: "High blood pressure, Sleep apnoea",
  medications: "Amlodipine 5 mg once daily",
  allergies: "None known",
  glp1: "Never",
  pregnancy: "Not applicable",
  alcohol: "1–7 units",
  eatingDisorder: "No",
  goal: "Sleep better, stop the reflux, and be able to play football with the kids without needing to sit down.",
  support: "Clear instructions, Regular check-ins",
};
