#!/usr/bin/env node
const path = require("path");

const {
  numberArg,
  parseArgs,
  sha256,
  toCsv,
  writeJson,
  writeText,
} = require("./lib/common");

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function walletAddress(prefix) {
  return `0x${sha256(prefix).slice(0, 40)}`;
}

function cidLike(prefix) {
  return `bafy${sha256(prefix).slice(0, 28)}`;
}

const firstNames = [
  "Aarav", "Anaya", "Ishaan", "Diya", "Rohan", "Meera", "Kabir", "Nisha",
  "Arjun", "Kavya", "Neel", "Saanvi", "Riya", "Vikram", "Dev", "Sneha",
];
const lastNames = [
  "Sharma", "Nair", "Menon", "Verma", "Patel", "Reddy", "Bose", "Kapoor",
  "Iyer", "Khan", "Das", "Rao", "Mehta", "Singh", "Gupta", "Pillai",
];
const specialties = [
  "General Medicine", "Cardiology", "Dermatology", "Pediatrics",
  "Orthopedics", "Neurology", "ENT", "Pulmonology",
];
const hospitals = [
  "IIITK Health Centre", "City Care Hospital", "Green Valley Clinic",
  "Metro Specialty", "Sunrise Medical Institute",
];
const diagnoses = [
  "Upper respiratory infection", "Type 2 diabetes follow-up", "Hypertension review",
  "Mild skin allergy", "Migraine episode", "Seasonal flu", "Vitamin deficiency",
  "Post-operative pain review", "Asthma management", "Routine pediatric fever",
];
const medicines = [
  ["Paracetamol", "650 mg", "Twice daily"],
  ["Amoxicillin", "500 mg", "Three times daily"],
  ["Cetirizine", "10 mg", "At bedtime"],
  ["Metformin", "500 mg", "Twice daily after meals"],
  ["Amlodipine", "5 mg", "Once daily"],
  ["Pantoprazole", "40 mg", "Before breakfast"],
  ["Salbutamol Inhaler", "2 puffs", "When required"],
  ["Vitamin D3", "60,000 IU", "Once weekly"],
  ["Ibuprofen", "400 mg", "After food if pain persists"],
];
const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const allergies = ["None", "Penicillin", "Peanuts", "Dust", "Seafood", "Pollen"];

function buildPatients(rng, total) {
  return Array.from({ length: total }, (_, index) => {
    const name = `${pick(rng, firstNames)} ${pick(rng, lastNames)}`;
    return {
      id: `PT-${String(index + 1).padStart(3, "0")}`,
      wallet: walletAddress(`patient-${index + 1}`),
      name,
      age: randomInt(rng, 18, 78),
      bloodGroup: pick(rng, bloodGroups),
      allergy: pick(rng, allergies),
    };
  });
}

function buildDoctors(rng, total) {
  return Array.from({ length: total }, (_, index) => {
    const name = `Dr. ${pick(rng, firstNames)} ${pick(rng, lastNames)}`;
    return {
      id: `DR-${String(index + 1).padStart(3, "0")}`,
      wallet: walletAddress(`doctor-${index + 1}`),
      name,
      specialty: pick(rng, specialties),
      hospital: pick(rng, hospitals),
      active: rng() > 0.1,
    };
  });
}

function buildPrescription(rng, patients, doctors, index) {
  const patient = pick(rng, patients);
  const doctor = pick(rng, doctors.filter((entry) => entry.active));
  const diagnosis = pick(rng, diagnoses);
  const medicationCount = randomInt(rng, 1, 3);
  const selectedMeds = Array.from({ length: medicationCount }, () => {
    const [name, dosage, schedule] = pick(rng, medicines);
    return { name, dosage, schedule };
  });
  const createdAt = new Date(Date.UTC(2026, 2, 1 + (index % 28), 9 + (index % 7), index % 60, 0)).toISOString();
  const payload = {
    title: `Prescription ${index + 1}`,
    summary: diagnosis,
    notes: `Review in ${randomInt(rng, 5, 21)} days. Hydration and rest advised.`,
    medications: selectedMeds,
  };
  const payloadHash = sha256(JSON.stringify(payload));

  return {
    id: `RX-${String(index + 1).padStart(4, "0")}`,
    patientId: patient.id,
    patientWallet: patient.wallet,
    doctorId: doctor.id,
    doctorWallet: doctor.wallet,
    createdAt,
    diagnosis,
    payload,
    payloadHash,
    ipfsCid: cidLike(`prescription-${index + 1}-${payloadHash}`),
    onChainAnchor: `0x${sha256(`anchor-${payloadHash}`).slice(0, 64)}`,
    workflow: {
      doctorSigned: true,
      patientApproved: index % 11 !== 0,
      delegatesAdded: index % 5 === 0 ? 1 : 0,
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = numberArg(args, "seed", 20260401);
  const patientsCount = numberArg(args, "patients", 30);
  const doctorsCount = numberArg(args, "doctors", 8);
  const prescriptionsCount = numberArg(args, "prescriptions", 120);
  const outputDir = path.resolve(args.outdir || path.join(__dirname, "output"));
  const outputJson = path.join(outputDir, "synthetic-dataset.json");
  const outputCsv = path.join(outputDir, "synthetic-prescriptions.csv");

  const rng = createRng(seed);
  const patients = buildPatients(rng, patientsCount);
  const doctors = buildDoctors(rng, doctorsCount);
  const prescriptions = Array.from(
    { length: prescriptionsCount },
    (_, index) => buildPrescription(rng, patients, doctors, index)
  );

  const dataset = {
    generatedAt: new Date().toISOString(),
    seed,
    counts: {
      patients: patients.length,
      doctors: doctors.length,
      activeDoctors: doctors.filter((doctor) => doctor.active).length,
      prescriptions: prescriptions.length,
      finalizedPrescriptions: prescriptions.filter((entry) => entry.workflow.patientApproved).length,
    },
    patients,
    doctors,
    prescriptions,
  };

  writeJson(outputJson, dataset);

  const csvRows = prescriptions.map((entry) => ({
    prescription_id: entry.id,
    patient_id: entry.patientId,
    doctor_id: entry.doctorId,
    created_at: entry.createdAt,
    diagnosis: entry.diagnosis,
    ipfs_cid: entry.ipfsCid,
    payload_hash: entry.payloadHash,
    patient_approved: entry.workflow.patientApproved,
    delegate_count: entry.workflow.delegatesAdded,
  }));
  writeText(
    outputCsv,
    toCsv(csvRows, [
      "prescription_id",
      "patient_id",
      "doctor_id",
      "created_at",
      "diagnosis",
      "ipfs_cid",
      "payload_hash",
      "patient_approved",
      "delegate_count",
    ])
  );

  console.log(`Synthetic dataset written to ${outputJson}`);
  console.log(`Prescription table written to ${outputCsv}`);
  console.log(
    `Generated ${patients.length} patients, ${doctors.length} doctors, ${prescriptions.length} prescriptions using seed ${seed}.`
  );
}

main();
