/** Resultado de uma Server Action de formulário. Seguro para importar no navegador. */
export type ActionState = { ok: boolean; message: string; fieldErrors?: Record<string, string> } | null;
