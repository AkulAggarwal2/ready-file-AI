// Voice control: finding what she can press on the page, by the words she
// sees, and pressing it. Plain DOM, no React. All words are fictional.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  actOn,
  controlsOnScreen,
  findControls,
  pickLikeliest,
  visibleText,
  type PageControl,
} from '../src/voice/pageControls';

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
