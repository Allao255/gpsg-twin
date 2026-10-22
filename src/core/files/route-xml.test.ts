import { describe, expect, it } from 'vitest';
import { degToRad } from '../geo';
import { defaultScenario } from '../scenario/defaults';
import type { RoutePoint, Scenario } from '../scenario/types';
import { g16, routeFromXml, routeToXml } from './route-xml';

// Exemplo do manual de operação (OP D-5), seis pontos.
const OP_D5 = `<Route>
       <Waypoint Longitude="-77.88420000000001" MaxAcceleration="0" MaxClimbRate="0"
Name="HESKU" Latitude="37.14982222222222" Altitude="1524" TargetSpeed="53.64466666666667"
TurningCircleRadius="108.5658611334349"/>
       <Waypoint Longitude="-78.80005277777778" MaxAcceleration="0" MaxClimbRate="0"
Name="RFLAT" Latitude="38.20028888888889" Altitude="1524" TargetSpeed="53.64466666666667"
TurningCircleRadius="131.3646919714563"/>
       <Waypoint Longitude="-78.83963333333332" MaxAcceleration="9.800000000000001"
MaxClimbRate="-3.048" Name="RIVKE" Latitude="38.24149166666667" Altitude="1249.68"
TargetSpeed="53.64466666666667" TurningCircleRadius="100"/>
       <Waypoint Longitude="-78.88314444444444" MaxAcceleration="9.800000000000001"
MaxClimbRate="-3.048" Name="BEEDY" Latitude="38.28670277777778" Altitude="944.88"
TargetSpeed="53.64466666666667" TurningCircleRadius="100"/>
       <Waypoint Longitude="-78.95743055" MaxAcceleration="9.800000000000001"
MaxClimbRate="-3.048" Name="RW33" Latitude="38.363725" Altitude="355.092"
TargetSpeed="53.64466666666667" TurningCircleRadius="131.3646919714563"/>
       <Waypoint Longitude="-79.13772222222222" MaxAcceleration="9.800000000000001"
MaxClimbRate="3.048" Name="MOL" Latitude="37.86372222222222" Altitude="1828.8"
TargetSpeed="75.99661111111111" TurningCircleRadius="183.4763053155051"/>
</Route>`;

function withPoints(points: RoutePoint[]): Scenario {
  const sc = defaultScenario();
  sc.route.points = points;
  return sc;
}

describe('routeFromXml', () => {
  it('exemplo do manual: seis pontos em SI, sem diagnóstico', () => {
    const r = routeFromXml(OP_D5);
    expect(r.diagnostics).toEqual([]);
    expect(r.points).toHaveLength(6);
    const p = r.points[2];
    expect(p?.kind).toBe('point');
    if (p?.kind !== 'point') return;
    expect(p.name).toBe('RIVKE');
    expect(p.lat_rad).toBeCloseTo(degToRad(38.24149166666667), 15);
    expect(p.alt_m).toBe(1249.68);
    expect(p.climbRate_mps).toBe(-3.048);
    expect(p.accel_mps2).toBe(9.800000000000001);
    expect(p.speed_mps).toBe(53.64466666666667);
    expect(p.turnRadius_m).toBe(100);
  });

  it('erros de estrutura e de valor', () => {
    expect(routeFromXml('<Route>').diagnostics[0]?.severity).toBe('error');
    expect(routeFromXml('<Rota/>').diagnostics[0]?.message).toMatch(/esperado <Route>/);
    const r = routeFromXml(
      `<Route><Outro/><Waypoint Name="A" Latitude="x"/>` +
        `<Waypoint Longitude="0" MaxAcceleration="0" MaxClimbRate="0" Name="B" Latitude="0" ` +
        `Altitude="0" TargetSpeed="9999" TurningCircleRadius="0"/></Route>`,
    );
    expect(r.points.map((p) => (p.kind === 'point' ? p.name : ''))).toEqual(['B']);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['file-format', 'file-format', 'file-value']);
    expect(r.diagnostics[2]?.message).toMatch(/ponto 3 \(B\)/);
  });

  it('mais de 9999 pontos (D08)', () => {
    const w =
      '<Waypoint Longitude="0" MaxAcceleration="0" MaxClimbRate="0" Name="P" Latitude="0" Altitude="0" TargetSpeed="0" TurningCircleRadius="0"/>';
    const r = routeFromXml(`<Route>${w.repeat(10000)}</Route>`);
    expect(r.diagnostics.at(-1)?.message).toMatch(/D08/);
  });
});

describe('g16', () => {
  it('formato %.16g dos valores do manual', () => {
    expect(g16(9.8)).toBe('9.800000000000001');
    expect(g16(-77.8842)).toBe('-77.88420000000001');
    expect(g16(-3.048)).toBe('-3.048');
    expect(g16(1524)).toBe('1524');
    expect(g16(-0)).toBe('0');
    expect(g16(1.5e-20)).toBe('1.5e-20');
    expect(g16(1e21)).toBe('1e+21');
  });
});

describe('routeToXml', () => {
  it('ida e volta do exemplo do manual, valores idênticos', () => {
    const pts = routeFromXml(OP_D5).points;
    const out = routeToXml(withPoints(pts));
    expect(out.diagnostics).toEqual([]);
    const back = routeFromXml(out.text ?? '').points;
    back.forEach((p, i) => {
      const q = pts[i];
      if (p.kind !== 'point' || q?.kind !== 'point') throw new Error('tipo');
      expect({ ...p, lat_rad: 0, lon_rad: 0 }).toEqual({ ...q, lat_rad: 0, lon_rad: 0 });
      expect(p.lat_rad).toBeCloseTo(q.lat_rad, 14);
      expect(p.lon_rad).toBeCloseTo(q.lon_rad, 14);
    });
    expect(out.text).toMatch(
      /<Waypoint Longitude="-79\.137722222222\d*" MaxAcceleration="9\.800000000000001" MaxClimbRate="3\.048" Name="MOL"/,
    );
  });

  it('nome escapado; waypoint de usuário com as coordenadas dele', () => {
    const sc = withPoints([
      {
        kind: 'point',
        name: 'A&B',
        lat_rad: 0,
        lon_rad: -0,
        alt_m: 0,
        climbRate_mps: 0,
        speed_mps: 10,
        accel_mps2: 1,
        turnRadius_m: 100,
      },
      {
        kind: 'waypoint',
        code: 'MCI',
        climbRate_mps: 0,
        speed_mps: 10,
        accel_mps2: 1,
        turnRadius_m: 100,
      },
    ]);
    sc.userWaypoints = [
      {
        code: 'MCI',
        icao: '',
        name: '',
        city: '',
        state: '',
        lat_rad: degToRad(39.2976),
        lon_rad: degToRad(-94.7139),
        alt_m: 312,
      },
    ];
    const t = routeToXml(sc).text ?? '';
    expect(t).toContain('Longitude="0"');
    expect(t).toContain('Name="A&amp;B"');
    const back = routeFromXml(t).points;
    expect(back[1]).toMatchObject({ kind: 'point', name: 'MCI', alt_m: 312 });
  });

  it('waypoint do banco impede o arquivo', () => {
    const r = routeToXml(
      withPoints([
        {
          kind: 'waypoint',
          code: 'SFO',
          climbRate_mps: 0,
          speed_mps: 1,
          accel_mps2: 1,
          turnRadius_m: 1,
        },
      ]),
    );
    expect(r.text).toBeNull();
    expect(r.diagnostics[0]?.message).toMatch(/SFO/);
  });

  it('rota vazia', () => {
    expect(routeToXml(withPoints([])).text).toBe('<Route>\n</Route>\n');
  });
});
