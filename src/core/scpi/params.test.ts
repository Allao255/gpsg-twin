import { describe, expect, it } from 'vitest';
import { checkFormat, parseNumberToken, varNames, type CommandContext } from './params';
import { checkCommand } from './validate';

const SI: CommandContext = { running: false, units: 'SI', port: 'DIRECT', losses: null };
const IMP: CommandContext = { ...SI, units: 'IMPERIAL' };

function codes(text: string, ctx?: CommandContext): string[] {
  return checkCommand(text, ctx).diagnostics.map((d) => `${d.severity}:${d.code}`);
}
function value(text: string, i = 0, ctx?: CommandContext): unknown {
  return checkCommand(text, ctx).values[i];
}

describe('números', () => {
  it('lê inteiros, decimais, binário, hexadecimal e sufixo', () => {
    expect(parseNumberToken('+12.5')).toEqual({ value: 12.5, suffix: null });
    expect(parseNumberToken('.5')).toEqual({ value: 0.5, suffix: null });
    expect(parseNumberToken('1e3')).toEqual({ value: 1000, suffix: null });
    expect(parseNumberToken('#B101')).toEqual({ value: 5, suffix: null });
    expect(parseNumberToken('#h1F')).toEqual({ value: 31, suffix: null });
    expect(parseNumberToken('1000 FT')).toEqual({ value: 1000, suffix: 'FT' });
    expect(parseNumberToken('1000FT')).toEqual({ value: 1000, suffix: 'FT' });
    expect(parseNumberToken('abc')).toHaveProperty('error');
  });

  it('nomes de variáveis', () => {
    expect(varNames('${A},x${B_2}')).toEqual(['A', 'B_2']);
  });
});

describe('tipo, faixa e passo', () => {
  it('inteiro exige valor inteiro', () => {
    expect(codes('*ESE 1.5')).toContain('error:type');
    expect(codes('*ESE #B11111111')).toEqual([]);
    expect(codes('*ESE 256')).toContain('error:range');
  });

  it('número entre aspas é erro de tipo', () => {
    expect(codes('GPS:SET:CLOS "1"', SI)).toContain('error:type');
    expect(codes('GPS:SET:CLOS abc', SI)).toContain('error:type');
  });

  it('faixa e passo do modelo', () => {
    expect(codes('GPS:SET:CLOS 12.2', SI)).toEqual([]);
    expect(codes('GPS:SET:CLOS 40.1', SI)).toContain('error:range');
    expect(codes('GPS:SET:CLOS 1.25', SI)).toContain('warning:step');
  });

  it('sobreposição de faixa D08', () => {
    const d = checkCommand('GPS:ROUT:EDIT 10000,"a",0,0,0,0,0,0,0', SI).diagnostics;
    expect(d.find((x) => x.code === 'range')?.dRefs).toContain('D08');
  });

  it('sufixo não permitido e unidade incompatível', () => {
    expect(codes('GPS:SET:CLOS 3 dB', SI)).toContain('error:unit-suffix-not-allowed');
    expect(codes('GPS:SIM:ALT 10 mph', SI)).toContain('error:unit-unknown');
    expect(codes('GPS:SIM:ALT 10 xyz', SI)).toContain('error:unit-unknown');
  });
});

describe('grandezas que dependem do modo de unidades (D04)', () => {
  it('SI: altitude em metros', () => {
    expect(value('GPS:SIM:ALT 300', 0, SI)).toMatchObject({ kind: 'number', value: 300 });
  });

  it('IMPERIAL: altitude em pés', () => {
    const v = value('GPS:SIM:ALT 1000', 0, IMP) as { value: number };
    expect(v.value).toBeCloseTo(304.8, 9);
  });

  it('sufixo converte e gera aviso de sintaxe não verificada', () => {
    const c = checkCommand('GPS:SIM:ALT 1000 FT', SI);
    expect((c.values[0] as { value: number }).value).toBeCloseTo(304.8, 9);
    expect(c.diagnostics.map((d) => d.code)).toEqual(['unit-suffix-unverified']);
    expect(codes('GPS:SIM:ALT 40000 M', SI)).toContain('error:range');
  });

  it('faixa em SI convertida da faixa em pés', () => {
    expect(codes('GPS:SIM:ALT 30480', SI)).toEqual([]);
    expect(codes('GPS:SIM:ALT 30481', SI)).toContain('error:range');
  });

  it('modo desconhecido: aviso quando só um modo aceita, erro quando nenhum', () => {
    const unknown: CommandContext = { ...SI, units: null };
    expect(codes('GPS:SIM:ALT 50000', unknown)).toContain('warning:range-depends-on-units');
    expect(codes('GPS:SIM:ALT 200000', unknown)).toContain('error:range');
    expect(codes('GPS:SIM:ALT 100', unknown)).toEqual([]);
  });

  it('modos AERO não verificados', () => {
    expect(codes('GPS:SIM:ALT 100', { ...SI, units: 'AERO/SI' })).toContain(
      'warning:units-aero-unverified',
    );
  });

  it('MLAT sem unidade no modelo: grandeza pelo nome', () => {
    expect(value('GPS:SET:MLAT 98.22', 0, SI)).toMatchObject({ value: 98.22 });
    const v = value('GPS:SET:MVEL 100', 0, IMP) as { value: number };
    expect(v.value).toBeCloseTo(44.704, 9);
  });

  it('faixa por unidade (KML)', () => {
    expect(codes('GPS:FIL:KML:MVEL 1500', SI)).toEqual([]);
    expect(codes('GPS:FIL:KML:MVEL 1500', IMP)).toContain('error:range');
    expect(codes('GPS:FIL:KML:MVEL 1500', { ...SI, units: null })).toContain(
      'warning:range-depends-on-units',
    );
    expect(codes('GPS:FIL:KML:MVEL 5000', { ...SI, units: null })).toContain('error:range');
    const v = value('GPS:FIL:KML:MVEL 36', 0, SI) as { value: number };
    expect(v.value).toBeCloseTo(10, 9);
  });
});

describe('faixa por porta e D17', () => {
  it('porta conhecida', () => {
    expect(codes('GPS:SET:RFLV -150', SI)).toEqual([]);
    expect(codes('GPS:SET:RFLV -150', { ...SI, port: 'COUPLER' })).toContain('error:range');
  });

  it('porta desconhecida', () => {
    const u: CommandContext = { ...SI, port: null };
    expect(codes('GPS:SET:RFLV -71', u)).toContain('info:range-unknown');
    expect(codes('GPS:SET:RFLV -120', u)).toEqual([]);
    expect(codes('GPS:SET:RFLV -60', u)).toContain('error:range');
  });

  it('perdas deslocam a faixa pela parte inteira (D17)', () => {
    const losses = { coupler_dB: 0, couplerCable_dB: 0, directCable_dB: 4.7, splitter_dB: 0 };
    const ctx: CommandContext = { ...SI, losses };
    // DIRECT -155..-93 deslocado por 4 dB: -159..-97.
    expect(codes('GPS:SET:RFLV -95', SI)).toEqual([]);
    const d = checkCommand('GPS:SET:RFLV -95', ctx).diagnostics;
    expect(d.map((x) => x.code)).toEqual(['range']);
    expect(d[0]?.dRefs).toContain('D17');
    expect(codes('GPS:SET:RFLV -159', ctx)).toEqual([]);
    expect(codes('GPS:SET:RFLV -159', SI)).toContain('error:range');
  });
});

describe('enum, string, lat/long', () => {
  it('enum sem diferenciar caixa e com espaço', () => {
    expect(value('GPS:SET:CRGA e5a')).toMatchObject({ value: 'E5a' });
    expect(value('GPS:FIL:KML:STIM 4 Hz')).toMatchObject({ value: '4 Hz' });
    expect(value('GPS:FIL:KML:STIM 4HZ')).toMatchObject({ value: '4 Hz' });
  });

  it('enum entre aspas: aviso D06', () => {
    const d = checkCommand('GPS:SET:PSRC "USER"').diagnostics;
    expect(d.map((x) => x.code)).toEqual(['enum-quoted']);
    expect(d[0]?.dRefs).toContain('D06');
  });

  it('enum inválido com dica de discrepância', () => {
    const d = checkCommand('GPS:SET:CLOC INTERNAL').diagnostics;
    expect(d[0]?.code).toBe('enum');
    expect(d[0]?.dRefs).toContain('D12');
    expect(codes('GPS:SET:GNSS GLONASS')).toContain('error:enum');
  });

  it('string: aspas, comprimento e formato', () => {
    expect(codes('GPS:FIL:SET:SAV twin_x')).toContain('warning:string-unquoted');
    expect(codes(`GPS:ROUT:ADD:WAYP "${'x'.repeat(81)}",0,0,0,0`, SI)).toContain('error:maxlen');
    expect(codes('GPS:SET:DAT "02/30/2013"')).toContain('error:format');
    expect(codes('GPS:SET:DAT "2013-02-01"')).toContain('error:format');
    expect(codes('GPS:SET:TIM "25:00:00"')).toContain('error:format');
    expect(codes('GPS:SET:TIM "1:00"')).toContain('error:format');
    expect(codes('GPS:SET:TIM "23:59:59"')).toEqual([]);
    expect(checkFormat('outro', 'x')).toBeNull();
  });

  it('latitude e longitude', () => {
    const v = value('GPS:SIM:LAT 45.3458') as { value: number; form: string };
    expect(v.value).toBeCloseTo((45.3458 * Math.PI) / 180, 12);
    expect(v.form).toBe('decimal');
    const dm = checkCommand('GPS:SIM:LONG 105,45.8912,W');
    expect(dm.diagnostics.map((d) => d.code)).toEqual(['latlon-dm']);
    expect((dm.values[0] as { form: string }).form).toBe('deg-min');
    expect(codes('GPS:SIM:LAT 91')).toContain('error:range');
    expect(codes('GPS:SIM:LAT 1 FT')).toContain('error:type');
    expect(codes('GPS:SIM:LAT 12,61,N')).toContain('error:type');
  });

  it('parâmetro de unidade em consulta', () => {
    expect(value('GPS:SIM:ALT? FT')).toMatchObject({ kind: 'unit', value: 'ft' });
    expect(codes('GPS:SIM:ALT? XYZ')).toContain('error:unit-unknown');
  });

  it('variável deixa o parâmetro sem validação', () => {
    expect(value('GPS:SVPR:GPS:SAT ${PRN},ON,GOOD,0,0,0,0,3600', 0)).toMatchObject({
      kind: 'var',
      names: ['PRN'],
    });
  });
});

describe('número de parâmetros', () => {
  it('faltando e sobrando', () => {
    expect(codes('GPS:SET:CLOS')).toContain('error:arity');
    expect(codes('GPS:SET:CLOS 1,2')).toContain('error:arity');
    expect(codes('*CLS 1')).toContain('error:arity');
  });

  it('SVPR:SAT com 7 parâmetros: aviso D02', () => {
    const d = checkCommand('GPS:SVPR:GPS:SAT 1,ON,GOOD,0,0,0,0').diagnostics;
    expect(d.map((x) => x.code)).toEqual(['optional-omitted']);
    expect(d[0]?.dRefs).toContain('D02');
  });

  it('opcional omitido fora de SVPR não gera diagnóstico', () => {
    expect(codes('GPS:SIM:ALT?')).toEqual([]);
  });
});
