import formsJson from '../../content/forms.json';
import type { CourtForm } from './types';

export type * from './types';

export const courtForms = formsJson.forms as CourtForm[];

const byId = new Map(courtForms.map((form) => [form.id, form]));

/** The court form with this id. Throws for an unknown id, so a typo fails fast. */
export function courtForm(id: string): CourtForm {
  const form = byId.get(id);
  if (!form) throw new Error(`Unknown court form: ${id}`);
  return form;
}
