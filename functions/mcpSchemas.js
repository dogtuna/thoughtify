import { z } from "zod";

const optionalText = z.string().transform((s) => s.trim() || undefined);
const nonEmptyText = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1));

export const contactSchema = z.object({
  id: z.string().optional(),
  name: nonEmptyText,
  role: nonEmptyText,
  email: z.string().email().optional(),
});

export const contactsSchema = z.array(contactSchema);

export const projectQuestionSchema = z.object({
  question: nonEmptyText,
  stakeholders: z.array(z.string()).optional(),
  phase: optionalText.optional(),
  contacts: z.array(z.string()).optional(),
  contactStatus: z
    .array(
      z.object({
        contactId: z.string(),
        currentStatus: nonEmptyText,
        askedAt: optionalText.optional(),
        askedBy: optionalText.optional(),
        answers: z
          .array(
            z.object({
              text: nonEmptyText,
              answeredAt: optionalText.optional(),
            })
          )
          .optional(),
      })
    )
    .optional(),
});

export const projectQuestionsSchema = z.array(projectQuestionSchema);

export const sourceMaterialSchema = z.object({
  name: nonEmptyText,
  content: nonEmptyText,
});

export const sourceMaterialsSchema = z.array(sourceMaterialSchema);

export const audienceProfileSchema = optionalText;
export const briefSchema = nonEmptyText;
export const businessGoalSchema = nonEmptyText;

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
  generateTrainingPlan: z.object({ prompt: nonEmptyText }),
  generateStudyMaterial: z.object({ topic: nonEmptyText }),
  generateCourseOutline: z.object({ topic: nonEmptyText }),
  generateAssessment: z.object({ topic: nonEmptyText }),
  generateLessonContent: z.object({ topic: nonEmptyText }),
  generateProjectQuestions: z.object({
    businessGoal: businessGoalSchema,
    audienceProfile: audienceProfileSchema.optional(),
    sourceMaterial: optionalText.optional(),
    projectConstraints: optionalText.optional(),
    keyContacts: contactsSchema.optional(),
  }),
  generateProjectBrief: z.object({
    businessGoal: businessGoalSchema,
    audienceProfile: audienceProfileSchema.optional(),
    sourceMaterial: optionalText.optional(),
    projectConstraints: optionalText.optional(),
    keyContacts: contactsSchema.optional(),
    projectQuestions: projectQuestionsSchema.optional(),
  }),
  generateStatusUpdate: z.object({
    audience: optionalText.optional(),
    today: optionalText.optional(),
    previousUpdateSummary: optionalText.optional(),
    newStakeholderAnswers: optionalText.optional(),
    newDocuments: optionalText.optional(),
    projectBaseline: optionalText.optional(),
    allOutstandingTasks: optionalText.optional(),
  }),
  generateLearningStrategy: z.object({
    projectBrief: briefSchema,
    businessGoal: optionalText.optional(),
    audienceProfile: audienceProfileSchema.optional(),
    projectConstraints: optionalText.optional(),
    keyContacts: contactsSchema.optional(),
    sourceMaterial: optionalText.optional(),
    projectQuestions: projectQuestionsSchema.optional(),
    personaCount: z.number().optional(),
  }),
  generateContentAssets: z.object({
    ldd: z.any(),
    component: optionalText.optional(),
    components: z.array(z.string()).optional(),
    jobId: optionalText.optional(),
  }),
  generateLearnerPersona: z.object({
    projectBrief: briefSchema,
    businessGoal: optionalText.optional(),
    audienceProfile: audienceProfileSchema.optional(),
    projectConstraints: optionalText.optional(),
    keyContacts: contactsSchema.optional(),
    sourceMaterial: optionalText.optional(),
    existingMotivationKeywords: z.array(z.string()).optional(),
    existingChallengeKeywords: z.array(z.string()).optional(),
    existingLearningPreferenceKeywords: z.array(z.string()).optional(),
    refreshField: optionalText.optional(),
    personaType: optionalText.optional(),
    existingTypes: z.array(z.string()).optional(),
    selectedTraits: z.array(z.string()).optional(),
  }),
  generateHierarchicalOutline: z.object({
    projectBrief: briefSchema,
    learningObjectives: z.any(),
    businessGoal: optionalText.optional(),
    audienceProfile: audienceProfileSchema.optional(),
    projectConstraints: optionalText.optional(),
    selectedModality: optionalText.optional(),
    blendModalities: z.array(z.string()).optional(),
    sourceMaterial: optionalText.optional(),
    keyContacts: contactsSchema.optional(),
  }),
  generateLearningDesignDocument: z.object({
    projectBrief: briefSchema,
    businessGoal: optionalText.optional(),
    audienceProfile: audienceProfileSchema.optional(),
    projectConstraints: optionalText.optional(),
    selectedModality: optionalText.optional(),
    blendModalities: z.array(z.string()).optional(),
    learningObjectives: z.any().optional(),
    courseOutline: optionalText.optional(),
    trainingPlan: optionalText.optional(),
    sourceMaterial: optionalText.optional(),
    keyContacts: contactsSchema.optional(),
  }),
  generateStoryboard: z.object({
    topic: nonEmptyText,
    targetAudience: optionalText.optional(),
  }),
  generateInitialInquiryMap: z.object({
    brief: briefSchema,
    uid: nonEmptyText,
    initiativeId: nonEmptyText,
    documents: optionalText.optional(),
    answers: optionalText.optional(),
  }),
  generateAvatar: z.object({
    name: nonEmptyText,
    motivation: optionalText.optional(),
    challenges: optionalText.optional(),
    ageRange: optionalText.optional(),
    techProficiency: optionalText.optional(),
    educationLevel: optionalText.optional(),
    learningPreferences: optionalText.optional(),
    seedExtra: optionalText.optional(),
  }),
  savePersona: z.object({
    initiativeId: nonEmptyText,
    personaId: nonEmptyText,
    persona: z.object({ type: nonEmptyText }).passthrough(),
  }),
  generateInvitation: z.object({
    businessName: nonEmptyText,
    businessEmail: z.string().email(),
  }),
  sendEmailBlast: z.object({
    subject: nonEmptyText,
    message: nonEmptyText,
    __token: optionalText.optional(),
  }),
  sendEmailReply: z.object({
    recipientEmail: z.string().email(),
    subject: nonEmptyText,
    message: nonEmptyText,
  }),
  triggerZap: z.object({
    zapUrl: z.string().url(),
    payload: z.any().optional(),
  }),
};

export default toolSchemas;
