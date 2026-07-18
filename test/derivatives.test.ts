import { describe, expect, it } from 'vitest';
import { classifyFundingSkew, confirmStructureWithOpenInterest } from '../src/indicators/derivatives';
import { DerivativesDataPoint, StructureSignal } from '../src/types';

describe('confirmStructureWithOpenInterest', () => {
  const derivativesData: DerivativesDataPoint[] = [
    { time: 50, openInterest: 1000 },
    { time: 100, openInterest: 1100 },
    { time: 150, openInterest: 1050 },
    { time: 200, openInterest: 900 },
  ];

  it('confirms a BOS when OI rose beforehand (new money entering)', () => {
    const signals: StructureSignal[] = [
      { index: 5, time: 100, type: 'BOS', direction: 'bullish', level: 10 },
    ];
    const [result] = confirmStructureWithOpenInterest(signals, derivativesData);

    expect(result.expectedDirection).toBe('increase');
    expect(result.actualChangePercent).toBeCloseTo(10);
    expect(result.confirmed).toBe(true);
  });

  it('confirms a CHoCH/MSS when OI fell beforehand (positions being liquidated)', () => {
    const signals: StructureSignal[] = [
      { index: 8, time: 200, type: 'CHoCH', direction: 'bearish', level: 9 },
    ];
    const [result] = confirmStructureWithOpenInterest(signals, derivativesData);

    expect(result.expectedDirection).toBe('decrease');
    expect(result.actualChangePercent).toBeCloseTo(((900 - 1050) / 1050) * 100);
    expect(result.confirmed).toBe(true);
  });

  it('does not confirm a BOS when OI actually fell', () => {
    const signals: StructureSignal[] = [{ index: 9, time: 200, type: 'BOS', direction: 'bullish', level: 9 }];
    const [result] = confirmStructureWithOpenInterest(signals, derivativesData);
    expect(result.confirmed).toBe(false);
  });

  it('returns null/unconfirmed when there is no data before the signal', () => {
    const signals: StructureSignal[] = [{ index: 1, time: 10, type: 'BOS', direction: 'bullish', level: 5 }];
    const [result] = confirmStructureWithOpenInterest(signals, derivativesData);

    expect(result.actualChangePercent).toBeNull();
    expect(result.confirmed).toBe(false);
  });

  it('returns null/unconfirmed when openInterest data is missing', () => {
    const signals: StructureSignal[] = [{ index: 2, time: 100, type: 'BOS', direction: 'bullish', level: 5 }];
    const sparse: DerivativesDataPoint[] = [
      { time: 50, fundingRate: 0.01 },
      { time: 100, fundingRate: 0.02 },
    ];
    const [result] = confirmStructureWithOpenInterest(signals, sparse);

    expect(result.actualChangePercent).toBeNull();
    expect(result.confirmed).toBe(false);
  });
});

describe('classifyFundingSkew', () => {
  it('classifies heavily negative funding as shorts crowded', () => {
    expect(classifyFundingSkew(-0.02)).toBe('shorts_crowded');
  });

  it('classifies heavily positive funding as longs crowded', () => {
    expect(classifyFundingSkew(0.02)).toBe('longs_crowded');
  });

  it('classifies small funding as neutral', () => {
    expect(classifyFundingSkew(0.005)).toBe('neutral');
  });

  it('treats the threshold boundary as crowded (inclusive)', () => {
    expect(classifyFundingSkew(-0.01)).toBe('shorts_crowded');
    expect(classifyFundingSkew(0.01)).toBe('longs_crowded');
  });
});
