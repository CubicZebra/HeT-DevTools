import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class FileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileReadError';
  }
}

export class JsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonError';
  }
}

export async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

export async function readText(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    throw new FileReadError(`cannot read ${file}: ${(err as Error).message}`);
  }
}

export async function writeText(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

/** Read + parse a JSON file; errors carry the file path and underlying message. */
export async function readJson<T = Record<string, unknown>>(file: string): Promise<T> {
  const text = await readText(file);
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new JsonError(`invalid JSON in ${file}: ${(err as Error).message}`);
  }
}

/**
 * Serialize an object back to disk with stable formatting.
 * - keeps a `<file>.bak` of the previous content unless backup=false
 * - appends a trailing newline only if the original file had one
 */
export async function writeJson(
  file: string,
  obj: unknown,
  options: { backup?: boolean; indent?: number } = {},
): Promise<void> {
  const { backup = true, indent = 2 } = options;
  const previous = await exists(file) ? await readText(file) : undefined;
  if (backup && previous !== undefined) {
    await writeText(`${file}.bak`, previous);
  }
  const trailingNewline = previous !== undefined && previous.endsWith('\n');
  await writeText(file, JSON.stringify(obj, null, indent) + (trailingNewline ? '\n' : ''));
}

/**
 * Produce a copy of `original` where values from `patch` overwrite existing keys.
 * Key order is preserved from `original`; brand-new keys from `patch` are appended
 * at the end so textual diffs stay minimal (fcpp metadata.json has no comments).
 */
export function mergeOrdered<T extends Record<string, unknown>>(
  original: T,
  patch: Record<string, unknown>,
): T {
  const result = { ...original } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (key in result) {
      result[key] = value;
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in result)) {
      result[key] = value;
    }
  }
  return result as T;
}
