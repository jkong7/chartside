export type Step = { waitPrompts: number; timeoutMs?: number } | { digit: string } | { say: string } | { wav: string } | { silence: number } | { sleep: number } | { hangup: true } | { waitClose: true; timeoutMs?: number };
export interface DialResult { connected: boolean; callSid?: string; prompts?: number; closeCode?: number | null; phone?: string; inboxKey?: string | null; twiml?: string }
export function dial(opts: { base: string; from?: string; sim?: boolean; cookie?: string; twilioToken?: string; steps?: Step[]; mockDeepgram?: string; deepgramKey?: string; frameMs?: number; log?: (m: string) => void }): Promise<DialResult>;
export function twilioSignature(token: string, url: string, params: Record<string, string>): string;
export function wavToMulaw8k(file: string): Buffer;
