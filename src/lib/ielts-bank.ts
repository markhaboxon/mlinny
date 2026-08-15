// Tayyor (AI'siz) Writing va Speaking materiallari banki.
// AI limitini tejash uchun bu mavzular bazadan/koddan olinadi.

import type { IeltsVariant } from "./ielts-types";

export type WritingTask = {
  id: string;
  task: 1 | 2;
  variant: IeltsVariant | "both";
  prompt: string;
  /** Task 1 Academic uchun grafik/jarayon tavsifi (matn ko'rinishidagi "rasm"). */
  visual?: { title: string; rows: string[] };
  minWords: number;
  minutes: number;
};

export const WRITING_TASKS: WritingTask[] = [
  {
    id: "a1-1",
    task: 1,
    variant: "academic",
    prompt:
      "The table below shows the percentage of households in four countries that owned a car, a computer and a smartphone in 2010 and 2022. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    visual: {
      title: "Household ownership (%), 2010 vs 2022",
      rows: [
        "Country | Car 2010 | Car 2022 | Computer 2010 | Computer 2022 | Smartphone 2010 | Smartphone 2022",
        "Uzbekistan | 24 | 46 | 18 | 55 | 9 | 88",
        "Turkey | 42 | 58 | 40 | 66 | 21 | 92",
        "Germany | 77 | 74 | 79 | 88 | 35 | 95",
        "Japan | 68 | 61 | 83 | 90 | 42 | 97",
      ],
    },
    minWords: 150,
    minutes: 20,
  },
  {
    id: "a1-2",
    task: 1,
    variant: "academic",
    prompt:
      "The diagram below shows the process of producing bottled drinking water. Summarise the information by selecting and reporting the main features.",
    visual: {
      title: "Bottled water production — process stages",
      rows: [
        "1. Water pumped from underground spring",
        "2. Passed through sand filter",
        "3. Treated with ultraviolet light (disinfection)",
        "4. Stored in stainless-steel tanks",
        "5. Bottles blown from plastic pellets",
        "6. Bottles filled, capped and labelled",
        "7. Packed into crates and distributed to shops",
      ],
    },
    minWords: 150,
    minutes: 20,
  },
  {
    id: "a1-3",
    task: 1,
    variant: "academic",
    prompt:
      "The line graph below shows the number of international students enrolled in three universities between 2005 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
    visual: {
      title: "International students (thousands)",
      rows: [
        "Year | University A | University B | University C",
        "2005 | 4 | 9 | 2",
        "2010 | 7 | 8 | 5",
        "2015 | 12 | 6 | 11",
        "2020 | 19 | 5 | 17",
      ],
    },
    minWords: 150,
    minutes: 20,
  },
  {
    id: "g1-1",
    task: 1,
    variant: "general",
    prompt:
      "You recently stayed at a hotel and were unhappy with the service you received. Write a letter to the hotel manager. In your letter: explain why you stayed at the hotel, describe the problems you had, say what action you would like the manager to take. Begin your letter 'Dear Sir or Madam,'. You do NOT need to write any addresses.",
    minWords: 150,
    minutes: 20,
  },
  {
    id: "g1-2",
    task: 1,
    variant: "general",
    prompt:
      "A friend from abroad is going to visit your city for a week. Write a letter to your friend. In your letter: say how you feel about the visit, suggest what you can do together, explain what your friend should bring. Begin your letter 'Dear ...,'.",
    minWords: 150,
    minutes: 20,
  },
  {
    id: "g1-3",
    task: 1,
    variant: "general",
    prompt:
      "You want to take a short course at a college in another city. Write a letter to the college. In your letter: explain which course you are interested in, describe your current level of study or work, ask about accommodation and fees.",
    minWords: 150,
    minutes: 20,
  },
  {
    id: "t2-1",
    task: 2,
    variant: "both",
    prompt:
      "Some people believe that university education should be free for everyone, while others think students should pay for their own studies. Discuss both views and give your own opinion.",
    minWords: 250,
    minutes: 40,
  },
  {
    id: "t2-2",
    task: 2,
    variant: "both",
    prompt:
      "In many cities traffic congestion is becoming worse every year. What are the causes of this problem and what measures could be taken to solve it?",
    minWords: 250,
    minutes: 40,
  },
  {
    id: "t2-3",
    task: 2,
    variant: "both",
    prompt:
      "Some people think that children should start learning a foreign language at primary school rather than secondary school. To what extent do you agree or disagree?",
    minWords: 250,
    minutes: 40,
  },
  {
    id: "t2-4",
    task: 2,
    variant: "both",
    prompt:
      "Social media has changed the way people communicate with each other. Do the advantages of this development outweigh the disadvantages?",
    minWords: 250,
    minutes: 40,
  },
  {
    id: "t2-5",
    task: 2,
    variant: "both",
    prompt:
      "Many people work long hours and have little time for family life. What problems does this cause, and what can employers and governments do about it?",
    minWords: 250,
    minutes: 40,
  },
];

export function pickWritingTask(task: 1 | 2, variant: IeltsVariant, seed?: string): WritingTask {
  const pool = WRITING_TASKS.filter(
    (t) => t.task === task && (t.variant === "both" || t.variant === variant),
  );
  const list = pool.length ? pool : WRITING_TASKS.filter((t) => t.task === task);
  const idx = seed
    ? Math.abs([...seed].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % list.length
    : Math.floor(Math.random() * list.length);
  return list[idx]!;
}

export type SpeakingSet = {
  id: string;
  part1: { topic: string; questions: string[] }[];
  part2: { cue: string; bullets: string[] };
  part3: string[];
};

export const SPEAKING_SETS: SpeakingSet[] = [
  {
    id: "sp-1",
    part1: [
      {
        topic: "Work or studies",
        questions: [
          "Do you work or are you a student?",
          "What do you like most about your work or studies?",
          "Is there anything you would like to change about it?",
          "What would you like to do in the future?",
        ],
      },
      {
        topic: "Hometown",
        questions: [
          "Where is your hometown?",
          "What is it famous for?",
          "Has it changed much in recent years?",
        ],
      },
      {
        topic: "Free time",
        questions: [
          "What do you usually do in your free time?",
          "Do you prefer spending free time alone or with friends?",
          "Has the way you spend free time changed since childhood?",
        ],
      },
    ],
    part2: {
      cue: "Describe a place you have visited that you would like to go to again.",
      bullets: [
        "where the place is",
        "when and why you went there",
        "what you did there",
        "and explain why you would like to go there again",
      ],
    },
    part3: [
      "Why do you think people enjoy travelling to new places?",
      "How has tourism changed your country in the last twenty years?",
      "Do you think tourism can damage local culture? Why?",
      "Should governments spend money on promoting tourism?",
    ],
  },
  {
    id: "sp-2",
    part1: [
      {
        topic: "Technology",
        questions: [
          "How often do you use a smartphone?",
          "Which app do you use the most and why?",
          "Do you think people spend too much time online?",
        ],
      },
      {
        topic: "Food",
        questions: [
          "What kind of food do you like?",
          "Do you prefer eating at home or in restaurants?",
          "Can you cook? Who taught you?",
        ],
      },
      {
        topic: "Weather",
        questions: [
          "What is the weather like in your country?",
          "Which season do you like best?",
          "Does the weather affect your mood?",
        ],
      },
    ],
    part2: {
      cue: "Describe a skill you learned that was difficult at first.",
      bullets: [
        "what the skill was",
        "how you learned it",
        "why it was difficult",
        "and explain how you feel about it now",
      ],
    },
    part3: [
      "Which skills do you think will be most important in the future?",
      "Is it better to learn a skill from a teacher or by yourself?",
      "Do schools teach enough practical skills?",
      "How can adults find time to learn new skills?",
    ],
  },
  {
    id: "sp-3",
    part1: [
      {
        topic: "Family",
        questions: [
          "Do you have a large or a small family?",
          "How much time do you spend with your family?",
          "Who are you closest to in your family?",
        ],
      },
      {
        topic: "Books and films",
        questions: [
          "Do you prefer reading books or watching films?",
          "What kind of stories do you enjoy?",
          "Did you read a lot as a child?",
        ],
      },
      {
        topic: "Sport",
        questions: [
          "Do you play any sport?",
          "Is sport popular in your country?",
          "Do you prefer watching or playing sport?",
        ],
      },
    ],
    part2: {
      cue: "Describe a person who has had an important influence on your life.",
      bullets: [
        "who this person is",
        "how you know them",
        "what they have done",
        "and explain why they influenced you",
      ],
    },
    part3: [
      "What qualities make a good role model?",
      "Do you think famous people influence young people too much?",
      "How can parents be better role models?",
      "Is it possible to be influenced by someone you have never met?",
    ],
  },
];

export function pickSpeakingSet(seed?: string): SpeakingSet {
  const idx = seed
    ? Math.abs([...seed].reduce((a, c) => a * 31 + c.charCodeAt(0), 11)) % SPEAKING_SETS.length
    : Math.floor(Math.random() * SPEAKING_SETS.length);
  return SPEAKING_SETS[idx]!;
}
