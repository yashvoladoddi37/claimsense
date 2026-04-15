/**
 * Generate sample medical documents (PDFs) for testing the OCR + AI pipeline.
 * Run: npx tsx scripts/generate-test-docs.ts
 * Output: scripts/test-docs/*.pdf
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.join(__dirname, 'test-docs');
fs.mkdirSync(OUT_DIR, { recursive: true });

function savePDF(name: string, draw: (doc: InstanceType<typeof PDFDocument>) => void) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const outPath = path.join(OUT_DIR, `${name}.pdf`);
  doc.pipe(fs.createWriteStream(outPath));
  draw(doc);
  doc.end();
  console.log(`✅ ${outPath}`);
}

// ---- 1. Standard consultation + pharmacy bill (should APPROVE) ----
savePDF('01_consultation_viral_fever', (doc) => {
  doc.fontSize(16).font('Helvetica-Bold').text('Apollo Clinic', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('MG Road, Bangalore - 560001', { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('Dr. Ramesh Sharma, MBBS, MD');
  doc.fontSize(10).font('Helvetica').text('Reg. No: KA/45678/2015');
  doc.text('General Medicine');
  doc.moveDown();

  doc.text(`Date: 15/03/2025`);
  doc.moveDown();
  doc.text('Patient Name: Rajesh Kumar');
  doc.text('Age/Sex: 32/M');
  doc.text('Employee ID: EMP001');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Diagnosis: Viral Fever with Body Ache');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Rx:');
  doc.font('Helvetica');
  doc.text('1. Tab. Paracetamol 650mg — 1 tab TID x 5 days');
  doc.text('2. Tab. Cetirizine 10mg — 1 tab OD x 5 days');
  doc.text('3. ORS Sachets — 2 sachets/day x 3 days');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Investigations Advised:');
  doc.font('Helvetica');
  doc.text('1. Complete Blood Count (CBC)');
  doc.text('2. Dengue NS1 Antigen Test');
  doc.moveDown(2);

  // Bill section
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
  doc.fontSize(14).font('Helvetica-Bold').text('BILL', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).font('Helvetica');

  const items = [
    ['Consultation Fee', '₹ 800'],
    ['CBC Test', '₹ 450'],
    ['Dengue NS1 Test', '₹ 600'],
    ['Tab. Paracetamol 650mg x 15', '₹ 75'],
    ['Tab. Cetirizine 10mg x 5', '₹ 30'],
    ['ORS Sachets x 6', '₹ 90'],
  ];

  for (const [item, amount] of items) {
    doc.text(item, 50, doc.y, { width: 350 });
    doc.text(amount, 400, doc.y - 12, { width: 145, align: 'right' });
    doc.moveDown(0.3);
  }

  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
  doc.font('Helvetica-Bold').text('Total: ₹ 2,045', { align: 'right' });
  doc.moveDown();
  doc.font('Helvetica').text('Payment Mode: UPI');
});

// ---- 2. Dental bill with cosmetic item (should PARTIAL APPROVE) ----
savePDF('02_dental_with_cosmetic', (doc) => {
  doc.fontSize(16).font('Helvetica-Bold').text('Smile Dental Care', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('Koramangala, Bangalore - 560034', { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('Dr. Ananya Patel, BDS, MDS');
  doc.fontSize(10).font('Helvetica').text('Reg. No: KA/67890/2018');
  doc.moveDown();

  doc.text('Date: 20/03/2025');
  doc.text('Patient Name: Priya Singh');
  doc.text('Employee ID: EMP002');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Diagnosis: Dental caries (Tooth #36), Patient also requested cosmetic whitening');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Procedures Performed:');
  doc.font('Helvetica');
  doc.text('1. Root Canal Treatment — Tooth #36');
  doc.text('2. Ceramic Crown — Tooth #36');
  doc.text('3. Professional Teeth Whitening (cosmetic)');
  doc.moveDown(2);

  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
  doc.fontSize(14).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).font('Helvetica');

  const items = [
    ['Root Canal Treatment', '₹ 8,000'],
    ['Ceramic Crown', '₹ 5,000'],
    ['Teeth Whitening (Cosmetic)', '₹ 4,000'],
    ['X-Ray (IOPA)', '₹ 300'],
  ];

  for (const [item, amount] of items) {
    doc.text(item, 50, doc.y, { width: 350 });
    doc.text(amount, 400, doc.y - 12, { width: 145, align: 'right' });
    doc.moveDown(0.3);
  }

  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
  doc.font('Helvetica-Bold').text('Total: ₹ 17,300', { align: 'right' });
});

// ---- 3. Expensive diagnostic-heavy claim (should APPROVE with limits) ----
savePDF('03_diabetes_checkup', (doc) => {
  doc.fontSize(16).font('Helvetica-Bold').text('Manipal Hospital', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('Old Airport Road, Bangalore - 560017', { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('Dr. Sunil Mehta, MBBS, MD (Endocrinology)');
  doc.fontSize(10).font('Helvetica').text('Reg. No: KA/23456/2012');
  doc.moveDown();

  doc.text('Date: 25/03/2025');
  doc.text('Patient Name: Amit Verma');
  doc.text('Employee ID: EMP003');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Diagnosis: Type 2 Diabetes Mellitus — Routine Follow-up');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Rx:');
  doc.font('Helvetica');
  doc.text('1. Tab. Metformin 500mg — 1 tab BD');
  doc.text('2. Tab. Glimepiride 1mg — 1 tab OD (before breakfast)');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Investigations:');
  doc.font('Helvetica');
  doc.text('1. HbA1c');
  doc.text('2. Fasting Blood Sugar');
  doc.text('3. Post-Prandial Blood Sugar');
  doc.text('4. Lipid Profile');
  doc.text('5. Kidney Function Test (KFT)');
  doc.text('6. Urine Microalbumin');
  doc.moveDown(2);

  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
  doc.fontSize(14).font('Helvetica-Bold').text('BILL', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).font('Helvetica');

  const items = [
    ['Consultation Fee (Specialist)', '₹ 1,200'],
    ['HbA1c', '₹ 550'],
    ['Fasting Blood Sugar', '₹ 150'],
    ['Post-Prandial Blood Sugar', '₹ 150'],
    ['Lipid Profile', '₹ 600'],
    ['KFT (Creatinine, BUN, Uric Acid)', '₹ 500'],
    ['Urine Microalbumin', '₹ 400'],
    ['Tab. Metformin 500mg x 60', '₹ 120'],
    ['Tab. Glimepiride 1mg x 30', '₹ 85'],
  ];

  for (const [item, amount] of items) {
    doc.text(item, 50, doc.y, { width: 350 });
    doc.text(amount, 400, doc.y - 12, { width: 145, align: 'right' });
    doc.moveDown(0.3);
  }

  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
  doc.font('Helvetica-Bold').text('Total: ₹ 3,755', { align: 'right' });
});

// ---- 4. Weight loss / excluded treatment (should REJECT) ----
savePDF('04_weight_loss_excluded', (doc) => {
  doc.fontSize(16).font('Helvetica-Bold').text('FitLife Wellness Center', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('Indiranagar, Bangalore - 560038', { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('Dr. Kavitha Rao, MBBS, Diploma in Nutrition');
  doc.fontSize(10).font('Helvetica').text('Reg. No: KA/78901/2020');
  doc.moveDown();

  doc.text('Date: 28/03/2025');
  doc.text('Patient Name: Sneha Reddy');
  doc.text('Employee ID: EMP004');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Diagnosis: Obesity (BMI 33.5) — Weight Management Program');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Treatment Plan:');
  doc.font('Helvetica');
  doc.text('1. Bariatric consultation and assessment');
  doc.text('2. Customized diet plan (12 weeks)');
  doc.text('3. Body composition analysis');
  doc.text('4. Nutritional supplements — Protein powder, Multivitamins');
  doc.moveDown(2);

  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
  doc.fontSize(14).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).font('Helvetica');

  const items = [
    ['Bariatric Consultation', '₹ 2,000'],
    ['Diet Plan (12-week program)', '₹ 5,000'],
    ['Body Composition Analysis (InBody)', '₹ 1,500'],
    ['Protein Powder (Whey, 1kg)', '₹ 2,500'],
    ['Multivitamin Pack (3 months)', '₹ 1,800'],
  ];

  for (const [item, amount] of items) {
    doc.text(item, 50, doc.y, { width: 350 });
    doc.text(amount, 400, doc.y - 12, { width: 145, align: 'right' });
    doc.moveDown(0.3);
  }

  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
  doc.font('Helvetica-Bold').text('Total: ₹ 12,800', { align: 'right' });
});

// ---- 5. Pharmacy-only bill with branded drugs (copay test) ----
savePDF('05_pharmacy_branded_drugs', (doc) => {
  doc.fontSize(16).font('Helvetica-Bold').text('MedPlus Pharmacy', { align: 'center' });
  doc.fontSize(10).font('Helvetica').text('HSR Layout, Bangalore - 560102', { align: 'center' });
  doc.text('Drug License No: KA/BLR/20B/2019/12345', { align: 'center' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();

  doc.text('Bill No: PH-2025-4521          Date: 22/03/2025');
  doc.text('Patient: Vikram Joshi (EMP005)');
  doc.text('Prescribed by: Dr. Ramesh Sharma (KA/45678/2015)');
  doc.text('Diagnosis: Hypertension');
  doc.moveDown();

  // Table header
  doc.font('Helvetica-Bold');
  doc.text('Medicine', 50, doc.y, { width: 200 });
  doc.text('Qty', 250, doc.y - 12, { width: 40 });
  doc.text('MRP', 300, doc.y - 12, { width: 60 });
  doc.text('Amount', 400, doc.y - 12, { width: 145, align: 'right' });
  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();

  doc.font('Helvetica');
  const medicines = [
    ['Telma 40mg (Telmisartan) [BRANDED]', '30', '₹12', '₹ 360'],
    ['Amlodac 5mg (Amlodipine) [BRANDED]', '30', '₹8', '₹ 240'],
    ['Ecosprin 75mg (Aspirin) [GENERIC]', '30', '₹2', '₹ 60'],
    ['Atorva 10mg (Atorvastatin) [BRANDED]', '30', '₹15', '₹ 450'],
  ];

  for (const [med, qty, mrp, amt] of medicines) {
    doc.text(med, 50, doc.y, { width: 200 });
    doc.text(qty, 250, doc.y - 12, { width: 40 });
    doc.text(mrp, 300, doc.y - 12, { width: 60 });
    doc.text(amt, 400, doc.y - 12, { width: 145, align: 'right' });
    doc.moveDown(0.5);
  }

  doc.moveDown();
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown();
  doc.font('Helvetica-Bold').text('Total: ₹ 1,110', { align: 'right' });
  doc.font('Helvetica').text('Note: Generic alternatives available for branded items', { align: 'right' });
});

console.log(`\n🎉 Generated 5 test documents in ${OUT_DIR}/`);
console.log('\nTest with:');
console.log('  curl -X POST http://localhost:3737/api/claims \\');
console.log('    -F "member_id=EMP001" -F "member_name=Rajesh Kumar" \\');
console.log('    -F "treatment_date=2025-03-15" -F "claim_amount=2045" \\');
console.log('    -F "documents=@scripts/test-docs/01_consultation_viral_fever.pdf"');
