import type { Variant } from '../content';

// The forms in each packet ReadyFile fills, in filing order, with how many
// copies to bring. Kept apart from the PDF code, so screens can list them
// without loading it.

export interface PacketForm {
  form: string;
  copies: number;
  // Confidential forms go in their own PDF. The petition is public and one
  // copy is served on the other person, so a confidential page must never
  // be printed with it.
  confidential?: boolean;
}

// PO-0102 and PO-0103: 4 petitions, 1 Confidential Form, and 3 Notices of Exclusion.
export const PACKET_FORMS: Record<Variant, PacketForm[]> = {
  adult: [
    { form: 'PO-0100', copies: 4 },
    { form: 'PNW-0102', copies: 3 },
    { form: 'PO-0104', copies: 1, confidential: true },
  ],
  child: [
    { form: 'PO-0101', copies: 4 },
    { form: 'PNW-0102', copies: 3 },
    { form: 'PO-0104', copies: 1, confidential: true },
  ],
};
