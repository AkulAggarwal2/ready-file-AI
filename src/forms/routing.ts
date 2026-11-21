import routingJson from '../../content/routing.json';
import { courtForm } from './index';

// The questions that pick which court forms fit (content/routing.json). Each
// option leads to another question or to an outcome, so the team can change
// the questions without code.

export interface RouteOption {
  id: string;
  label: string;
  // Exactly one of these is set.
  next?: string;
  outcome?: string;
  // Shown after she picks this option.
  note?: string;
}

export interface RouteNode {
  question: string;
  hint?: string;
  options: RouteOption[];
}

// "petition" continues into ReadyFile's petition steps. "forms" lists the
// forms that fit. "info" explains the situation; any forms it lists are ones
// the court fills, shown so she knows what the papers are.
export type OutcomeFlow = 'petition' | 'forms' | 'info';

export interface RouteOutcome {
  flow: OutcomeFlow;
  variant?: 'adult' | 'child';
  title: string;
  summary: string;
  // Court form ids, in filing order.
  packet: string[];
}

export interface Routing {
  start: string;
  nodes: Record<string, RouteNode>;
  outcomes: Record<string, RouteOutcome>;
}

/** Throws if an option points nowhere, a packet names an unknown form, or a question can't be reached. */
export function validateRouting(raw: Routing): Routing {
  const fail = (message: string) => {
    throw new Error(`routing.json: ${message}`);
  };
  if (!raw.nodes[raw.start]) fail(`start "${raw.start}" is not a question.`);

  for (const [id, node] of Object.entries(raw.nodes)) {
    if (node.options.length < 2) fail(`question "${id}" needs at least 2 options.`);
    const optionIds = new Set<string>();
    for (const option of node.options) {
      if (optionIds.has(option.id)) fail(`question "${id}" has option "${option.id}" twice.`);
      optionIds.add(option.id);
      if (Boolean(option.next) === Boolean(option.outcome)) {
        fail(`option "${id}.${option.id}" needs exactly one of next or outcome.`);
      }
      if (option.next && !raw.nodes[option.next]) fail(`option "${id}.${option.id}" goes to unknown question "${option.next}".`);
      if (option.outcome && !raw.outcomes[option.outcome]) {
        fail(`option "${id}.${option.id}" goes to unknown outcome "${option.outcome}".`);
      }
    }
  }

  for (const [id, outcome] of Object.entries(raw.outcomes)) {
    for (const formId of outcome.packet) {
      try {
        courtForm(formId);
      } catch {
        fail(`outcome "${id}" lists unknown form "${formId}".`);
      }
    }
    if (outcome.flow === 'petition' && !outcome.variant) fail(`petition outcome "${id}" needs a variant.`);
  }

  // Every question and outcome can be reached from the start, and no path loops.
  const reached = new Set<string>();
  const walk = (nodeId: string, path: string[]) => {
    if (path.includes(nodeId)) fail(`questions loop: ${[...path, nodeId].join(' > ')}.`);
    reached.add(nodeId);
    for (const option of raw.nodes[nodeId].options) {
      if (option.next) walk(option.next, [...path, nodeId]);
      else reached.add(`outcome:${option.outcome}`);
    }
  };
  walk(raw.start, []);
  for (const id of Object.keys(raw.nodes)) if (!reached.has(id)) fail(`question "${id}" can't be reached.`);
  for (const id of Object.keys(raw.outcomes)) if (!reached.has(`outcome:${id}`)) fail(`outcome "${id}" can't be reached.`);

  return raw;
}

export const routing = validateRouting(routingJson as Routing);

/** A step she took: the question and the option she picked. */
export interface RouteAnswer {
  node: string;
  option: string;
}

/** The option she picked for one answer. */
export function pickedOption(answer: RouteAnswer): RouteOption {
  const option = routing.nodes[answer.node]?.options.find((o) => o.id === answer.option);
  if (!option) throw new Error(`Unknown route answer: ${answer.node}.${answer.option}`);
  return option;
}

/** Where her answers lead: the next question to ask, or the outcome. */
export function routeState(answers: RouteAnswer[]): { node: string } | { outcome: string } {
  if (answers.length === 0) return { node: routing.start };
  const last = pickedOption(answers[answers.length - 1]);
  return last.outcome ? { outcome: last.outcome } : { node: last.next! };
}
