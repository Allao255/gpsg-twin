import { describe, expect, it } from 'vitest';
import { child, escapeXml, parseXml, type XmlElement } from './xml';

function root(text: string): XmlElement {
  const r = parseXml(text);
  if ('error' in r) throw new Error(r.error);
  return r.root;
}

describe('parseXml', () => {
  it('elementos, atributos, texto e DOCTYPE do settings (OP D-7)', () => {
    const r = root(`\uFEFF<?xml version="1.0"?>
<!DOCTYPE GpsgPowerupConfig>
<!-- comentário -->
<GpsgPowerupConfig>
  <SimulationSetup>
    <LatLonFormat>DD°MM'SS.SS"</LatLonFormat>
    <MotionModel type="Unlimited"><Custom Velocity='0.44704' LateralAcceleration="19.6"/></MotionModel>
  </SimulationSetup>
</GpsgPowerupConfig>`);
    expect(r.name).toBe('GpsgPowerupConfig');
    const sim = child(r, 'SimulationSetup');
    expect(sim && child(sim, 'LatLonFormat')?.text).toBe(`DD°MM'SS.SS"`);
    const mm = sim && child(sim, 'MotionModel');
    expect(mm?.attrs).toEqual({ type: 'Unlimited' });
    expect(mm?.children[0]?.attrs).toEqual({ Velocity: '0.44704', LateralAcceleration: '19.6' });
    expect(child(r, 'Nada')).toBeUndefined();
  });

  it('entidades nomeadas e numéricas', () => {
    const r = root('<a n="x &amp; &quot;y&quot; &#65;&#x42; &bogus;">1 &lt; 2 &gt; 0 &apos;</a>');
    expect(r.attrs.n).toBe('x & "y" AB &bogus;');
    expect(r.text).toBe("1 < 2 > 0 '");
  });

  it('erros de estrutura', () => {
    const err = (t: string): string => {
      const r = parseXml(t);
      return 'error' in r ? r.error : '';
    };
    expect(err('')).toMatch(/sem elemento/);
    expect(err('texto <a/>')).toMatch(/fora do elemento raiz/);
    expect(err('<a><b></a>')).toMatch(/sem abertura/);
    expect(err('<a>')).toMatch(/não fechado/);
    expect(err('<a/><b/>')).toMatch(/mais de um/);
    expect(err('<a x=1/>')).toMatch(/marcação inválida/);
  });
});

describe('escapeXml', () => {
  it('ida e volta', () => {
    const s = `A&B <C> "D"`;
    expect(escapeXml(s)).toBe('A&amp;B &lt;C&gt; &quot;D&quot;');
    expect(root(`<a v="${escapeXml(s)}"/>`).attrs.v).toBe(s);
  });
});
