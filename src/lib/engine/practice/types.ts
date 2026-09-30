export type TurnRole = "student" | "patient" | "exam" | "system";

export interface Turn {
  id: string;
  role: TurnRole;
  text: string;
  t: number;
  topics?: string[];
  exam?: string;
  cue?: boolean;
}

export interface ExamManeuver {
  key: string;
  label: string;
  ask: string;
  finding: string;
  match: string[];
  required?: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  topics: string[];
  weight: number;
  redFlag?: boolean;
  ask: string;
}

export interface NoteFact {
  id: string;
  label: string;
  any: string[];
  kind: "pos" | "neg" | "hx" | "exam";
  topic?: string;
  exam?: string;
  weight: number;
}

export interface Differential {
  dx: string;
  any: string[];
  leading?: boolean;
}

export interface PlanItem {
  label: string;
  any: string[];
  weight: number;
}

export interface PimpQuestion {
  q: string;
  any: string[];
  answer: string;
}

export interface PracticeCase {
  id: string;
  title: string;
  specialty: string;
  blurb: string;
  patient: {
    name: string;
    age: number;
    sex: "F" | "M";
    affect: string;
    opening: string;
    story: string;
    speaker?: { name: string; relation: string };
  };
  door: { setting: string; vitals: string; task: string };
  facts: Record<string, string>;
  topics?: Record<string, string[]>;
  cues?: string[];
  exam: ExamManeuver[];
  checklist: ChecklistItem[];
  note: { facts: NoteFact[]; differential: Differential[]; plan: PlanItem[]; contradictions?: { label: string; any: string[] }[] };
  pimp: PimpQuestion[];
  model: string;
}
