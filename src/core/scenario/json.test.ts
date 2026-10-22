import { describe, expect, it } from 'vitest';
import { defaultScenario } from './defaults';
import { dynamicScenario } from './fixtures.test-util';
import { parseScenarioJson, serializeScenario } from './json';

describe('JSON do cenário', () => {
  it('ida e volta e determinismo', () => {
    for (const sc of [defaultScenario(), dynamicScenario()]) {
      const text = serializeScenario(sc);
      const r = parseScenarioJson(text);
      expect(r.diagnostics).toEqual([]);
      expect(r.scenario).toEqual(sc);
      expect(serializeScenario(r.scenario ?? sc)).toBe(text);
    }
    const text = serializeScenario(defaultScenario());
    expect(
      text.startsWith('{\n  "scenario_version": 1,\n  "name": "cenario",\n  "description": ""'),
    ).toBe(true);
  });

  it('almanaque padrão e por equipamento', () => {
    const sc = defaultScenario();
    sc.files.almanac = { kind: 'equipment' };
    expect(parseScenarioJson(serializeScenario(sc)).scenario?.files.almanac).toEqual({
      kind: 'equipment',
    });
  });

  const broken = (mut: (o: Record<string, unknown>) => void): string => {
    const o = JSON.parse(serializeScenario(dynamicScenario())) as Record<string, unknown>;
    mut(o);
    return parseScenarioJson(JSON.stringify(o)).diagnostics[0]?.message ?? '';
  };

  it('rejeita JSON inválido e versões desconhecidas', () => {
    expect(parseScenarioJson('{').diagnostics[0]?.message).toMatch(/JSON inválido/);
    expect(broken((o) => (o.scenario_version = 2))).toMatch(/não suportada/);
    expect(parseScenarioJson('[]').diagnostics[0]?.message).toMatch(/objeto/);
  });

  it('aponta o campo inválido', () => {
    expect(broken((o) => ((o.setup as Record<string, unknown>).gnss = 'GLONASS'))).toMatch(
      /setup.gnss/,
    );
    expect(broken((o) => ((o.setup as Record<string, unknown>).rfLevel_dBm = 'x'))).toMatch(
      /setup.rfLevel_dBm: número/,
    );
    expect(broken((o) => (o.name = 1))).toMatch(/\$.name: string/);
    expect(broken((o) => (o.actions = {}))).toMatch(/actions: lista/);
    expect(broken((o) => ((o.files as Record<string, unknown>).imports = ['XX']))).toMatch(
      /imports\[0\]/,
    );
    expect(broken((o) => ((o.route as Record<string, unknown>).points = [{ kind: 'x' }]))).toMatch(
      /points\[0\]/,
    );
    expect(broken((o) => ((o.files as Record<string, unknown>).settings = 3))).toMatch(
      /files.settings/,
    );
    expect(broken((o) => ((o.channels as Record<string, unknown>).gnss = 'a'))).toMatch(
      /channels.gnss/,
    );
  });
});
