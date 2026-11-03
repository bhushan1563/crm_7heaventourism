import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { unzipSync, strFromU8 } from 'fflate';
import { generateVisaQuotationDocx } from './quotationDocx';
import { formatDate } from './dateHelper';
import { shareFileName } from './shareContact';

const read = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
const open = async (blob) => {
  const files = unzipSync(await read(blob));
  const xml = strFromU8(files['word/document.xml']);
  const plain = xml.replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
  return { files, xml, plain, names: Object.keys(files) };
};
const wellFormed = (xml) => !new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror');

const quotation = (over = {}) => ({
  quotationNo: '7H-QT-0042',
  quotationType: 'Visa',
  clientName: 'Meera Iyer',
  paxDetails: '2 Adults + 1 Child',
  travelDate: '2027-03-15',
  validUntil: '2027-01-31',
  duration: '7 Nights / 8 Days',
  destination: 'JAPAN TOURIST VISA',
  createdAt: '2026-11-03T10:00:00.000Z',
  visa: { country: 'Japan', visaType: 'Tourist', entryType: 'Single entry', mode: 'e-Visa', validity: '90 days', stay: '15 days', processingTime: '5 working days', applicants: 3, priceNote: '<p>Embassy fees <strong>may change</strong></p>' },
  visaFees: [{ label: 'Visa fee', amount: 6500, per: 'applicant' }, { label: 'Courier', amount: 800, per: 'group' }],
  visaDocuments: ['Passport valid for 6 months', '<p><strong>Passport-size photographs</strong> on <span style="color:#dc2626">white background</span></p>'],
  visaInclusions: ['Form filling'],
  importantNotes: ['Fees are not refundable'],
  paymentPolicy: ['100% advance'],
  cancellationPolicy: ['No refund after submission'],
  exclusions: ['Travel insurance'],
  ...over
});

describe('the Word file of a visa quotation', () => {
  it('is a real Word file (a zip with the Word parts) named like the PDF', async () => {
    const { blob, filename } = await generateVisaQuotationDocx(quotation());
    const { names } = await open(blob);
    expect(names).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml']));
    expect(filename).toBe(shareFileName(quotation(), 'docx'));
    expect(filename.endsWith('.docx')).toBe(true);
  });

  it('says who it is for and when, the visa, the documents, the fees with their total, what is included, and the terms', async () => {
    const { plain } = await open((await generateVisaQuotationDocx(quotation())).blob);
    for (const text of [
      'VISA QUOTATION', 'JAPAN TOURIST VISA', 'Ref: 7H-QT-0042',
      'Client', 'Meera Iyer', 'Travellers', '2 Adults + 1 Child', 'Travel date', formatDate('2027-03-15'), 'Duration', '7 Nights / 8 Days', 'Quotation valid until', formatDate('2027-01-31'),
      'Country', 'Japan', 'Single entry', 'e-Visa', '5 working days', '90 days', '15 days', 'Applicants',
      'Documents required', 'Passport valid for 6 months', 'Passport-size photographs', 'white background',
      'Visa fee', 'Per applicant × 3', 'Rs 19,500', 'Whole group', 'Rs 800', 'Total for 3 applicants', 'Rs 20,300',
      'Note:', 'Embassy fees', 'may change', 'Visa inclusions', 'Form filling',
      'Terms', 'Fees are not refundable', 'Payment policy', '100% advance', 'Cancellation policy', 'No refund after submission', 'Exclusions', 'Travel insurance'
    ]) expect(plain, text).toContain(text);
    expect(formatDate('2027-03-15')).not.toBe('');
  });

  it('keeps the formatting as real Word formatting, so it can be edited in Word', async () => {
    const { xml } = await open((await generateVisaQuotationDocx(quotation())).blob);
    expect(xml).toMatch(/<w:b\/>[^]*?Passport-size photographs/); // bold
    expect(xml).toMatch(/<w:color w:val="DC2626"\/>[^]*?white background/); // colour
    expect((xml.match(/<w:tbl>/g) || []).length).toBe(3); // trip details, visa details, fees
    expect(xml).toMatch(/<w:numPr>/); // bullet lists
    expect(xml).toMatch(/<w:tblHeader\/>/); // the fee table's header repeats on a new page
    expect(xml).toMatch(/w:gridSpan w:val="3"/); // the total row
  });

  it('leaves out what is empty: no trip box without trip details, no fee table without fees', async () => {
    const { plain } = await open((await generateVisaQuotationDocx(quotation({ clientName: '', paxDetails: '', travelDate: '', validUntil: '', duration: '', visaFees: [], visaDocuments: [], visaInclusions: [], importantNotes: [], paymentPolicy: [], cancellationPolicy: [], exclusions: [] }))).blob);
    for (const gone of ['Applicant & trip details', 'Documents required', 'Fees', 'Visa inclusions', 'Terms', 'Payment policy', 'Cancellation policy', 'Exclusions']) expect(plain, gone).not.toContain(gone);
    expect(plain).toContain('Visa details');
  });

  it('says "On request" when the fees add up to nothing', async () => {
    const { plain } = await open((await generateVisaQuotationDocx(quotation({ visaFees: [{ label: 'Visa fee', amount: '', per: 'applicant' }] }))).blob);
    expect(plain).toContain('On request');
  });

  it('prints plain lines exactly as typed, including characters that are special in markup', async () => {
    const { plain, xml } = await open((await generateVisaQuotationDocx(quotation({ clientName: 'A & B <Travels> "Ltd"', visaDocuments: ['Salary slips <last 3 months> & ITR'] }))).blob);
    expect(plain).toContain('A & B <Travels> "Ltd"');
    expect(plain).toContain('Salary slips <last 3 months> & ITR');
    expect(wellFormed(xml)).toBe(true);
  });

  it('never carries script or markup that was typed in a field into the file as markup', async () => {
    const { xml } = await open((await generateVisaQuotationDocx(quotation({ clientName: '<script>alert(1)</script>', visaDocuments: ['<p onclick="x()">Passport</p><script>steal()</script><img src=x onerror=alert(1)>'] }))).blob);
    expect(xml).not.toMatch(/<script|<img|onclick|onerror/i);
    expect(wellFormed(xml)).toBe(true);
  });

  it('uses the company details of the quotation when it has its own, and the default otherwise', async () => {
    const own = await open((await generateVisaQuotationDocx(quotation({ companyDetails: { name: 'ACME TOURS', tagline: 'We go', address: '1 Road', phone: '123', email: 'a@b.co', website: 'acme.example' } }))).blob);
    expect(own.plain).toContain('ACME TOURS');
    const dflt = await open((await generateVisaQuotationDocx(quotation())).blob);
    expect(dflt.plain).toContain('7HEAVEN TOURISM');
  });

  it('property: whatever is typed, the file is made and its XML is well formed (even with control characters pasted in)', async () => {
    // fast-check's default strings are printable only, so the awkward characters are listed on purpose.
    const awkward = fc.string({ unit: fc.constantFrom('a', 'Z', ' ', '&', '<', '>', '"', "'", '\u0000', '\u0001', '\u0008', '\u000B', '\u000C', '\u001F', '￾', '￿', '\n', '\t', '₹', '😀'), maxLength: 40 });
    await fc.assert(
      fc.asyncProperty(awkward, awkward, fc.array(awkward, { maxLength: 4 }), async (name, dest, docs) => {
        const { blob } = await generateVisaQuotationDocx(quotation({ clientName: name, destination: dest, visaDocuments: docs, importantNotes: docs }));
        const { xml, files } = await open(blob);
        expect(wellFormed(xml)).toBe(true);
        expect(wellFormed(strFromU8(files['word/footer1.xml'] || files[Object.keys(files).find((n) => n.startsWith('word/footer'))]))).toBe(true);
      }),
      { numRuns: 40 }
    );
  }, 60000);
});
