const PACK_ID = 'medical-terminology-foundations';

type QuestionSeed = {
  id: string;
  stem: string;
  choices: string[];
  correct: number;
  rationales: string[];
  fact: string;
  pearl: string;
  relevance: string;
  trap: string;
  mnemonic: string;
  tags: string[];
  difficulty?: 'foundational' | 'applied';
};

type CapsuleSeed = {
  id: string;
  title: string;
  description: string;
  objectives: string[];
  questions: QuestionSeed[];
};

export const medicalTerminologyLearningPack = {
  id: PACK_ID,
  externalId: 'LP01-MEDTERM-FOUNDATIONS',
  slug: PACK_ID,
  code: 'LP01',
  title: 'Medical Terminology Foundations',
  subtitle: 'Prefixes, suffixes, roots, combining forms, and safe interpretation',
  topic: 'Word Structure and Clinical Vocabulary',
  subject: 'Medical Terminology',
  difficulty: 'Foundation',
  description:
    'A five-capsule introductory learning pack that teaches scholars how to break down, interpret, and construct common medical terms used in anatomy, physiology, diagnostics, and clinical communication.',
  objectives: [
    'Identify prefixes, roots, combining forms, and suffixes in medical terms.',
    'Interpret common directional, positional, diagnostic, and procedural terms.',
    'Distinguish similar-looking terms that have different meanings.',
    'Construct basic medical terms from component parts.',
    'Apply terminology safely in short clinical contexts.',
  ],
  objectivesSummary:
    'Identify, interpret, distinguish, and construct medical word parts, then apply them safely in clinical contexts.',
  tags: ['medical-terminology', 'word-structure', 'clinical-vocabulary'],
  estimatedMinutes: 75,
  questionCount: 20,
  capsuleCount: 5,
  questionsPerCapsule: 4,
  audience: 'Scholar',
  prerequisites: [],
  completionCriteria: {
    requiredQuestions: 20,
    requiredMemoryPearlAcknowledgements: 20,
    minimumPassingPercent: 70,
  },
  status: 'draft',
  version: 1,
  language: 'en-US',
  createdAt: '2026-07-24T23:15:44.118426+00:00',
  updatedAt: '2026-07-24T23:15:44.118426+00:00',
  createdBy: 'content-author',
  reviewNotes: [
    'Educational content should be reviewed by an authorized medical content reviewer before publication.',
    'The pack teaches terminology and does not provide patient-specific diagnosis or treatment guidance.',
  ],
};

const capsules: CapsuleSeed[] = [
  {
    id: 'LP01-C01',
    title: 'How Medical Terms Are Built',
    description: 'Learn the four major building blocks used to form medical words.',
    objectives: [
      'Recognize a word root.',
      'Recognize a prefix and suffix.',
      'Understand the purpose of a combining vowel.',
    ],
    questions: [
      {
        id: 'LP01-C01-Q01',
        stem: 'In the medical term cardiology, which component carries the core meaning related to the heart?',
        choices: ['cardi', 'o', 'logy', 'ology'],
        correct: 0,
        rationales: [
          'The root cardi means heart. It carries the central meaning of the term.',
          'The letter o is the combining vowel, not the root.',
          'The suffix -logy means study of.',
          'The ending is commonly analyzed as the combining vowel o plus the suffix -logy.',
        ],
        fact: 'The word root usually identifies the body part, tissue, organ, or core concept.',
        pearl: 'Find the root first; it usually tells you what the term is mainly about.',
        relevance:
          'Correctly identifying the root helps prevent confusion when reading unfamiliar chart terms.',
        trap: 'Do not assume every letter before a suffix is part of the root.',
        mnemonic: 'ROOT = Real Origin Of The term',
        tags: ['word-root', 'cardi'],
      },
      {
        id: 'LP01-C01-Q02',
        stem: 'What is the main purpose of a combining vowel in a medical term?',
        choices: [
          'To change the term from singular to plural',
          'To make pronunciation easier when word parts are joined',
          'To identify the disease severity',
          'To indicate a procedure',
        ],
        correct: 1,
        rationales: [
          'Plural formation follows separate language rules.',
          'A combining vowel, commonly o, links word parts and makes the completed term easier to pronounce.',
          'Severity is expressed by specific modifiers, not by the combining vowel.',
          'Procedures are usually indicated by suffixes such as -ectomy or -scopy.',
        ],
        fact: 'The most common combining vowel in medical terminology is o.',
        pearl: 'A combining vowel connects word parts; it usually does not add meaning.',
        relevance:
          'Recognizing the combining vowel helps you separate roots from suffixes accurately.',
        trap: 'Do not define the combining vowel as if it were a root or suffix.',
        mnemonic: 'O = the connector',
        tags: ['combining-vowel'],
      },
      {
        id: 'LP01-C01-Q03',
        stem: 'In the term hypoglycemia, what does the prefix hypo- mean?',
        choices: ['Above normal', 'Below normal or deficient', 'Around', 'Within'],
        correct: 1,
        rationales: [
          'Hyper- means above normal or excessive.',
          'The prefix hypo- means below, deficient, or lower than normal.',
          'Peri- means around.',
          'Intra- means within.',
        ],
        fact: 'Hypo- means low; hyper- means high.',
        pearl: 'Hypoglycemia means abnormally low blood glucose.',
        relevance: 'Confusing hypo- and hyper- can reverse the meaning of a clinical condition.',
        trap: 'Read the entire prefix; hypo- and hyper- begin similarly but mean opposites.',
        mnemonic: 'HYPO = low, HYPER = high',
        tags: ['prefix', 'hypo', 'glucose'],
      },
      {
        id: 'LP01-C01-Q04',
        stem: 'Which suffix means inflammation?',
        choices: ['-algia', '-itis', '-oma', '-osis'],
        correct: 1,
        rationales: [
          '-algia means pain.',
          'The suffix -itis means inflammation.',
          '-oma commonly refers to a tumor or mass.',
          '-osis commonly refers to an abnormal condition or process.',
        ],
        fact: 'A suffix often tells you the condition, disease process, or procedure.',
        pearl: 'When a term ends in -itis, think inflammation.',
        relevance: 'Examples include arthritis, dermatitis, and gastritis.',
        trap: 'Inflammation is not the same as infection; a term ending in -itis does not by itself prove infection.',
        mnemonic: 'ITIS = inflammation is there',
        tags: ['suffix', 'inflammation'],
      },
    ],
  },
  {
    id: 'LP01-C02',
    title: 'Common Prefixes',
    description: 'Interpret location, number, speed, direction, and quantity using prefixes.',
    objectives: [
      'Interpret location and directional prefixes.',
      'Distinguish prefixes that indicate quantity or speed.',
    ],
    questions: [
      {
        id: 'LP01-C02-Q01',
        stem: 'The prefix peri- means:',
        choices: ['Around', 'Inside', 'Below', 'Behind'],
        correct: 0,
        rationales: [
          'Peri- means around or surrounding.',
          'Intra- means within or inside.',
          'Sub- commonly means under or below.',
          'Post- can mean after or behind, depending on context.',
        ],
        fact: 'Pericardium means the structure around the heart.',
        pearl: 'Peri- wraps around.',
        relevance: 'Pericarditis is inflammation of the sac surrounding the heart.',
        trap: 'Do not confuse peri- with para-, which often means beside or near.',
        mnemonic: 'PERI = perimeter',
        tags: ['prefix', 'peri'],
      },
      {
        id: 'LP01-C02-Q02',
        stem: 'A patient with tachycardia has:',
        choices: [
          'A slow heart rate',
          'A fast heart rate',
          'No heart rhythm',
          'Inflammation of the heart',
        ],
        correct: 1,
        rationales: [
          'Bradycardia refers to a slow heart rate.',
          'Tachy- means fast, and cardi refers to the heart.',
          'The term does not mean absence of rhythm.',
          'Inflammation would typically be indicated by a term ending in -itis.',
        ],
        fact: 'Tachy- means fast; brady- means slow.',
        pearl: 'Tachycardia = fast heart rate.',
        relevance: 'These prefixes are commonly used in vital-sign documentation.',
        trap: 'Do not confuse tachycardia with tachypnea; tachypnea refers to rapid breathing.',
        mnemonic: 'TACHY takes off quickly',
        tags: ['prefix', 'tachy', 'cardiac'],
      },
      {
        id: 'LP01-C02-Q03',
        stem: 'Which term means pertaining to both sides?',
        choices: ['Unilateral', 'Bilateral', 'Ipsilateral', 'Contralateral'],
        correct: 1,
        rationales: [
          'Uni- means one; unilateral means one side.',
          'Bi- means two, so bilateral means involving both sides.',
          'Ipsilateral means on the same side.',
          'Contralateral means on the opposite side.',
        ],
        fact: 'Bi- means two; uni- means one.',
        pearl: 'Bilateral findings occur on both sides.',
        relevance: 'Laterality is essential when documenting examination findings and procedures.',
        trap: 'Bilateral is not the same as symmetrical; both sides can be affected differently.',
        mnemonic: 'BI = both',
        tags: ['prefix', 'laterality'],
      },
      {
        id: 'LP01-C02-Q04',
        stem: 'The prefix intra- means:',
        choices: ['Outside', 'Within', 'Before', 'Across'],
        correct: 1,
        rationales: [
          'Extra- commonly means outside.',
          'Intra- means within or inside.',
          'Pre- means before.',
          'Trans- means across or through.',
        ],
        fact: 'Intravenous means within a vein.',
        pearl: 'Intra- means inside.',
        relevance:
          'This prefix appears in terms such as intravenous, intramuscular, and intracranial.',
        trap: 'Do not confuse intra- with inter-, which means between.',
        mnemonic: 'INTRA = in',
        tags: ['prefix', 'intra'],
      },
    ],
  },
  {
    id: 'LP01-C03',
    title: 'Common Suffixes',
    description: 'Recognize suffixes that describe symptoms, conditions, tests, and procedures.',
    objectives: [
      'Interpret diagnostic and procedural suffixes.',
      'Differentiate pain, enlargement, removal, and visual examination.',
    ],
    questions: [
      {
        id: 'LP01-C03-Q01',
        stem: 'The suffix -algia means:',
        choices: ['Pain', 'Bleeding', 'Enlargement', 'Surgical removal'],
        correct: 0,
        rationales: [
          '-algia means pain.',
          '-rrhage or -rrhagia may refer to excessive flow or bleeding.',
          '-megaly means enlargement.',
          '-ectomy means surgical removal.',
        ],
        fact: 'Neuralgia means nerve pain.',
        pearl: 'When you see -algia, think pain.',
        relevance: 'Pain terms often identify the affected structure through the root.',
        trap: 'Do not confuse -algia with -plegia, which refers to paralysis.',
        mnemonic: 'ALGIA = ache',
        tags: ['suffix', 'pain'],
      },
      {
        id: 'LP01-C03-Q02',
        stem: 'Which term means enlargement of the liver?',
        choices: ['Hepatitis', 'Hepatomegaly', 'Hepatectomy', 'Hepatology'],
        correct: 1,
        rationales: [
          'Hepatitis means inflammation of the liver.',
          'Hepat means liver and -megaly means enlargement.',
          'Hepatectomy means surgical removal of all or part of the liver.',
          'Hepatology is the study of the liver and related disorders.',
        ],
        fact: '-megaly means enlargement.',
        pearl: 'Hepatomegaly = enlarged liver.',
        relevance: 'Enlargement is a finding; it does not identify the cause by itself.',
        trap: 'Do not assume hepatomegaly means hepatitis.',
        mnemonic: 'MEGA = large',
        tags: ['suffix', 'megaly', 'liver'],
      },
      {
        id: 'LP01-C03-Q03',
        stem: 'A cholecystectomy is:',
        choices: [
          'Visual examination of the gallbladder',
          'Inflammation of the gallbladder',
          'Surgical removal of the gallbladder',
          'Repair of the gallbladder',
        ],
        correct: 2,
        rationales: [
          '-scopy indicates visual examination.',
          '-itis indicates inflammation.',
          'Cholecyst refers to the gallbladder and -ectomy means surgical removal.',
          '-plasty indicates surgical repair.',
        ],
        fact: '-ectomy means surgical removal.',
        pearl: 'Cholecystectomy = gallbladder removal.',
        relevance: 'Procedure suffixes reveal what was done, even when the root is unfamiliar.',
        trap: 'Do not confuse -ectomy with -otomy, which means incision into.',
        mnemonic: 'ECTOMY = exit',
        tags: ['suffix', 'ectomy', 'procedure'],
      },
      {
        id: 'LP01-C03-Q04',
        stem: 'Which suffix means visual examination with an instrument?',
        choices: ['-scopy', '-gram', '-lysis', '-stasis'],
        correct: 0,
        rationales: [
          '-scopy means the process of visual examination, usually with an instrument.',
          '-gram refers to a record or image.',
          '-lysis means breakdown, destruction, or separation.',
          '-stasis refers to stopping, controlling, or standing still.',
        ],
        fact: 'Colonoscopy is visual examination of the colon.',
        pearl: '-scope is the instrument; -scopy is the process.',
        relevance:
          'Distinguishing the instrument from the procedure improves chart interpretation.',
        trap: 'A -gram is the resulting record; -graphy is the process of recording.',
        mnemonic: 'SCOPY = see',
        tags: ['suffix', 'scopy', 'procedure'],
      },
    ],
  },
  {
    id: 'LP01-C04',
    title: 'Body-System Roots',
    description: 'Connect common roots and combining forms to body organs and systems.',
    objectives: [
      'Recognize common roots for the heart, kidney, liver, nerves, and stomach.',
      'Apply roots to interpret unfamiliar terms.',
    ],
    questions: [
      {
        id: 'LP01-C04-Q01',
        stem: 'Which combining form refers to the kidney?',
        choices: ['neur/o', 'nephr/o', 'hepat/o', 'gastr/o'],
        correct: 1,
        rationales: [
          'Neur/o refers to nerves.',
          'Nephr/o refers to the kidney.',
          'Hepat/o refers to the liver.',
          'Gastr/o refers to the stomach.',
        ],
        fact: 'Nephr/o and ren/o both refer to the kidney.',
        pearl: 'Nephrology is the study and care of kidney disease.',
        relevance: 'The same organ may have more than one accepted combining form.',
        trap: 'Do not confuse nephr/o with neur/o.',
        mnemonic: 'NEPHR = kidney',
        tags: ['root', 'kidney'],
      },
      {
        id: 'LP01-C04-Q02',
        stem: 'The combining form neur/o refers to:',
        choices: ['Nerve', 'Kidney', 'Bone', 'Blood'],
        correct: 0,
        rationales: [
          'Neur/o refers to a nerve or the nervous system.',
          'Nephr/o or ren/o refers to the kidney.',
          'Oste/o refers to bone.',
          'Hemat/o or hem/o refers to blood.',
        ],
        fact: 'Neurology focuses on the nervous system.',
        pearl: 'Neur/o = nerve.',
        relevance: 'Many neurologic terms can be decoded once this root is recognized.',
        trap: 'Neur/o and nephr/o are visually similar but refer to different systems.',
        mnemonic: 'NEUR = neuron',
        tags: ['root', 'nerve'],
      },
      {
        id: 'LP01-C04-Q03',
        stem: 'Which term means inflammation of the stomach?',
        choices: ['Gastralgia', 'Gastrectomy', 'Gastritis', 'Gastroscopy'],
        correct: 2,
        rationales: [
          'Gastralgia means stomach pain.',
          'Gastrectomy means surgical removal of part or all of the stomach.',
          'Gastr means stomach and -itis means inflammation.',
          'Gastroscopy refers to visual examination of the stomach.',
        ],
        fact: 'Gastr/o refers to the stomach.',
        pearl: 'Gastritis = stomach inflammation.',
        relevance: 'A symptom term and a disease-process term are not interchangeable.',
        trap: 'Pain alone is not automatically inflammation.',
        mnemonic: 'GASTR = gastric = stomach',
        tags: ['root', 'stomach', 'inflammation'],
      },
      {
        id: 'LP01-C04-Q04',
        stem: 'Which combining form refers to blood?',
        choices: ['hemat/o', 'oste/o', 'arthr/o', 'dermat/o'],
        correct: 0,
        rationales: [
          'Hemat/o refers to blood.',
          'Oste/o refers to bone.',
          'Arthr/o refers to a joint.',
          'Dermat/o refers to skin.',
        ],
        fact: 'Hematology is the study of blood and blood-forming tissues.',
        pearl: 'Hemat/o = blood.',
        relevance: 'This root appears in terms related to blood disorders and laboratory testing.',
        trap: 'Hem/o and hemat/o are related forms; do not treat them as unrelated roots.',
        mnemonic: 'HEMAT = blood',
        tags: ['root', 'blood'],
      },
    ],
  },
  {
    id: 'LP01-C05',
    title: 'Clinical Interpretation and Safe Use',
    description:
      'Apply terminology to short clinical statements and avoid common interpretation errors.',
    objectives: [
      'Decode complete medical terms in context.',
      'Distinguish condition, symptom, and procedure terms.',
      'Use terminology without making unsupported clinical conclusions.',
    ],
    questions: [
      {
        id: 'LP01-C05-Q01',
        stem: 'A chart states that the patient has dyspnea. What does this term mean?',
        choices: [
          'Difficult or labored breathing',
          'Rapid heart rate',
          'Chest pain',
          'Absence of breathing',
        ],
        correct: 0,
        rationales: [
          'Dyspnea means difficult, uncomfortable, or labored breathing.',
          'A rapid heart rate is tachycardia.',
          'Chest pain may be described as thoracic pain or chest pain; dyspnea specifically concerns breathing.',
          'Apnea means absence of breathing.',
        ],
        fact: 'Dys- can mean difficult, painful, or abnormal.',
        pearl: 'Dyspnea = difficult breathing; apnea = no breathing.',
        relevance: 'Dyspnea is a symptom and does not by itself identify the underlying cause.',
        trap: 'Do not convert a symptom term into a diagnosis.',
        mnemonic: 'DYS = difficult',
        tags: ['clinical-term', 'respiratory'],
        difficulty: 'applied',
      },
      {
        id: 'LP01-C05-Q02',
        stem: 'The term subcutaneous means:',
        choices: ['Above the skin', 'Under the skin', 'Within a vein', 'Between muscles'],
        correct: 1,
        rationales: [
          'Super- or supra- may indicate above.',
          'Sub- means under and cutane/o refers to skin.',
          'Intravenous means within a vein.',
          'Intermuscular would indicate between muscles.',
        ],
        fact: 'Subcutaneous tissue lies beneath the skin.',
        pearl: 'Sub- = under; cutaneous = skin.',
        relevance: 'Subcutaneous medications are delivered into the fatty tissue beneath the skin.',
        trap: 'Subcutaneous and intradermal are not the same depth.',
        mnemonic: 'SUB = below',
        tags: ['clinical-term', 'skin'],
        difficulty: 'applied',
      },
      {
        id: 'LP01-C05-Q03',
        stem: 'Which interpretation of osteoarthritis is most accurate based on its word parts?',
        choices: [
          'Inflammation involving bone and joint structures',
          'Surgical removal of a bone',
          'Visual examination of a joint',
          'Paralysis caused by a bone disorder',
        ],
        correct: 0,
        rationales: [
          'Oste/o refers to bone, arthr/o refers to joint, and -itis means inflammation.',
          'Surgical removal would be indicated by -ectomy.',
          'Visual examination would be indicated by -scopy.',
          'Paralysis would be indicated by -plegia.',
        ],
        fact: 'Complex terms may contain more than one root.',
        pearl: 'Oste/o + arthr/o + -itis identifies bone, joint, and inflammation.',
        relevance:
          'Word-part analysis helps with meaning, but the full clinical definition may be more specific than a literal translation.',
        trap: 'Do not assume the literal breakdown captures every detail of the disease process.',
        mnemonic: 'OSTEO bone + ARTHR joint + ITIS inflammation',
        tags: ['clinical-term', 'musculoskeletal'],
        difficulty: 'applied',
      },
      {
        id: 'LP01-C05-Q04',
        stem: 'A student sees the term nephrolithiasis. Which interpretation is best?',
        choices: [
          'Inflammation of the kidney',
          'A condition involving kidney stones',
          'Surgical removal of a kidney',
          'Visual examination of the kidney',
        ],
        correct: 1,
        rationales: [
          'Kidney inflammation would be described with an inflammatory term such as nephritis.',
          'Nephr/o refers to the kidney, lith refers to stone, and -iasis indicates a condition or formation.',
          'Nephrectomy means surgical removal of a kidney.',
          'A visual examination term would usually include -scopy.',
        ],
        fact: 'Lith/o means stone.',
        pearl: 'Nephrolithiasis refers to kidney stone disease.',
        relevance: 'Breaking the term into parts reveals the organ, material, and condition.',
        trap: 'Do not confuse nephrolithiasis with nephritis.',
        mnemonic: 'LITH = stone',
        tags: ['clinical-term', 'kidney', 'stone'],
        difficulty: 'applied',
      },
    ],
  },
];

export const medicalTerminologyCapsules = capsules.map((capsule, index) => ({
  id: capsule.id,
  externalId: capsule.id,
  learningPackId: PACK_ID,
  title: capsule.title,
  summary: capsule.description,
  description: capsule.description,
  learningObjectives: capsule.objectives,
  sequence: index + 1,
  estimatedMinutes: 15,
  dailyTarget: false,
  status: 'draft',
}));

const questions = capsules.flatMap((capsule) =>
  capsule.questions.map((question, index) => ({
    question,
    capsuleId: capsule.id,
    sequence: index + 1,
  })),
);

export const medicalTerminologyQuestions = questions.map(({ question, capsuleId, sequence }) => ({
  id: question.id,
  externalId: question.id,
  capsuleId,
  sequence,
  type: 'SingleChoice',
  stem: question.stem,
  choices: question.choices.map((text, index) => {
    const id = String.fromCharCode(65 + index);
    return { id, label: id, text };
  }),
  figureUrl: null,
  tableHtml: null,
  supportingMediaUrl: null,
  tags: question.tags,
  difficulty: question.difficulty ?? 'foundational',
  status: 'draft',
}));

export const medicalTerminologyQuestionExplanations = questions.map(({ question }) => ({
  id: `${question.id}-explanation`,
  questionId: question.id,
  correctChoiceId: String.fromCharCode(65 + question.correct),
  correctRationale: question.rationales[question.correct],
  incorrectRationales: Object.fromEntries(
    question.rationales.flatMap((rationale, index) =>
      index === question.correct ? [] : [[String.fromCharCode(65 + index), rationale]],
    ),
  ),
  memory: {
    highYieldFact: question.fact,
    pearl: question.pearl,
    clinicalRelevance: question.relevance,
    examTrap: question.trap,
    mnemonic: question.mnemonic,
  },
}));
