import type { IeltsVariant } from "./ielts-types";

type RawQuestion = {
  type: "mcq" | "form_completion" | "sentence_completion" | "true_false_ng" | "short_answer";
  prompt: string;
  options?: string[];
  limit?: string;
  answer: string;
  alternatives?: string[];
  explain: string;
};

type FallbackPayload = {
  title: string;
  instructions?: string;
  lines?: { speaker: string; gender: "male" | "female"; text: string }[];
  paragraphs?: { label: string; text: string }[];
  questions: RawQuestion[];
};

const listeningFacts = [
  {
    title: "Riverside Language Course",
    speaker: "Receptionist",
    intro: "Good morning, Riverside Language Centre. You're speaking to Anna. How may I help?",
    facts: ["Monday", "6:30 pm", "twelve", "£85", "Room 14", "Dr Lewis", "conversation", "a notebook", "Friday", "King Street"],
  },
  {
    title: "Westwood Community Centre",
    speaker: "Guide",
    intro: "Welcome to Westwood Community Centre. I will explain the facilities and this month's programme.",
    facts: ["swimming pool", "8 am", "Tuesday", "£5", "first floor", "yoga", "twenty", "the café", "Saturday", "online"],
  },
  {
    title: "University Research Project",
    speaker: "Tutor",
    intro: "Let's review your research project on how students travel to the university campus.",
    facts: ["transport", "200 students", "questionnaire", "Wednesday", "the library", "traffic", "bar chart", "ten minutes", "Professor Hall", "15 May"],
  },
  {
    title: "Urban Bees Lecture",
    speaker: "Lecturer",
    intro: "Today's lecture examines why bee populations can sometimes thrive in modern cities.",
    facts: ["gardens", "pesticides", "rooftops", "temperature", "three kilometres", "spring", "lavender", "water", "local councils", "biodiversity"],
  },
] as const;

export function fallbackListening(section: number, _variant: IeltsVariant): FallbackPayload {
  const data = listeningFacts[Math.max(0, Math.min(3, section - 1))] ?? listeningFacts[0];
  const detail = data.facts
    .map((fact, index) => `Point ${index + 1} is ${fact}. Please write that information carefully.`)
    .join(" ");
  return {
    title: data.title,
    instructions: "Complete each answer. Write NO MORE THAN TWO WORDS AND/OR A NUMBER.",
    lines: [
      { speaker: data.speaker, gender: section % 2 ? "female" : "male", text: data.intro },
      { speaker: data.speaker, gender: section % 2 ? "female" : "male", text: detail },
    ],
    questions: data.facts.map((answer, index) => ({
      type: index % 3 === 0 ? "form_completion" : "sentence_completion",
      prompt: `Information ${index + 1}: ______`,
      limit: "NO MORE THAN TWO WORDS AND/OR A NUMBER",
      answer,
      explain: `Transkriptda “Point ${index + 1} is ${answer}” deb aniq aytilgan.`,
    })),
  };
}

const readingSets = [
  {
    title: "The Return of Urban Wetlands",
    paragraphs: [
      ["A", "For much of the twentieth century, city wetlands were drained because they were considered useless. Modern planners now recognise that these areas absorb heavy rainfall and reduce flooding. They can perform this task more cheaply than large concrete drainage systems."],
      ["B", "Wetlands also provide habitats for birds, insects and amphibians. In one northern city, twelve bird species returned within two years of a restoration project. Volunteers recorded the wildlife but professional scientists checked the results."],
      ["C", "Restoration is not always simple. Polluted soil may need to be removed, and nearby residents sometimes fear that standing water will attract mosquitoes. Research shows that a balanced wetland supports fish and insects that control mosquito numbers."],
      ["D", "Successful schemes involve local people from the beginning. Schools can monitor water quality, while residents help choose paths and viewing areas. This participation makes long-term protection more likely."],
    ],
    facts: ["heavy rainfall", "flooding", "concrete", "birds", "twelve", "two years", "scientists", "polluted soil", "mosquitoes", "fish", "local people", "water quality", "long-term protection"],
  },
  {
    title: "Why Handwriting Still Matters",
    paragraphs: [
      ["A", "Digital devices have transformed education, yet handwriting remains valuable. When students form letters by hand, they make varied movements and receive detailed sensory feedback. Typing repeats a much smaller set of movements."],
      ["B", "Several studies suggest that handwritten notes support memory because writers must select and summarise ideas. Laptop users often copy a speaker's words without processing their meaning. However, typed notes can be searched and shared more easily."],
      ["C", "The strongest approach may combine both methods. A learner can first write a short summary and later organise it digitally. This preserves the thinking involved in handwriting while gaining the practical advantages of electronic storage."],
      ["D", "Researchers warn against claiming that one method suits everyone. Students with some physical or learning difficulties may find typing more accessible. The goal is not to reject technology but to choose the tool that supports the task."],
    ],
    facts: ["sensory feedback", "typing", "memory", "summarise", "laptop users", "searched", "both methods", "short summary", "digitally", "storage", "everyone", "accessible", "the task"],
  },
  {
    title: "The Science of Rest",
    paragraphs: [
      ["A", "Rest is often confused with complete inactivity. In fact, the brain remains busy during quiet periods, organising memories and connecting recent experiences with older knowledge. These processes can support creative solutions."],
      ["B", "Short breaks are especially useful during demanding work. Experiments indicate that attention declines when a task continues without interruption. A brief walk or a change of activity can restore concentration, although a long break may make restarting harder."],
      ["C", "Sleep has a different function from waking rest. During sleep, the brain strengthens some memories and removes unnecessary information. Most adults need roughly seven to nine hours, but individual requirements vary."],
      ["D", "Employers have begun to reconsider workplace culture. Some provide quiet rooms or encourage staff to leave their desks at lunchtime. Such policies succeed only when managers use them too; otherwise employees may fear appearing uncommitted."],
      ["E", "Scientists still debate the ideal pattern of work and rest. Nevertheless, evidence consistently shows that recovery is part of productive activity rather than its opposite."],
    ],
    facts: ["memories", "creative solutions", "short breaks", "attention", "a brief walk", "concentration", "sleep", "seven to nine hours", "quiet rooms", "lunchtime", "managers", "uncommitted", "recovery", "productive activity"],
  },
] as const;

export function fallbackReading(section: number, _variant: IeltsVariant): FallbackPayload {
  const data = readingSets[Math.max(0, Math.min(2, section - 1))] ?? readingSets[0];
  return {
    title: data.title,
    instructions: "Complete the sentences using NO MORE THAN THREE WORDS from the passage.",
    paragraphs: data.paragraphs.map(([label, text]) => ({ label, text })),
    questions: data.facts.map((answer, index) => ({
      type: index % 4 === 3 ? "short_answer" : "sentence_completion",
      prompt: `According to the passage, key detail ${index + 1} is ______.`,
      limit: "NO MORE THAN THREE WORDS",
      answer,
      explain: `Matnda “${answer}” iborasi bevosita ishlatilgan.`,
    })),
  };
}