export const sampleChallenges = [
  {
    id: 'block-zero-21-day-medical-exam-prep',
    slug: 'block-zero-21-day-medical-exam-prep',
    title: 'Block Zero: 21-Day Medical Exam Preparation Challenge',
    subtitle: 'Build exam readiness, recall confidence, and daily study consistency.',
    description:
      'A guided 21-day foundation challenge for medical learners preparing for high-stakes exams with active recall, spaced review, and wellness checkpoints.',
    durationDays: 21,
    audience: 'medical-exam-candidates',
    status: 'published',
    tags: ['medical-exams', 'active-recall', 'study-plan', 'wellness'],
    startsAtUtc: null,
    createdUtc: '2026-01-01T00:00:00.000Z',
    updatedUtc: '2026-01-01T00:00:00.000Z',
  },
];

export const sampleChallengeDays = Array.from({ length: 21 }, (_, index) => {
  const day = index + 1;
  const phases = ['Foundation', 'Systems Review', 'Integration'];
  return {
    id: `block-zero-day-${String(day).padStart(2, '0')}`,
    challengeId: 'block-zero-21-day-medical-exam-prep',
    day,
    title: `Day ${day}: ${phases[Math.floor(index / 7)]} Sprint`,
    objective:
      day <= 7
        ? 'Set up the study system and reinforce core science recall.'
        : day <= 14
          ? 'Strengthen organ-system pattern recognition with timed practice.'
          : 'Integrate mixed questions, error review, and exam-day readiness.',
    estimatedMinutes: day % 7 === 0 ? 90 : 60,
    tasks: [
      'Complete a focused active-recall block.',
      'Review missed concepts in an error log.',
      'Finish a five-minute confidence and energy check-in.',
    ],
    resourceIds: ['active-recall-guide', 'error-log-template'],
    status: 'published',
  };
});

export const sampleResources = [
  {
    id: 'active-recall-guide',
    title: 'Active Recall Guide',
    type: 'guide',
    description: 'How to turn notes into recall prompts and fast self-testing loops.',
    url: null,
    tags: ['study-skills'],
  },
  {
    id: 'error-log-template',
    title: 'Medical Exam Error Log Template',
    type: 'template',
    description:
      'A reusable structure for tracking missed questions, root causes, and next reviews.',
    url: null,
    tags: ['review', 'analytics'],
  },
  {
    id: 'exam-day-readiness-checklist',
    title: 'Exam-Day Readiness Checklist',
    type: 'checklist',
    description: 'Final logistics, sleep, nutrition, timing, and mindset reminders.',
    url: null,
    tags: ['readiness', 'wellness'],
  },
];

export const sampleTeams = [
  {
    id: 'foundations-cohort',
    name: 'Foundations Cohort',
    description: 'Default study team for learners starting the Block Zero challenge.',
    memberCount: 12,
    challengeId: 'block-zero-21-day-medical-exam-prep',
    status: 'active',
  },
];

export const sampleLearningPacks = [
  {
    id: 'medical-exam-foundations',
    externalId: 'bp-day-01-foundations',
    slug: 'medical-exam-foundations',
    code: 'LP01',
    title: 'Medical Exam Foundations',
    topic: 'Foundations',
    description: 'Core active-recall drills, error-log workflows, and readiness checklists.',
    objectivesSummary:
      'Build a repeatable exam-prep workflow with active recall, error logging, and readiness checks.',
    tags: ['active-recall', 'error-log', 'readiness'],
    estimatedMinutes: 12,
    resourceIds: ['active-recall-guide', 'error-log-template', 'exam-day-readiness-checklist'],
    challengeId: 'block-zero-21-day-medical-exam-prep',
    dayNumber: 1,
    audience: 'Scholar',
    status: 'published',
    publishAtUtc: '2026-01-01T00:00:00.000Z',
    createdBy: 'seed',
    reviewedBy: 'seed-reviewer',
  },
  {
    id: 'cardiology-foundations',
    externalId: 'bp-day-02-cardiology',
    slug: 'cardiology-foundations',
    code: 'LP02',
    title: 'Cardiology Foundations',
    topic: 'Cardiology',
    description: 'Core high-yield rhythm, murmur, and medication review.',
    objectivesSummary:
      'Identify unstable arrhythmias, match murmurs to maneuvers, and select first-line management.',
    tags: ['cardiology', 'arrhythmia', 'murmurs'],
    estimatedMinutes: 45,
    challengeId: 'block-zero-21-day-medical-exam-prep',
    dayNumber: 2,
    audience: 'Scholar',
    status: 'published',
    publishAtUtc: '2026-01-01T00:00:00.000Z',
    createdBy: 'seed',
    reviewedBy: 'seed-reviewer',
  },
  {
    id: 'renal-review',
    externalId: 'bp-day-03-renal',
    slug: 'renal-review',
    code: 'LP03',
    title: 'Renal Review',
    topic: 'Renal',
    description: 'Nephron physiology, acid-base interpretation, and electrolyte patterns.',
    objectivesSummary:
      'Classify acid-base disorders, localize nephron defects, and prioritize electrolyte management.',
    tags: ['renal', 'acid-base', 'electrolytes'],
    estimatedMinutes: 40,
    challengeId: 'block-zero-21-day-medical-exam-prep',
    dayNumber: 3,
    audience: 'Scholar',
    status: 'published',
    publishAtUtc: '2026-01-01T00:00:00.000Z',
    createdBy: 'seed',
    reviewedBy: 'seed-reviewer',
  },
  {
    id: 'neuro-integration',
    externalId: 'bp-day-04-neuro',
    slug: 'neuro-integration',
    code: 'LP04',
    title: 'Neuro Integration',
    topic: 'Neurology',
    description: 'Localization, stroke syndromes, and rapid neurologic triage.',
    objectivesSummary: 'Localize lesions, separate stroke patterns, and choose urgent next steps.',
    tags: ['neurology', 'localization', 'stroke'],
    estimatedMinutes: 35,
    challengeId: 'block-zero-21-day-medical-exam-prep',
    dayNumber: 4,
    audience: 'Scholar',
    status: 'published',
    publishAtUtc: '2026-09-01T00:00:00.000Z',
    prerequisitesMet: false,
    createdBy: 'seed',
    reviewedBy: 'seed-reviewer',
  },
];

export const sampleCapsules = [
  {
    id: 'bp-day-01-capsule-01',
    externalId: 'bp-day-01-capsule-01',
    learningPackId: 'medical-exam-foundations',
    title: 'High-yield diagnostic reasoning',
    summary: 'Practice identifying the key finding before choosing an answer.',
    sequence: 1,
    estimatedMinutes: 12,
    dailyTarget: true,
    status: 'published',
  },
  {
    id: 'bp-day-02-capsule-01',
    externalId: 'bp-day-02-capsule-01',
    learningPackId: 'cardiology-foundations',
    title: 'Arrhythmia triage',
    summary: 'Decide when rhythm findings require immediate stabilization.',
    sequence: 1,
    estimatedMinutes: 15,
    dailyTarget: true,
    status: 'published',
  },
  {
    id: 'bp-day-03-capsule-01',
    externalId: 'bp-day-03-capsule-01',
    learningPackId: 'renal-review',
    title: 'Acid-base pivots',
    summary: 'Use compensation and anion gap patterns to narrow diagnoses.',
    sequence: 1,
    estimatedMinutes: 15,
    dailyTarget: true,
    status: 'published',
  },
  {
    id: 'bp-day-04-capsule-01',
    externalId: 'bp-day-04-capsule-01',
    learningPackId: 'neuro-integration',
    title: 'Neurologic localization',
    summary: 'Map deficits to lesion locations and urgent actions.',
    sequence: 1,
    estimatedMinutes: 15,
    dailyTarget: true,
    status: 'published',
  },
];

export const sampleQuestions = [
  {
    id: 'bp-day-01-q001',
    externalId: 'bp-day-01-q001',
    capsuleId: 'bp-day-01-capsule-01',
    sequence: 1,
    stem: 'A learner misses several renal physiology questions after focusing on isolated facts. What should they identify first when reviewing each stem?',
    choices: [
      { id: 'A', label: 'A', text: 'The key finding that changes the diagnosis or mechanism.' },
      { id: 'B', label: 'B', text: 'The longest answer choice before reading the vignette.' },
      { id: 'C', label: 'C', text: 'The topic they studied most recently.' },
    ],
    figureUrl: null,
    tableHtml: null,
    supportingMediaUrl: null,
    tags: ['diagnostic-reasoning', 'active-recall'],
    difficulty: 'foundational',
    status: 'published',
  },
  {
    id: 'bp-day-02-q001',
    externalId: 'bp-day-02-q001',
    capsuleId: 'bp-day-02-capsule-01',
    sequence: 1,
    stem: 'A learner reviews unstable tachycardia. Which decision point should they identify first?',
    choices: [
      { id: 'A', label: 'A', text: 'Whether perfusion is compromised.' },
      { id: 'B', label: 'B', text: 'Whether the QRS is narrow after waiting.' },
      { id: 'C', label: 'C', text: 'Whether outpatient monitoring is available.' },
    ],
    tags: ['cardiology', 'arrhythmia'],
    difficulty: 'foundational',
    status: 'published',
  },
  {
    id: 'bp-day-03-q001',
    externalId: 'bp-day-03-q001',
    capsuleId: 'bp-day-03-capsule-01',
    sequence: 1,
    stem: 'A learner starts an acid-base question. What should they calculate early?',
    choices: [
      { id: 'A', label: 'A', text: 'The anion gap and expected compensation.' },
      { id: 'B', label: 'B', text: 'The longest answer choice.' },
      { id: 'C', label: 'C', text: 'The medication list only.' },
    ],
    tags: ['renal', 'acid-base'],
    difficulty: 'foundational',
    status: 'published',
  },
  {
    id: 'bp-day-04-q001',
    externalId: 'bp-day-04-q001',
    capsuleId: 'bp-day-04-capsule-01',
    sequence: 1,
    stem: 'A learner evaluates acute focal deficits. What helps localize the lesion?',
    choices: [
      {
        id: 'A',
        label: 'A',
        text: 'The pattern of motor, sensory, language, and visual findings.',
      },
      { id: 'B', label: 'B', text: 'The patient age alone.' },
      { id: 'C', label: 'C', text: 'The room number.' },
    ],
    tags: ['neurology', 'localization'],
    difficulty: 'foundational',
    status: 'published',
  },
];

export const sampleQuestionExplanations = [
  {
    id: 'bp-day-01-q001-explanation',
    questionId: 'bp-day-01-q001',
    correctChoiceId: 'A',
    correctRationale:
      'The key finding anchors the reasoning chain and prevents answer-choice chasing.',
    incorrectRationales: {
      B: 'Long answer choices can be tempting but do not reliably indicate correctness.',
      C: 'Recent study topics may bias recall and distract from the actual vignette evidence.',
    },
    reference: 'Block Zero internal diagnostic reasoning playbook.',
    memory: {
      highYieldFact: 'Name the pivot finding before looking for the best answer.',
      pearl: 'A clear pivot finding turns recall into clinical reasoning.',
      clinicalRelevance:
        'Clinicians use discriminating findings to narrow differential diagnoses safely.',
      examTrap: 'Do not choose answers because they contain familiar keywords.',
      mnemonic: 'Pivot, Predict, Pick.',
    },
  },
];

export const sampleAssignments = [
  {
    id: 'assignment-day-01-foundations-scholar',
    targetType: 'scholar',
    targetId: 'seed-scholar',
    learningPackId: 'medical-exam-foundations',
    startUtc: '2026-01-01T00:00:00.000Z',
    dueUtc: '2026-01-02T00:00:00.000Z',
    required: true,
  },
  {
    id: 'assignment-day-02-cardiology-scholar',
    targetType: 'scholar',
    targetId: 'seed-scholar',
    learningPackId: 'cardiology-foundations',
    startUtc: '2026-01-01T00:00:00.000Z',
    dueUtc: '2026-01-03T00:00:00.000Z',
    required: true,
  },
  {
    id: 'assignment-day-03-renal-scholar',
    targetType: 'scholar',
    targetId: 'seed-scholar',
    learningPackId: 'renal-review',
    startUtc: '2026-01-01T00:00:00.000Z',
    dueUtc: '2026-01-04T00:00:00.000Z',
    required: true,
  },
  {
    id: 'assignment-day-04-neuro-scholar',
    targetType: 'scholar',
    targetId: 'seed-scholar',
    learningPackId: 'neuro-integration',
    startUtc: '2026-09-01T00:00:00.000Z',
    dueUtc: '2026-09-02T00:00:00.000Z',
    required: true,
  },
];

export const sampleCapsuleAttempts = [
  {
    id: 'attempt-day-01-capsule-01-seed-scholar',
    scholarId: 'seed-scholar',
    capsuleId: 'bp-day-01-capsule-01',
    startedAtUtc: '2026-01-01T00:00:00.000Z',
    completedAtUtc: null,
    completedQuestions: 0,
    currentQuestionAttemptId: 'question-attempt-day-01-q001-seed-scholar',
  },
];

export const sampleQuestionAttempts = [
  {
    id: 'question-attempt-day-01-q001-seed-scholar',
    capsuleAttemptId: 'attempt-day-01-capsule-01-seed-scholar',
    questionId: 'bp-day-01-q001',
    choiceId: null,
    elapsedMs: null,
    markedForReview: false,
    submittedAtUtc: null,
    correct: null,
  },
];

export const sampleContentReviews = [
  {
    id: 'review-medical-exam-foundations',
    entityType: 'learningPack',
    entityId: 'medical-exam-foundations',
    status: 'approved',
    reviewerId: 'seed-reviewer',
    notes: 'Seed content approved for smoke testing.',
    reviewedAtUtc: '2026-01-01T00:00:00.000Z',
  },
];

export const sampleDashboard = {
  id: 'default-dashboard',
  enrollmentState: 'active',
  activeChallengeId: 'block-zero-21-day-medical-exam-prep',
  activeTeamId: 'foundations-cohort',
  activeLearningPackId: 'medical-exam-foundations',
  scholarName: 'Michael',
  currentChallenge: 'Block Zero Challenge',
  currentDay: 5,
  dailyTarget: 15,
  dailyQuestionTarget: 60,
  capsulesCompletedToday: 8,
  questionsCompletedToday: 32,
  overallCompletion: 42,
  completedDays: 4,
  currentStreak: 5,
  readinessLevel: 'On Track',
  academicScore: 84,
  engagementScore: 91,
  readinessLastUpdated: '2026-07-24T12:30:00Z',
  morningCheckInDone: true,
  eveningCheckInDone: false,
  teamName: 'Team Alpha',
  membersActiveToday: 7,
  teamDailyCompletion: 68,
  latestEncouragement: 'Keep your streak alive today!',
  rewardsEarned: 2,
  raffleEntries: 6,
  nextAvailableReward: 'Consistency badge after evening check-in',
  assignedLearningPacks: [
    { externalId: 'medical-exam-foundations', title: 'Medical Exam Foundations' },
  ],
  requiredCapsules: 'Complete capsules 9–15 from Cardiology Foundations',
  scenarioAssignment: 'Chest pain triage scenario',
  rehearsalAssignment: 'Review missed cardiovascular questions',
  restDayInstructions: null,
  recentActivity: [
    'Capsule completed: ECG Basics',
    'Reward earned: Daily Target Starter',
    'Teammate encouragement: Ana cheered your streak',
    'Readiness update: On Track',
    'Support response: Your schedule request was resolved',
  ],
  continueUrl: '/capsules/attempt-day-01-capsule-01-seed-scholar',
  totalDays: 21,
  nextActions: [
    'Start Day 1 active-recall block.',
    'Create your first error-log entry.',
    'Complete the daily confidence check-in.',
  ],
};

export const sampleReadiness = {
  id: 'default-readiness',
  status: 'ready',
  confidenceScore: 3,
  energyScore: 3,
  recommendedAction: "Complete today's readiness prompt before starting your study block.",
  promptIds: ['daily-confidence', 'daily-energy', 'blocker-note'],
};

export const sampleReadinessPrompts = [
  {
    id: 'daily-confidence',
    question: "How confident do you feel about today's objective?",
    responseType: 'scale-1-5',
    cadence: 'daily',
  },
  {
    id: 'daily-energy',
    question: 'How is your energy before the study block?',
    responseType: 'scale-1-5',
    cadence: 'daily',
  },
  {
    id: 'blocker-note',
    question: 'What is the main blocker to address before tomorrow?',
    responseType: 'text',
    cadence: 'daily',
  },
];

export const sampleRewards = [
  {
    id: 'daily-check-in-starter',
    type: 'badge',
    title: 'Daily Check-in Starter',
    description: 'Awarded for completing the first readiness check-in.',
    points: 25,
    earned: false,
    earnedAtUtc: null,
    icon: 'sparkles',
    status: 'active',
  },
  {
    id: 'active-recall-sprint',
    type: 'points',
    title: 'Active Recall Sprint',
    description: "Complete today's active-recall block to unlock these points.",
    points: 50,
    earned: false,
    earnedAtUtc: null,
    icon: 'bolt',
    status: 'active',
  },
  {
    id: 'seven-day-streak',
    type: 'badge',
    title: '7-Day Study Streak',
    description: 'Keep studying for seven consecutive days during the challenge.',
    points: 100,
    earned: false,
    earnedAtUtc: null,
    icon: 'flame',
    status: 'active',
  },
];

export const sampleCertificates = [
  {
    id: 'certificate-block-zero-foundations-seed-scholar',
    userId: 'seed-scholar',
    title: 'Block Zero Foundations Certificate',
    description: 'Awarded for completing the foundational medical exam preparation sprint.',
    challengeId: 'block-zero-21-day-medical-exam-prep',
    issuedAtUtc: '2026-01-21T00:00:00.000Z',
    credentialUrl: null,
    status: 'issued',
  },
];

export const sampleRaffleEntries = [
  {
    id: 'raffle-entry-daily-check-in-seed-scholar',
    userId: 'seed-scholar',
    raffleId: 'daily-check-in-raffle',
    source: 'daily-check-in',
    title: 'Daily Check-in Raffle Entry',
    entries: 1,
    earnedAtUtc: '2026-01-01T00:00:00.000Z',
    status: 'active',
  },
];

export const sampleSystemSettings = {
  id: 'default',
  appName: 'MindUnlocking',
  environment: 'production',
  maintenanceMode: false,
  registrationEnabled: true,
  emailVerificationRequired: true,
  featureFlags: {
    rewards: true,
    readiness: true,
    notifications: true,
    learningPacks: true,
    contentReview: true,
  },
  supportEmail: 'support@mindunlocking.com',
  updatedAtUtc: null,
};

export const sampleReviewScenarios = sampleChallenges.map((challenge) => ({
  ...challenge,
  scenarioId: challenge.id,
  reviewStatus: 'ready_for_review',
}));

export const sampleAiDrafts = [
  {
    id: 'ai-draft-medical-exam-foundations',
    entityType: 'learningPack',
    entityId: 'medical-exam-foundations',
    title: 'Medical Exam Foundations AI Draft',
    status: 'draft',
    createdBy: 'seed-ai',
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    updatedAtUtc: '2026-01-01T00:00:00.000Z',
  },
];

export const sampleReviewHistory = [
  {
    id: 'history-review-medical-exam-foundations',
    reviewId: 'review-medical-exam-foundations',
    action: 'approved',
    actorId: 'seed-reviewer',
    entityType: 'learningPack',
    entityId: 'medical-exam-foundations',
    notes: 'Seed content approved for smoke testing.',
    createdAtUtc: '2026-01-01T00:00:00.000Z',
  },
];

export const sampleSupportRequests = [
  {
    id: 'support-request-seed-scholar',
    requesterId: 'seed-scholar',
    requesterName: 'Seed Scholar',
    subject: 'Need help planning Day 1',
    status: 'open',
    priority: 'normal',
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    updatedAtUtc: '2026-01-01T00:00:00.000Z',
  },
];

export const learningSeedCollections = {
  challenges: sampleChallenges,
  challengeDays: sampleChallengeDays,
  resources: sampleResources,
  teams: sampleTeams,
  learningPacks: sampleLearningPacks,
  capsules: sampleCapsules,
  questions: sampleQuestions,
  questionExplanations: sampleQuestionExplanations,
  assignments: sampleAssignments,
  capsuleAttempts: sampleCapsuleAttempts,
  questionAttempts: sampleQuestionAttempts,
  contentReviews: sampleContentReviews,
  dashboard: [sampleDashboard],
  readiness: [sampleReadiness],
  readinessPrompts: sampleReadinessPrompts,
  rewards: sampleRewards,
  certificates: sampleCertificates,
  raffleEntries: sampleRaffleEntries,
  systemSettings: [sampleSystemSettings],
  reviewScenarios: sampleReviewScenarios,
  aiDrafts: sampleAiDrafts,
  reviewHistory: sampleReviewHistory,
  supportRequests: sampleSupportRequests,
};
