// Voice control: finding what she can press on the page, by the words she
// sees, and pressing it. Plain DOM, no React. All words are fictional.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  actOn,
  controlsOnScreen,
  findControls,
  pickLikeliest,
  scrollIntoClearView,
  visibleText,
  type PageControl,
} from '../src/voice/pageControls';
import { findQuestions, questionFrom } from '../src/voice/formQuestions';

function page(html: string) {
  document.body.innerHTML = html;
}

const names = (controls: PageControl[]) => controls.map((control) => control.names[0]);
const byName = (name: string) => {
  const control = findControls().find((c) => c.names.includes(name));
  if (!control) throw new Error(`No control named "${name}"`);
  return control;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the words she sees', () => {
  it('leaves out screen-reader-only text and icons', () => {
    page('<button id="b"><svg><title>mic</title></svg>Next <span class="sr-only">step 4</span></button>');
    expect(visibleText(document.getElementById('b')!)).toBe('Next');
  });
});

describe('finding what she can press', () => {
  it('names each control by its visible words, label, or screen reader name', () => {
    page(`
      <header><button aria-label="Step 1: Start">Start</button></header>
      <label class="choice"><input type="radio" name="t"> Stalking</label>
      <label class="choice"><input type="checkbox"> Hurt me</label>
      <label for="box">What happened</label><textarea id="box"></textarea>
      <label for="list">How did it happen?</label><select id="list"><option>In person</option></select>
      <button>Done</button>
      <span id="tip">Dark mode</span><button role="switch" aria-labelledby="tip"></button>
    `);
    expect(findControls().map((c) => [c.kind, c.names])).toEqual([
      ['button', ['Start', 'Step 1: Start']],
      ['radio', ['Stalking']],
      ['checkbox', ['Hurt me']],
      ['textbox', ['What happened']],
      ['select', ['How did it happen?']],
      ['button', ['Done']],
      ['checkbox', ['Dark mode']],
    ]);
  });

  it("leaves out what can't be pressed now, and each box's own microphone", () => {
    page(`
      <button disabled>Disabled</button>
      <div hidden><button>Hidden</button></div>
      <div aria-hidden="true"><button>Behind</button></div>
      <div inert><button>Inert</button></div>
      <input type="hidden" value="x">
      <div class="voice-field-box"><textarea aria-label="Your story"></textarea><button class="voice-field-mic" aria-label="Speak"></button></div>
      <button></button>
      <button>Shown</button>
    `);
    expect(names(findControls())).toEqual(['Your story', 'Shown']);
  });

  it("adds a list's choices only while she is in that list", () => {
    page(`
      <label for="list">How did it happen?</label>
      <select id="list"><option value="">Choose one</option><option value="online">Online</option><option disabled>Gone</option></select>
    `);
    expect(names(findControls())).toEqual(['How did it happen?']);
    document.getElementById('list')!.focus();
    expect(findControls().map((c) => [c.kind, c.names[0]])).toEqual([
      ['select', 'How did it happen?'],
      ['option', 'Choose one'],
      ['option', 'Online'],
    ]);
  });

  it('while a dialog is open, finds only the dialog and the header', () => {
    page(`
      <header><button>Quick exit</button></header>
      <main inert><button>Start</button></main>
      <div role="alertdialog" aria-modal="true"><button>Stay here</button></div>
    `);
    expect(names(findControls())).toEqual(['Stay here', 'Quick exit']);
  });

  it('marks Quick exit as pressed only by its whole name', () => {
    page('<header><button data-voice-exact>Quick exit</button></header><button>Next</button>');
    expect(findControls().map((c) => c.exactOnly)).toEqual([true, false]);
  });

  it('numbers only what is on the screen, not the choices inside a list', () => {
    page('<label for="l">When</label><select id="l"><option>Today</option></select><button>Next</button>');
    document.getElementById('l')!.focus();
    expect(names(controlsOnScreen(findControls()))).toEqual(['When', 'Next']);
  });
});

describe('when several have the same name', () => {
  it('picks the one in the page over the step bar', () => {
    page('<nav><button>Start</button></nav><main><button id="page">Start</button></main>');
    expect(pickLikeliest(findControls())?.element.id).toBe('page');
  });

  it('picks the one nearest to where she is', () => {
    page(`
      <section><button id="one">Delete</button><input id="here-one"></section>
      <section><button id="two">Delete</button><input id="here-two"></section>
    `);
    const deletes = findControls().filter((c) => c.names[0] === 'Delete');
    document.getElementById('here-two')!.focus();
    expect(pickLikeliest(deletes)?.element.id).toBe('two');
  });

  it('gives up when they are equally likely', () => {
    page('<button>Delete</button><button>Delete</button>');
    expect(pickLikeliest(findControls())).toBeNull();
  });
});

describe('doing what she asked', () => {
  it('presses a button, and moves focus to it', () => {
    page('<button>Done</button>');
    const onClick = vi.fn();
    document.querySelector('button')!.addEventListener('click', onClick);
    expect(actOn(byName('Done'), 'press')).toEqual({ kind: 'pressed', name: 'Done' });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.querySelector('button'));
  });

  it('checks, unchecks, and leaves a box alone when it is already how she asked', () => {
    page('<label><input type="checkbox"> Hurt me</label>');
    const box = document.querySelector('input')!;
    expect(actOn(byName('Hurt me'), 'check')).toEqual({ kind: 'checked', name: 'Hurt me' });
    expect(box.checked).toBe(true);
    expect(actOn(byName('Hurt me'), 'check')).toEqual({ kind: 'alreadyChecked', name: 'Hurt me' });
    expect(box.checked).toBe(true);
    expect(actOn(byName('Hurt me'), 'press')).toEqual({ kind: 'unchecked', name: 'Hurt me' });
    expect(actOn(byName('Hurt me'), 'uncheck')).toEqual({ kind: 'alreadyUnchecked', name: 'Hurt me' });
    expect(box.checked).toBe(false);
  });

  it('chooses a radio button', () => {
    page('<label><input type="radio" name="t"> Stalking</label>');
    expect(actOn(byName('Stalking'), 'press')).toEqual({ kind: 'chosen', name: 'Stalking' });
    expect(document.querySelector('input')!.checked).toBe(true);
  });

  it('moves to a list and gives its choices, leaving out "Choose one"', () => {
    page('<label for="l">How</label><select id="l"><option value="">Choose one</option><option value="a">In person</option><option value="b">Online</option></select>');
    expect(actOn(byName('How'), 'press')).toEqual({ kind: 'choose', name: 'How', options: ['In person', 'Online'] });
    expect(document.activeElement?.id).toBe('l');
  });

  it("picks a list's choice the way the mouse would, so the app hears it", () => {
    page('<label for="l">How</label><select id="l"><option value="a">In person</option><option value="b">Online</option></select>');
    const list = document.querySelector('select')!;
    const onChange = vi.fn();
    list.addEventListener('change', onChange);
    list.focus();
    expect(actOn(byName('Online'), 'press')).toEqual({ kind: 'chosen', name: 'Online' });
    expect(list.value).toBe('b');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("starts a box's own microphone, or just moves to a box without one", () => {
    page(`
      <div class="voice-field-box"><label for="a">What happened</label><textarea id="a"></textarea><button class="voice-field-mic"></button></div>
      <label for="b">Notes</label><textarea id="b"></textarea>
    `);
    const onMicrophone = vi.fn();
    document.querySelector('.voice-field-mic')!.addEventListener('click', onMicrophone);
    expect(actOn(byName('What happened'), 'press')).toEqual({ kind: 'dictating', name: 'What happened' });
    expect(onMicrophone).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe('a');
    expect(actOn(byName('Notes'), 'press')).toEqual({ kind: 'focused', name: 'Notes' });
    expect(document.activeElement?.id).toBe('b');
  });

  it("only moves to a box whose microphone is busy", () => {
    page('<div class="voice-field-box"><label for="a">Story</label><textarea id="a"></textarea><button class="voice-field-mic" disabled></button></div>');
    expect(actOn(byName('Story'), 'press')).toEqual({ kind: 'focused', name: 'Story' });
  });
});

describe('the questions on a step, in order (guided mode)', () => {
  const kinds = () => findQuestions().map((q) => [q.kind, q.prompt]);

  it('finds each kind of question, in the order it appears', () => {
    page(`<main>
      <fieldset aria-describedby="h"><legend>What kind of order?</legend><p id="h">Pick one.</p>
        <label><input type="radio" name="t"> Stalking</label><label><input type="radio" name="t" checked> Not sure</label></fieldset>
      <label for="rel">How do you know this person?</label>
      <select id="rel"><option value="">Choose one</option><option value="a">Married</option><option value="b">Dating</option></select>
      <label for="d">Date</label><input id="d" type="date">
      <label for="story">Your story</label><textarea id="story"></textarea>
      <fieldset><legend>What did the person do?</legend><label><input type="checkbox"> Hurt me</label></fieldset>
      <button data-voice-ask="Ready to start?">Start</button>
    </main>`);
    expect(kinds()).toEqual([
      ['choice', 'What kind of order?'],
      ['choice', 'How do you know this person?'],
      ['date', 'Date'],
      ['text', 'Your story'],
      ['checks', 'What did the person do?'],
      ['ask', 'Ready to start?'],
    ]);
    const [order, list] = findQuestions();
    expect(order.hint).toBe('Pick one.');
    expect(order.choices.map((c) => [c.name, c.checked])).toEqual([
      ['Stalking', false],
      ['Not sure', true],
    ]);
    // Not the empty "Choose one".
    expect(list.choices.map((c) => c.name)).toEqual(['Married', 'Dating']);
  });

  it('leaves out the step bar, demo-only parts, voice control itself, hidden parts, and plain buttons', () => {
    page(`<main>
      <nav><label for="n">Search</label><input id="n"></nav>
      <div class="dev-only"><label for="x">Demo</label><input id="x"></div>
      <section data-voice-no-questions><label for="y">Offer</label><input id="y"></section>
      <div hidden><label for="z">Hidden</label><input id="z"></div>
      <button>Delete</button>
      <label for="real">Where did it happen?</label><input id="real">
    </main>`);
    expect(kinds()).toEqual([['text', 'Where did it happen?']]);
  });

  it('reads a group of buttons as one question, and a closed card as one to open', () => {
    page(`<main>
      <li data-voice-ask><button data-voice-open aria-expanded="false">Incident 1 · Date missing</button></li>
      <li data-voice-ask><button data-voice-open aria-expanded="true">Incident 2</button>
        <p data-voice-prompt>Do you know the date? <span class="badge-dev">Unverified</span></p>
        <button>Add more</button><button>Continue as is</button></li>
    </main>`);
    const [closed, open] = findQuestions();
    expect(closed.opener?.textContent).toBe('Incident 1 · Date missing');
    expect(closed.choices).toEqual([]);
    expect(open.prompt).toBe('Do you know the date?');
    expect(open.choices.map((c) => c.name)).toEqual(['Add more', 'Continue as is']);
  });

  it('knows where a spoken date goes for "When did it happen?"', () => {
    page(`<main><label for="w">When did it happen?</label>
      <select id="w" data-voice-when-exact="d" data-voice-when-approx="a"><option value="exact">I know the date</option></select></main>`);
    expect(findQuestions()[0].when).toEqual({ exact: 'd', approx: 'a' });
  });

  it('starts where she is, or at the next question after it', () => {
    page(`<main><h1 tabindex="-1">Step</h1>
      <label for="a">First</label><input id="a"><p id="between" tabindex="-1">Note</p>
      <label for="b">Second</label><input id="b"></main>`);
    const questions = findQuestions();
    expect(questionFrom(questions, document.getElementById('b'))?.prompt).toBe('Second');
    expect(questionFrom(questions, document.getElementById('between'))?.prompt).toBe('Second');
    expect(questionFrom(questions, document.querySelector('h1'))?.prompt).toBe('First');
    expect(questionFrom(questions, null)?.prompt).toBe('First');
  });
});

describe('keeping what she is on in view', () => {
  const box = (top: number, bottom: number) =>
    ({ top, bottom, height: bottom - top, width: 100, left: 0, right: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  it('scrolls it between the header and the bar, even when the bar is taller than half the screen', () => {
    page(`<header data-voice-cover></header><main><select id="s"><option>x</option></select></main>
      <section data-voice-cover id="bar"></section>`);
    const innerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    document.querySelector('header')!.getBoundingClientRect = () => box(0, 100);
    // A phone: the bar starts above the middle of the screen.
    document.getElementById('bar')!.getBoundingClientRect = () => box(400, 840);
    document.getElementById('s')!.getBoundingClientRect = () => box(618, 666);
    const scrollBy = vi.fn();
    window.scrollBy = scrollBy;

    scrollIntoClearView(document.getElementById('s')!);
    // To the middle of 100–400: its top at 226.
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: 618 - 226 }));
    Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true });
  });
});
