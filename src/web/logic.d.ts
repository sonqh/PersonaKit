// Types for logic.js, for the type check of the tests.
export declare const TOKEN_KEY: string;
export declare function parseFragment(hash: string): { token?: string; code?: string };
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export declare function saveToken(token: string, storage?: StorageLike): void;
export declare function loadToken(storage?: StorageLike): string | undefined;
export declare function clearToken(storage?: StorageLike): void;
export interface Question { id: string; kind: string; text: string; hint?: string }
export declare function buildInterviewBatch(questions: Question[], answers: Record<string, string>): { kind: string; statement: string; source: "interview" }[];
export declare function printEnabled(currentText: string, checked: { text: string; check: { ok: boolean } } | undefined): boolean;
export declare const EXPORT_WARNING: string;
export declare function exportAllowed(confirmed: unknown): boolean;
export declare const START_TEXT: string;
export declare function startScreen(state: { total: number; counts?: Record<string, number> } | undefined): "start" | "review" | "result";
export declare function emptyResultHint(result: { counts?: { brief: number; cv: number } } | undefined): string | undefined;
export declare const VISIBILITY_CHOICES: { value: "private" | "ai" | "public"; label: string; help: string; default?: boolean }[];
export declare function errorMessage(err: { network?: boolean; status?: number; message?: string } | undefined): string;
