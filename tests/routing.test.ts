import { describe, expect, it } from 'vitest';
import routingJson from '../content/routing.json';
import { routeState, routing, validateRouting, type RouteAnswer, type Routing } from '../src/forms/routing';

const raw = routingJson as Routing;
const clone = (): Routing => JSON.parse(JSON.stringify(raw));

/** Follows option ids from the start and returns the outcome's packet. */
function packetFor(...optionIds: string[]): string[] {
  const answers: RouteAnswer[] = [];
  for (const option of optionIds) {
    const state = routeState(answers);
    if (!('node' in state)) throw new Error('reached an outcome too early');
    answers.push({ node: state.node, option });
  }
  const end = routeState(answers);
  if (!('outcome' in end)) throw new Error(`no outcome after ${optionIds.join(' > ')}`);
  return routing.outcomes[end.outcome].packet;
}

describe('routing.json', () => {
  it('is valid: every option leads somewhere real and every form exists', () => {
    expect(() => validateRouting(clone())).not.toThrow();
  });

  it('rejects broken content', () => {
    const badNext = clone();
    badNext.nodes.who.options[0].next = 'nowhere';
    expect(() => validateRouting(badNext)).toThrow(/unknown question/);

    const badForm = clone();
    badForm.outcomes['adult-new'].packet.push('PO-0120');
    expect(() => validateRouting(badForm)).toThrow(/unknown form/);

    const loop = clone();
    loop.nodes.meWhere.options[0] = { id: 'home', label: 'x', next: 'who' };
    expect(() => validateRouting(loop)).toThrow(/loop/);
  });

  // Packets from the PO-0102, PO-0103 and WV-0100 instructions.
  it.each([
    [['me', 'new', 'home'], ['PO-0100', 'PO-0104', 'PNW-0102', 'COVER']],
    [['me', 'new', 'work'], ['PO-0100', 'PO-0104', 'PNW-0102', 'COVER']],
    [['child', 'new', 'parent', 'school'], ['PO-0101', 'PO-0104', 'PNW-0102', 'COVER']],
    [['me', 'have-order', 'indiana', 'modify'], ['PO-0115']],
    [['me', 'have-order', 'indiana', 'extend'], ['PO-0116']],
    [['me', 'have-order', 'indiana', 'end'], ['PO-0108']],
    [['me', 'have-order', 'indiana', 'violated'], ['PO-0126', 'PO-0128']],
    [['me', 'have-order', 'indiana', 'hearing'], ['PO-0107']],
    [['me', 'have-order', 'outside', 'register'], ['PO-0119']],
    [['me', 'dismissed'], ['PO-0111']],
    [['me', 'no-contact'], []],
    [['employer', 'yes', 'threat', 'yes', 'no', 'new'], ['WV-0101', 'WV-0102', 'COVER', 'PO-0104', 'PNW-0102', 'WV-0104', 'WV-0105', 'WV-0103']],
    [['employer', 'yes', 'threat', 'yes', 'no', 'modify'], ['WV-0107', 'WV-0103']],
    [['employer', 'no'], []],
    [['employer', 'yes', 'threat', 'yes', 'yes'], []],
    [['respondent', 'po'], ['PO-0107']],
    [['respondent', 'wv'], ['WV-0104', 'WV-0105']],
  ])('%j leads to %j', (path, packet) => {
    expect(packetFor(...path)).toEqual(packet);
  });

  it('the adult and child petitions continue into the petition steps', () => {
    const petitions = Object.entries(routing.outcomes).filter(([, o]) => o.flow === 'petition').map(([id, o]) => [id, o.variant]);
    expect(petitions).toEqual([['adult-new', 'adult'], ['child-new', 'child']]);
  });
});
