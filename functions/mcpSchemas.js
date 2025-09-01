import { z } from "zod";

export const contactSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  role: z.string(),
  email: z.string().email().optional(),
});

export const contactsSchema = z.array(contactSchema);

export const projectQuestionSchema = z.object({
  question: z.string(),
  stakeholders: z.array(z.string()).optional(),
  phase: z.string().optional(),
  answer: z.string().optional(),
  asked: z.record(z.boolean()).optional(),
  contacts: z.array(z.string()).optional(),
});

export const projectQuestionsSchema = z.array(projectQuestionSchema);

export const sourceMaterialSchema = z.object({
  name: z.string(),
  content: z.string(),
});

export const sourceMaterialsSchema = z.array(sourceMaterialSchema);

export const audienceProfileSchema = z.string().min(1);
export const briefSchema = z.string().min(1);
export const businessGoalSchema = z.string().min(1);

/**
 * Utility types derived from schemas
 * @typedef {z.infer<typeof contactSchema>} Contact
 * @typedef {z.infer<typeof contactsSchema>} Contacts
 * @typedef {z.infer<typeof projectQuestionSchema>} ProjectQuestion
 * @typedef {z.infer<typeof projectQuestionsSchema>} ProjectQuestions
 * @typedef {z.infer<typeof sourceMaterialSchema>} SourceMaterial
 * @typedef {z.infer<typeof sourceMaterialsSchema>} SourceMaterials
 */

const toolSchemas = {
  generateTrainingPlan: z.object({ prompt: z.string() }),
  generateStudyMaterial: z.object({ topic: z.string() }),
  generateCourseOutline: z.object({ topic: z.string() }),
  generateAssessment: z.object({ topic: z.string() }),
  generateLessonContent: z.object({ topic: z.string() }),
  generateClarifyingQuestions: z.object({
    businessGoal: businessGoalSchema,
    audienceProfile: audienceProfileSchema.optional(),
    sourceMaterial: z.string().optional(),
    projectConstraints: z.string().optional(),
    keyContacts: contactsSchema.optional(),
  }),
  generateProjectBrief: z.object({
    businessGoal: businessGoalSchema,
    audienceProfile: audienceProfileSchema.optional(),
    sourceMaterial: z.string().optional(),
    projectConstraints: z.string().optional(),
    keyContacts: contactsSchema.optional(),
    clarifyingQuestions: projectQuestionsSchema.optional(),
    clarifyingAnswers: z.array(z.any()).optional(),
  }),
  generateStatusUpdate: z.object({
    audience: z.string().optional(),
    today: z.string().optional(),
    previousUpdateSummary: z.string().optional(),
    newStakeholderAnswers: z.string().optional(),
    newDocuments: z.string().optional(),
    projectBaseline: z.string().optional(),
    allOutstandingTasks: z.string().optional(),
  }),
  generateLearningStrategy: z.object({
    projectBrief: briefSchema,
    businessGoal: businessGoalSchema.optional(),
    audienceProfile: audienceProfileSchema.optional(),
    projectConstraints: z.string().optional(),
    keyContacts: contactsSchema.optional(),
    sourceMaterial: z.string().optional(),
    clarifyingQuestions: projectQuestionsSchema.optional(),
    clarifyingAnswers: z.array(z.any()).optional(),
    personaCount: z.number().optional(),
  }),
  generateContentAssets: z.object({
    ldd: z.any(),
    component: z.string().optional(),
    components: z.array(z.string()).optional(),
    jobId: z.string().optional(),
  }),
  generateLearnerPersona: z.object({
    projectBrief: briefSchema,
    businessGoal: businessGoalSchema.optional(),
    audienceProfile: audienceProfileSchema.optional(),
    projectConstraints: z.string().optional(),
    keyContacts: contactsSchema.optional(),
    sourceMaterial: z.string().optional(),
    existingMotivationKeywords: z.array(z.string()).optional(),
    existingChallengeKeywords: z.array(z.string()).optional(),
    existingLearningPreferenceKeywords: z.array(z.string()).optional(),
    refreshField: z.string().optional(),
    personaType: z.string().optional(),
    existingTypes: z.array(z.string()).optional(),
    selectedTraits: z.array(z.string()).optional(),
  }),
  generateHierarchicalOutline: z.object({
    projectBrief: briefSchema,
    learningObjectives: z.any(),
    businessGoal: businessGoalSchema.optional(),
    audienceProfile: audienceProfileSchema.optional(),
    projectConstraints: z.string().optional(),
    selectedModality: z.string().optional(),
    blendModalities: z.array(z.string()).optional(),
    sourceMaterial: z.string().optional(),
    keyContacts: contactsSchema.optional(),
  }),
  generateLearningDesignDocument: z.object({
    projectBrief: briefSchema,
    businessGoal: businessGoalSchema.optional(),
    audienceProfile: audienceProfileSchema.optional(),
    projectConstraints: z.string().optional(),
    selectedModality: z.string().optional(),
    blendModalities: z.array(z.string()).optional(),
    learningObjectives: z.any().optional(),
    courseOutline: z.string().optional(),
    trainingPlan: z.string().optional(),
    sourceMaterial: z.string().optional(),
    keyContacts: contactsSchema.optional(),
  }),
  generateStoryboard: z.object({
    topic: z.string(),
    targetAudience: z.string().optional(),
  }),
  generateInitialInquiryMap: z.object({
    brief: briefSchema,
    uid: z.string(),
    initiativeId: z.string(),
    documents: z.string().optional(),
    answers: z.string().optional(),
  }),
  generateAvatar: z.object({
    name: z.string(),
    motivation: z.string().optional(),
    challenges: z.string().optional(),
    ageRange: z.string().optional(),
    techProficiency: z.string().optional(),
    educationLevel: z.string().optional(),
    learningPreferences: z.string().optional(),
    seedExtra: z.string().optional(),
  }),
  savePersona: z.object({
    initiativeId: z.string(),
    personaId: z.string(),
    persona: z.object({ type: z.string() }).passthrough(),
  }),
  generateInvitation: z.object({
    businessName: z.string(),
    businessEmail: z.string().email(),
  }),
  sendEmailBlast: z.object({
    subject: z.string(),
    message: z.string(),
    __token: z.string().optional(),
  }),
  sendEmailReply: z.object({
    recipientEmail: z.string().email(),
    subject: z.string(),
    message: z.string(),
  }),
  triggerZap: z.object({
    zapUrl: z.string().url(),
    payload: z.any().optional(),
  }),
};

export default toolSchemas;
