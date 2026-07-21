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
    slug: 'medical-exam-foundations',
    title: 'Medical Exam Foundations',
    description: 'Core active-recall drills, error-log workflows, and readiness checklists.',
    resourceIds: ['active-recall-guide', 'error-log-template', 'exam-day-readiness-checklist'],
    challengeId: 'block-zero-21-day-medical-exam-prep',
    status: 'published',
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

export const learningSeedCollections = {
  challenges: sampleChallenges,
  challengeDays: sampleChallengeDays,
  resources: sampleResources,
  teams: sampleTeams,
  learningPacks: sampleLearningPacks,
  dashboard: [sampleDashboard],
  readiness: [sampleReadiness],
  readinessPrompts: sampleReadinessPrompts,
};
