import { describe, expect, it } from 'vitest';
import {
  canEnterRegionExpedition, completeRegionExpedition, createRegionProgress,
  discoverRegionSite, finishRegionDialogue, parseRegionProgress, type RegionProgress,
} from '../../src/domain/region/regionProgress';

function relayReady() {
  return finishRegionDialogue(finishRegionDialogue(createRegionProgress(), 'town_arrival'), 'meadow_signal');
}
function aqueductReady() {
  return finishRegionDialogue(completeRegionExpedition(relayReady(), 'course'), 'ruin_relay');
}

describe('first region progression', () => {
  it('starts at arrival with no discoveries or completed expeditions', () => {
    expect(createRegionProgress()).toEqual({ version: 1, chapter: 'arrival', discoveries: [], completedExpeditions: [] });
  });

  it('requires each expedition result before its report dialogue can advance the chapter', () => {
    let progress = createRegionProgress();
    expect(canEnterRegionExpedition(progress, 'course')).toBe(false);
    progress = finishRegionDialogue(progress, 'town_arrival');
    expect(progress.chapter).toBe('signal');
    progress = finishRegionDialogue(progress, 'meadow_signal');
    expect(progress.chapter).toBe('relay');
    expect(canEnterRegionExpedition(progress, 'course')).toBe(true);
    expect(canEnterRegionExpedition(progress, 'palace')).toBe(false);
    expect(finishRegionDialogue(progress, 'ruin_relay')).toBe(progress);
    progress = completeRegionExpedition(progress, 'course');
    expect(progress.chapter).toBe('relay-report');
    expect(progress.completedExpeditions).toEqual(['course']);
    progress = finishRegionDialogue(progress, 'ruin_relay');
    expect(progress.chapter).toBe('aqueduct');
    expect(canEnterRegionExpedition(progress, 'palace')).toBe(true);
    expect(finishRegionDialogue(progress, 'aqueduct_open')).toBe(progress);
    progress = completeRegionExpedition(progress, 'palace');
    expect(progress.chapter).toBe('aqueduct-report');
    expect(progress.completedExpeditions).toEqual(['course', 'palace']);
    progress = finishRegionDialogue(progress, 'aqueduct_open');
    expect(progress.chapter).toBe('homecoming');
    progress = finishRegionDialogue(progress, 'town_return');
    expect(progress.chapter).toBe('complete');
  });

  it('ignores early, repeated and unrelated dialogue events', () => {
    const arrival = createRegionProgress();
    expect(finishRegionDialogue(arrival, 'town_return')).toBe(arrival);
    expect(finishRegionDialogue(arrival, 'meadow_signal')).toBe(arrival);
    const signal = finishRegionDialogue(arrival, 'town_arrival');
    expect(finishRegionDialogue(signal, 'town_arrival')).toBe(signal);
    expect(arrival.chapter).toBe('arrival');
  });

  it('cannot complete a locked expedition or regress progress by replaying an old one', () => {
    const initial = createRegionProgress();
    expect(completeRegionExpedition(initial, 'course')).toBe(initial);
    expect(completeRegionExpedition(relayReady(), 'palace').chapter).toBe('relay');
    const aqueduct = aqueductReady();
    expect(canEnterRegionExpedition(aqueduct, 'course')).toBe(true);
    expect(completeRegionExpedition(aqueduct, 'course')).toBe(aqueduct);
    const reported = completeRegionExpedition(aqueduct, 'palace');
    expect(completeRegionExpedition(reported, 'palace')).toBe(reported);
    const complete = finishRegionDialogue(finishRegionDialogue(reported, 'aqueduct_open'), 'town_return');
    expect(canEnterRegionExpedition(complete, 'course')).toBe(true);
    expect(canEnterRegionExpedition(complete, 'palace')).toBe(true);
    expect(completeRegionExpedition(complete, 'course')).toBe(complete);
    expect(finishRegionDialogue(complete, 'town_return')).toBe(complete);
  });

  it('records each whitelisted optional site once without altering chapter progress', () => {
    const initial = createRegionProgress();
    expect(discoverRegionSite(initial, 'unknown')).toBe(initial);
    const ridge = discoverRegionSite(initial, 'ridge');
    expect(discoverRegionSite(ridge, 'ridge')).toBe(ridge);
    const all = discoverRegionSite(discoverRegionSite(ridge, 'cove'), 'watch');
    expect(all.discoveries).toEqual(['ridge', 'cove', 'watch']);
    expect(all.chapter).toBe('arrival');
    expect(initial.discoveries).toEqual([]);
  });
});

describe('region progress persistence', () => {
  it('round-trips every reachable chapter including optional discoveries', () => {
    const states: RegionProgress[] = [discoverRegionSite(createRegionProgress(), 'cove')];
    states.push(finishRegionDialogue(states.at(-1)!, 'town_arrival'));
    states.push(finishRegionDialogue(states.at(-1)!, 'meadow_signal'));
    states.push(completeRegionExpedition(states.at(-1)!, 'course'));
    states.push(finishRegionDialogue(states.at(-1)!, 'ruin_relay'));
    states.push(completeRegionExpedition(states.at(-1)!, 'palace'));
    states.push(finishRegionDialogue(states.at(-1)!, 'aqueduct_open'));
    states.push(finishRegionDialogue(states.at(-1)!, 'town_return'));
    for (const state of states) expect(parseRegionProgress(JSON.stringify(state))).toEqual(state);
  });

  it.each([null, '', '{', 'null', '[]', 'true', '42', '"arrival"', '{}'])('safely resets absent or malformed save %s', raw => {
    expect(parseRegionProgress(raw)).toEqual(createRegionProgress());
  });

  it.each([
    { version: 2 }, { version: '1' }, { chapter: 'unknown' },
    { discoveries: null }, { discoveries: ['ridge', 'ridge'] }, { discoveries: ['elsewhere'] },
    { discoveries: [1] }, { completedExpeditions: 'course' },
    { completedExpeditions: ['course', 'course'] }, { completedExpeditions: ['tower'] },
    { chapter: 'arrival', completedExpeditions: ['course'] },
    { chapter: 'relay', completedExpeditions: ['course'] },
    { chapter: 'relay-report', completedExpeditions: [] },
    { chapter: 'aqueduct', completedExpeditions: ['palace'] },
    { chapter: 'aqueduct', completedExpeditions: ['course', 'palace'] },
    { chapter: 'aqueduct-report', completedExpeditions: ['course'] },
    { chapter: 'homecoming', completedExpeditions: [] },
    { chapter: 'complete', completedExpeditions: ['palace'] },
  ])('rejects unsupported or inconsistent save fields %j', fields => {
    expect(parseRegionProgress(JSON.stringify({ ...createRegionProgress(), ...fields }))).toEqual(createRegionProgress());
  });
});
