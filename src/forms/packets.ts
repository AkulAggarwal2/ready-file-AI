// The forms in each packet ReadyFile fills, in filing order, with how many
// copies to bring. Kept apart from the PDF code, so screens can list them
// without loading it.

export interface PacketForm {
  form: string;
  copies: number;
}

// PO-0102: 4 petitions, 1 Confidential Form, and 3 Notices of Exclusion.
export const ADULT_PACKET_FORMS: PacketForm[] = [
  { form: 'PO-0100', copies: 4 },
  { form: 'PO-0104', copies: 1 },
  { form: 'PNW-0102', copies: 3 },
];
