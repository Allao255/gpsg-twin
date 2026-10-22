// Estado declarado do cenário num instante da execução: RF Level vigente e manipulação de cada SV.
// D18 (provisório): a duração vale só para o erro de Doppler; os demais campos ficam até a próxima
// ação do mesmo SV.
import { sortedActions } from '../core/scenario/emit';
import type { Scenario, SvAction } from '../core/scenario/types';
import { SV_DEFAULT, svStateAt, type Constellation, type SvEdit } from '../replica/session';

export interface SvAt {
  constellation: Constellation;
  sv: number;
  state: SvEdit;
  /** Doppler em vigor no instante (0 depois da duração, D18). */
  doppler_Hz: number;
  /** Alguma manipulação diferente do padrão está em vigor. */
  manipulated: boolean;
}

export interface StateAt {
  t_s: number;
  /** A simulação está rodando em t (entre @run e @stop). */
  running: boolean;
  rfLevel_dBm: number;
  /** Instante da última mudança de RF Level até t, ou null (valor da configuração). */
  rfLevelSince_s: number | null;
  svs: SvAt[];
}

/** SVs citados nas ações do cenário, em ordem de constelação e número. */
export function actionSvs(sc: Scenario): { constellation: Constellation; sv: number }[] {
  const seen = new Map<string, { constellation: Constellation; sv: number }>();
  for (const a of sc.actions)
    if (a.type === 'sv')
      seen.set(`${a.constellation}${String(a.sv).padStart(2, '0')}`, {
        constellation: a.constellation,
        sv: a.sv,
      });
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

function lastSvAction(
  sc: Scenario,
  cons: Constellation,
  sv: number,
  t: number,
): SvAction | undefined {
  return sortedActions(sc.actions)
    .filter(
      (a): a is SvAction =>
        a.type === 'sv' && a.constellation === cons && a.sv === sv && a.t_s <= t,
    )
    .at(-1);
}

export function stateAt(sc: Scenario, t_s: number): StateAt {
  const rf = sortedActions(sc.actions)
    .filter((a) => a.type === 'rfLevel' && a.t_s <= t_s)
    .at(-1);
  const svs = actionSvs(sc).map(({ constellation, sv }) => {
    const state = svStateAt(sc, constellation, sv, t_s);
    const last = lastSvAction(sc, constellation, sv, t_s);
    const doppler = last && t_s < last.t_s + last.duration_s ? state.doppler_Hz : 0;
    const def = { ...SV_DEFAULT, health: constellation === 'GPS' ? 'GOOD' : 'CONNECTED' };
    const manipulated =
      state.select !== def.select ||
      state.health !== def.health ||
      doppler !== 0 ||
      state.incoherence_mps !== 0 ||
      state.ampOffset_dB !== 0 ||
      state.stepError_m !== 0;
    return { constellation, sv, state, doppler_Hz: doppler, manipulated };
  });
  return {
    t_s,
    running: t_s >= 0 && (sc.run.stopAt_s === null || t_s <= sc.run.stopAt_s),
    rfLevel_dBm: rf?.type === 'rfLevel' ? rf.level_dBm : sc.setup.rfLevel_dBm,
    rfLevelSince_s: rf ? rf.t_s : null,
    svs,
  };
}

/**
 * Fim do eixo da linha do tempo, com 5% de folga e no mínimo 60 s: o @stop, ou sem ele a última
 * ação mais a duração do Doppler (limitada a 600 s).
 */
export function timelineEnd(sc: Scenario): number {
  const last = Math.max(0, ...sc.actions.map((a) => a.t_s));
  const end =
    sc.run.stopAt_s !== null
      ? Math.max(sc.run.stopAt_s, last)
      : Math.max(
          last,
          ...sc.actions.map((a) =>
            a.type === 'sv' && a.doppler_Hz !== 0 ? a.t_s + Math.min(a.duration_s, 600) : a.t_s,
          ),
        );
  return Math.max(60, end * 1.05);
}
