import { describe, expect, it } from 'vitest';
import { servicesFor } from './services';

describe('servicesFor', () => {
  it('GPS: aba GPS ativa, aba Galileo vazia', () => {
    expect(servicesFor('GPS', 'L1', 'GPS')).toEqual({
      carrier: 'L1',
      services: 'C/A, Pseudo P(Y)',
    });
    expect(servicesFor('GPS', 'L1 no P(y)', 'GPS').services).toBe('C/A');
    expect(servicesFor('GPS', 'L1', 'GAL')).toEqual({ carrier: '', services: '' });
  });

  it('Galileo: aba GPS vazia', () => {
    expect(servicesFor('GALILEO', 'E5A', 'GAL')).toEqual({
      carrier: 'E5A',
      services: 'I/NAV, F/NAV',
    });
    expect(servicesFor('GALILEO', 'E1', 'GPS')).toEqual({ carrier: '', services: '' });
  });

  it('GPS+Galileo: portadora dividida entre as abas', () => {
    expect(servicesFor('GAL+GPS', 'L1/E1', 'GPS')).toEqual({
      carrier: 'L1',
      services: 'C/A, Pseudo P(Y)',
    });
    expect(servicesFor('GAL+GPS', 'L5/E5', 'GAL')).toEqual({
      carrier: 'E5',
      services: 'I/NAV, F/NAV',
    });
  });

  it('portadora sem serviço conhecido', () => {
    expect(servicesFor('GPS', 'X9', 'GPS')).toEqual({ carrier: 'X9', services: '' });
  });
});
