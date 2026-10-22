// Valida model/commands.json contra o schema antes de qualquer teste.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';

export default function setup(): void {
  const root = resolve(import.meta.dirname, '..');
  const schema: unknown = JSON.parse(
    readFileSync(resolve(root, 'model/commands.schema.json'), 'utf8'),
  );
  const model: unknown = JSON.parse(readFileSync(resolve(root, 'model/commands.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  const validate = ajv.compile(schema as object);
  if (!validate(model)) {
    const msg = (validate.errors ?? [])
      .slice(0, 20)
      .map((e) => `${e.instancePath} ${e.message ?? ''}`)
      .join('\n');
    throw new Error(`model/commands.json não confere com o schema:\n${msg}`);
  }
}
