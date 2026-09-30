import type { PracticeCase } from "../types";
import { abdominalPain } from "./abdominalPain";
import { chestPain } from "./chestPain";
import { depression } from "./depression";
import { diabetes } from "./diabetes";
import { headache } from "./headache";
import { lowBackPain } from "./lowBackPain";
import { pediatricFever } from "./pediatricFever";
import { shortnessOfBreath } from "./shortnessOfBreath";

export const CASES: PracticeCase[] = [chestPain, abdominalPain, headache, diabetes, depression, pediatricFever, lowBackPain, shortnessOfBreath];

export function practiceCase(id: string | null | undefined) {
  return CASES.find((c) => c.id === id) ?? null;
}
