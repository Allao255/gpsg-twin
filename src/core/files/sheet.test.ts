import { describe, expect, it } from 'vitest';
import { defaultScenario } from '../scenario/defaults';
import { describeAction, sessionSheet } from './sheet';

describe('describeAction', () => {
  it('RF Level e SV com os campos não nulos', () => {
    expect(describeAction({ t_s: 0, type: 'rfLevel', level_dBm: -125 })).toBe('RF Level -125 dBm');
    expect(
      describeAction({
        t_s: 0,
        type: 'sv',
        constellation: 'GPS',
        sv: 5,
        select: 'OFF',
        health: 'BAD',
        doppler_Hz: -50,
        incoherence_mps: 0.5,
        ampOffset_dB: -6,
        stepError_m: 100,
        duration_s: 10,
      }),
    ).toBe(
      'GPS 5, OFF, BAD, Doppler -50 Hz, coerência 0.5 m/s, offset -6 dB, step 100 m, duração 10 s',
    );
  });
});

describe('sessionSheet', () => {
  it('porta DIRECT, sem arquivos, sem @stop', () => {
    const t = sessionSheet(defaultScenario(), [], 'cenario.scpi');
    expect(t).toMatch(/^# Folha de sessão: cenario\n/);
    expect(t).toMatch(/Porta de RF: \*\*DIRECT\*\*/);
    expect(t).toMatch(/Nada ligado à porta COUPLER/);
    expect(t).toMatch(/Faixa da porta com as perdas: -155 a -93 dBm/);
    expect(t).toMatch(/-112\.2 dBm com 6 SVs, -109\.2 dBm com 12 SVs/);
    expect(t).not.toMatch(/Pendrive/);
    expect(t).not.toMatch(/\b[MD]\d{1,2}\b/);
    expect(t).not.toMatch(/## Arquivos do pacote/);
    expect(t).toMatch(/Sem `@stop`/);
    expect(t).toMatch(/GPS:FIL:SET:LOAD "twin_bkp_cenario"/);
    expect(t).not.toMatch(/—/);
  });

  it('COUPLER, referência e trigger externos, arquivos e linha do tempo', () => {
    const sc = defaultScenario();
    sc.description = 'Ensaio de exemplo';
    sc.setup.rfPort = 'COUPLER';
    sc.setup.rfLevel_dBm = -100;
    sc.setup.prnSignal = 'VARIABLE';
    sc.setup.referenceSource = 'EXTERNAL';
    sc.setup.extRef = 'ON';
    sc.setup.triggerSource = 'EXTERNAL';
    sc.io.couplerCable_dB = 2.5;
    sc.actions = [{ t_s: 30, type: 'rfLevel', level_dBm: -110 }];
    sc.run.stopAt_s = 60;
    const t = sessionSheet(
      sc,
      [
        { path: 'Instrument/almanacs/twin_w.alm', loaded: true, note: '' },
        { path: 'Instrument/Routes/twin_r.rte', loaded: false, note: 'D29' },
      ],
      'x.scpi',
    );
    expect(t).toMatch(/Ensaio de exemplo/);
    expect(t).toMatch(/Acoplador sobre a antena/);
    expect(t).toMatch(/VARIABLE/);
    expect(t).toMatch(/Referência de 10 MHz externa/);
    expect(t).toMatch(/Saída de referência externa ligada/);
    expect(t).toMatch(/Trigger externo/);
    expect(t).toMatch(/Faixa da porta com as perdas: -132 a -70 dBm \(perda considerada 2.5 dB\)/);
    expect(t).toMatch(/Na antena, pelo acoplador: .* = -124 dBm/);
    expect(t).toMatch(/Pendrive FAT32/);
    expect(t).toMatch(
      /\| `Instrument\/almanacs\/twin_w.alm` \| importado e carregado pelo script \|/,
    );
    expect(t).toMatch(
      /\| `Instrument\/Routes\/twin_r.rte` \| registro; não carregado pelo script\. D29 \|/,
    );
    expect(t).toMatch(/\| 30 \| RF Level -110 dBm \|\n\| 60 \| `@stop`/);
    expect(t).toMatch(/Inserir o pendrive/);
  });
});
