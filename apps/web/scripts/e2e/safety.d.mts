export const WEB_URL: string;
export const API_URL: string;
export function assertLocalUrl(value: string): URL;
export function cleanEnvironment(source?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function assertWorkspace(directory: string, runId: string): string;
