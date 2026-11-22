// The court's official forms, as listed on the Indiana Office of Judicial
// Administration's protection order forms page. The list itself lives in
// content/forms.json so the team can update it when the court revises a form.

export type FormSection = 'cover' | 'service' | 'po' | 'wv';

// Who fills the form out. "court" and "clerk" forms are never filled by the
// public; "reference" forms are instructions with nothing to fill.
export type FormFiller =
  | 'petitioner'
  | 'next-friend'
  | 'employer'
  | 'respondent'
  | 'defendant'
  | 'server'
  | 'court'
  | 'clerk'
  | 'reference';

export type FormStage = 'initial' | 'post-order' | 'response' | 'reference';

// What the app makes from it: a fully filled form, only the case heading
// (for a form the court or a server finishes), or nothing.
export type FormGenerate = 'fill' | 'captionOnly' | 'none';

export interface CourtForm {
  id: string;
  // The court's form number. The cover sheet has none.
  number: string | null;
  section: FormSection;
  // The court's title, exactly as on its page.
  title: string;
  // What ReadyFile calls it on screen, in plain words.
  plainTitle: string;
  // YYYY-MM-DD, as the page lists them. A form never revised has null.
  created: string;
  revised: string | null;
  // For citation only. The app never links to or downloads these.
  wordUrl: string | null;
  pdfUrl: string;
  filler: FormFiller;
  stage: FormStage;
  generate: FormGenerate;
  pages: number;
}
