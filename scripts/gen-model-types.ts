// Gera os tipos TypeScript do modelo de comandos a partir de model/commands.schema.json
// e a união literal dos cabeçalhos a partir de model/commands.json.
// Saída: src/core/model/types.gen.ts e src/core/model/headers.gen.ts. Não editar à mão.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile, type JSONSchema } from 'json-schema-to-typescript';

const root = resolve(import.meta.dirname, '..');
const schema = JSON.parse(
  readFileSync(resolve(root, 'model/commands.schema.json'), 'utf8'),
) as JSONSchema;
const model = JSON.parse(readFileSync(resolve(root, 'model/commands.json'), 'utf8')) as {
  commands: { header: string; params: { name: string; type: string; values?: string[] }[] }[];
};

const banner = '// Gerado por scripts/gen-model-types.ts. Não editar à mão.\n';

const types = await compile(schema, 'CommandModel', {
  bannerComment: banner,
  additionalProperties: false,
  unreachableDefinitions: true,
  style: { singleQuote: true, printWidth: 100 },
});
writeFileSync(resolve(root, 'src/core/model/types.gen.ts'), types);

const headers = model.commands.map((c) => c.header);
const lines = [
  banner,
  'export const COMMAND_HEADERS = [',
  ...headers.map((h) => `  ${JSON.stringify(h)},`),
  '] as const;',
  '',
  'export type CommandHeader = (typeof COMMAND_HEADERS)[number];',
  '',
  '/** Valores de enumeração por cabeçalho e parâmetro de comandos set. */',
  'export interface ModelEnums {',
  ...model.commands
    .filter((c) => c.params.some((p) => p.type === 'enum'))
    .flatMap((c) => [
      `  ${JSON.stringify(c.header)}: {`,
      ...c.params
        .filter((p) => p.type === 'enum')
        .map(
          (p) => `    ${p.name}: ${(p.values ?? []).map((v) => JSON.stringify(v)).join(' | ')};`,
        ),
      '  };',
    ]),
  '}',
  '',
  'export type EnumValue<H extends keyof ModelEnums, P extends keyof ModelEnums[H]> = ModelEnums[H][P];',
  '',
];
writeFileSync(resolve(root, 'src/core/model/headers.gen.ts'), lines.join('\n'));
console.log(`types.gen.ts e headers.gen.ts gerados (${headers.length} cabeçalhos)`);
