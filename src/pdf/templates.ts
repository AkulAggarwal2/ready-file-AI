// The court's PDFs, bundled into the app as data so building the forms never
// makes a network request (the Content Security Policy blocks them anyway).
// Each one loads only when a packet that needs it is built.
const templates = import.meta.glob<string>('./templates/*.pdf', { query: '?inline', import: 'default' });

/** Decodes a data: URL without fetch, which the Content Security Policy blocks. */
function bytesOf(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The court's blank PDF for a form. */
export async function loadTemplate(form: string): Promise<Uint8Array> {
  const load = templates[`./templates/${form}.pdf`];
  if (!load) throw new Error(`No PDF template for ${form}`);
  return bytesOf(await load());
}
