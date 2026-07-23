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
    title: 'Medical Exam Foundations',
    description: 'Core active-recall drills, error-log workflows, and readiness checklists.',
    resourceIds: ['active-recall-guide', 'error-log-template', 'exam-day-readiness-checklist'],
    challengeId: 'block-zero-21-day-medical-exam-prep',
    dayNumber: 1,
    audience: 'Scholar',
    status: 'published',
    publishAtUtc: '2026-01-01T00:00:00.000Z',
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
  activeChallengeId: 'block-zero-21-day-medical-exam-prep',
  activeTeamId: 'foundations-cohort',
  activeLearningPackId: 'medical-exam-foundations',
  currentDay: 1,
  completedDays: 0,
  totalDays: 21,
  questionsCompletedToday: 0,
  overallCompletion: 0,
  readinessLevel: 'ready',
  continueUrl: '/capsules/attempt-day-01-capsule-01-seed-scholar',
  assignedLearningPacks: sampleLearningPacks,
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
