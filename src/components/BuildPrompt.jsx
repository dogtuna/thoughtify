// buildPrompt.js
import { questionReference } from "./QuestionReference";

export const buildGeminiPrompt = (progressData) => {
  let prompt = "Below are the responses from a leadership assessment. Based on these answers, please draft a comprehensive training plan addressing the key areas of improvement:\n\n";
  
  for (const step in questionReference) {
    prompt += `Step ${parseInt(step) + 1}:\n`;
    const questions = questionReference[step];
    const answers = progressData[step] || {};
    
    // Special handling for step 2 (team-level data)
    if (step === "2" && answers.teams && Array.isArray(answers.teams)) {
      // Assume questionReference[2] is an array with one object template
      const teamQuestionsTemplate = questions.teams[0];
      
      answers.teams.forEach((team) => {
        // Display the team name first, bolded.
        prompt += `**${team.teamName}**\n\n`;
        // Loop through each key in the team question template.
        for (const key in teamQuestionsTemplate) {
          // Skip the teamName key since it was already displayed.
          if (key === "teamName") continue;
          const questionText = teamQuestionsTemplate[key];
          const teamAnswer = team[key] !== undefined && team[key] !== "" ? team[key] : "[No answer provided]";
          prompt += `${questionText}\nAnswer: ${teamAnswer}\n\n`;
        }
        prompt += "\n";
      });
    } else {
      // Process non-team (non-array) questions.
      for (const key in questions) {
        const questionValue = questions[key];
        // If the question value is an object (nested group), iterate its keys.
        if (typeof questionValue === "object" && questionValue !== null) {
          for (const nestedKey in questionValue) {
            const nestedQuestionText = questionValue[nestedKey];
            const nestedAnswer = answers[key] && answers[key][nestedKey] !== undefined 
                                  ? answers[key][nestedKey] 
                                  : "[No answer provided]";
            prompt += `${nestedQuestionText}\nAnswer: ${nestedAnswer}\n\n`;
          }
        } else {
          const answer = answers[key] !== undefined && answers[key] !== "" ? answers[key] : "[No answer provided]";
          prompt += `${questionValue}\nAnswer: ${answer}\n\n`;
        }
      }
    }
    prompt += "\n";
  }
  
  prompt += "Based on the above responses, please analyze the assessment and draft a tailored training and development plan for this organization.";
  
  return prompt;
};

