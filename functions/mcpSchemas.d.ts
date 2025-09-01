import { z } from "zod";
import toolSchemas, {
  contactSchema,
  contactsSchema,
  projectQuestionSchema,
  projectQuestionsSchema,
  sourceMaterialSchema,
  sourceMaterialsSchema,
  audienceProfileSchema,
  briefSchema,
  businessGoalSchema,
} from "./mcpSchemas.js";

export { contactSchema, contactsSchema, projectQuestionSchema, projectQuestionsSchema, sourceMaterialSchema, sourceMaterialsSchema, audienceProfileSchema, briefSchema, businessGoalSchema };

export type Contact = z.infer<typeof contactSchema>;
export type Contacts = z.infer<typeof contactsSchema>;
export type ProjectQuestion = z.infer<typeof projectQuestionSchema>;
export type ProjectQuestions = z.infer<typeof projectQuestionsSchema>;
export type SourceMaterial = z.infer<typeof sourceMaterialSchema>;
export type SourceMaterials = z.infer<typeof sourceMaterialsSchema>;
export type AudienceProfile = z.infer<typeof audienceProfileSchema>;
export type Brief = z.infer<typeof briefSchema>;
export type BusinessGoal = z.infer<typeof businessGoalSchema>;

export default toolSchemas;
