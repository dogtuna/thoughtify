// questionReference.js
export const questionReference = {
    // Step 0: Organizational Vision & Mission
    0: {
      hasMission: "Do you have a mission statement?",
      missionStatement: "Mission statement",
      missionClarity: "On a scale from 1 (Not Clear) to 5 (Very Clear), how clear is your mission statement?",
      missionFollowUp: "Which aspects of your mission are unclear? (Select all that apply: Purpose, Goals, Impact, Target Audience, Core Values)",
      hasCoreValues: "Do you have core values?",
      coreValuesList: "Core Values",
      coreValuesOther: "Other obstacles in aligning core values with strategies",
      coreValuesAlignment: "To what extent do you agree: 'Our core values effectively drive our strategic decisions.' (1 = Strongly Disagree, 5 = Strongly Agree)",
      coreValuesFollowUp: "What obstacles do you face aligning your core values with your strategies? (Select all that apply: Communication, Leadership, Organizational Culture, Lack of Training, Other)",
      visionConfidence: "How confident are you that your organization’s vision for the next 3–5 years is well defined? (1 = Not Confident, 5 = Very Confident)",
      visionFollowUp: "What additional information would help clarify your vision? (Select all that apply: Market Research, Stakeholder Input, Expert Consultation, Environmental Scanning, Unknown)",
      strategicObjectives: "Rate the alignment between your strategic objectives (e.g., market expansion, innovation, customer focus) and your organizational vision. (1 = Not Aligned, 5 = Fully Aligned)",
      objectivesFollowUp: "Please specify key areas of misalignment.",
      kpiList: "What KPIs are most important to you? (Comma-separated)",
      successMetrics: "How effective are your current success metrics (KPIs, financial metrics, customer feedback)? (1 = Ineffective, 5 = Highly Effective)",
      metricsFollowUp: "What areas do you most need to improve your ability to gauge success? (e.g., clarity on customer feedback, real-time data, etc.)",
      communication: "How effectively are your vision, mission, and strategic objectives communicated? (1 = Not Effective, 5 = Very Effective)",
      communicationFollowUp: "Which channels or strategies could improve communication? (Select all that apply: Town Halls, Digital Dashboards, Internal Newsletters, Other)",
      communicationOther: "Additional channels or strategies that could improve communication"
    },
    // Step 1: Strategic Business Drivers & Challenges
    1: {
        // Main Satisfaction Questions
        customerSatisfaction: "Rate your satisfaction with customer relationships. (1 = Low, 5 = High)",
        productSatisfaction: "Rate your satisfaction with product/service quality. (1 = Low, 5 = High)",
        efficiencySatisfaction: "Rate your satisfaction with operational efficiency. (1 = Low, 5 = High)",
        innovationSatisfaction: "Rate your satisfaction with innovation. (1 = Low, 5 = High)",
        marketAdaptabilitySatisfaction: "Rate your satisfaction with market adaptability. (1 = Low, 5 = High)",
        trendInfluence: "How strongly do external trends (e.g., digital transformation, regulatory shifts, market disruptions) influence your strategy? (1 = Not at all, 5 = Significantly)",
        competitiveAdvantage: "How would you rate your organization’s ability to leverage its competitive advantages? (1 = Not well, 5 = Very well)",
    
        // Follow-Up Questions for Drivers (converted to array)
        driversFollowUp: {
            "Customer Relationships": "What challenges or gaps do you perceive in customer relationships? (e.g., resource constraints, process issues)",
            "Product/Service Quality": "What challenges or gaps do you perceive in product/service quality? (e.g., resource constraints, process issues)",
            "Operational Efficiency": "What challenges or gaps do you perceive in operational efficiency? (e.g., resource constraints, process issues)",
            "Innovation": "What challenges or gaps do you perceive in innovation? (e.g., resource constraints, process issues)",
            "Market Adaptability": "What challenges or gaps do you perceive in market adaptability? (e.g., resource constraints, process issues)"
          },
    
        // Follow-Up Questions for External Trends & Competitive Advantage
        trendDetails: "Which trends or external factors have the most significant impact on your business? Please share any specific observations.",
        competitiveDetails: "What challenges do you face in building or sustaining a competitive edge? (e.g., market positioning, resource allocation)",
    
        // Support Areas Questions (converted to array)
        supportAreas: {
            "Customer Engagement": "For Customer Engagement, how urgently does your organization need additional support? (1 = Low urgency, 5 = High urgency)",
          "Processes": "For Processes, how urgently does your organization need additional support? (1 = Low urgency, 5 = High urgency)",
          "Talent/HR":"For Talent/HR, how urgently does your organization need additional support? (1 = Low urgency, 5 = High urgency)",
          "Technology":"For Technology, how urgently does your organization need additional support? (1 = Low urgency, 5 = High urgency)"
          },
    
        // Support Details Questions (converted to array)
        supportDetails: {
            "Customer Engagement":"What specific challenges or constraints do you encounter in Customer Engagement?",
            "Processes": "What specific challenges or constraints do you encounter in Processes?",
            "Talent/HR": "What specific challenges or constraints do you encounter in Talent/HR?",
            "Technology":"What specific challenges or constraints do you encounter in Technology?",
      },
    },
    // Step 2: Team-Level Strategic Alignment
    2: {
        teams: [
          {
            "teamName": "Team Name (enter the team name)",
            "objectiveClarity": "How clear are the strategic objectives for this team? (1 = Not clear at all, 5 = Very clear)",
            "objectivesFollowUp": "Please specify which aspects of the objectives are unclear.",
            "roleClarity": "How clear are the roles and responsibilities within this team? (1 = Very unclear, 5 = Very clear)",
            "roleFollowUp": "Which roles or responsibilities are most ambiguous?",
            "collaboration": "How effective is collaboration within this team and with other teams? (1 = Not effective, 5 = Very effective)",
            "collaborationFollowUp": "Please describe the collaboration challenges.",
            "empowerment": "How empowered is your team to make decisions related to its strategic objectives? (1 = Not empowered, 5 = Fully empowered)",
            "empowermentFollowUp": "What barriers prevent your team from taking more autonomous decisions?",
            "alignment": "How well do this team’s objectives align with the organization’s overall strategic vision? (1 = Not aligned, 5 = Fully aligned)",
            "alignmentFollowUp": "What specific factors contribute to the misalignment?",
            "resourceAdequacy": "Do you feel your team has sufficient resources (time, budget, personnel) to achieve its strategic objectives? (1 = Not sufficient, 5 = Very sufficient)",
            "resourceFollowUp": "Which specific resources or support would enable your team to perform better?",
            "communication": "How effective is communication within the team regarding strategic goals and performance feedback? (1 = Not effective, 5 = Very effective)",
            "communicationFollowUp": "What improvements in communication channels or processes would help your team operate more effectively?",
            "trainingNeeds": "Are there any specific skills or competencies that your team needs to enhance to better meet its strategic goals? (Yes/No)",
            "trainingSkills": "If yes, please list the specific skills or competencies.",
            "hasTrainingProgram": "Do you currently have any training programs in place to develop these skills? (Yes/No)",
            "trainingProgramFeedback": "If yes, what improvements would you make to these training programs, or what factors have limited their success?"
          }
        ]
      },
    // Step 3: Current State vs. Desired Future State
    3: {
      currentPerformance: "How would you rate your organization's current performance in terms of skills, processes, and outcomes? (1 = Poor, 5 = Excellent)",
      currentPerformanceFollowUp: "Please specify which specific areas are underperforming.",
      gapAnalysis: "How significant are the gaps between your current state and your desired future state? (1 = Minor, 5 = Major)",
      gapAnalysisFollowUp: "Please indicate which areas (e.g., skills, technology, processes) need the most improvement.",
      opportunityAssessment: "How well positioned is your organization to capitalize on opportunities for improvement? (1 = Not well positioned, 5 = Very well positioned)",
      opportunityFollowUp: "What have been the primary obstacles or root causes that have hindered your ability to capitalize on opportunities? Please describe any initiatives you've tried that did not deliver the desired results.",
      futureReadiness: "How prepared is your organization to adapt to unforeseen challenges in the future? (1 = Not prepared, 5 = Very prepared)",
      futureReadinessFollowUp: "What are the main factors or past initiatives that have limited your organization's readiness? Please describe any measures you've tried that fell short and why you think they were ineffective."
    },
    // Step 4: Development Needs and Preferences (Training & Development)
    4: {
      programEffectiveness: "How effective are your current training and development programs in addressing your organizational needs? (1 = Not effective, 5 = Highly effective)",
      programEffectivenessFollowUp: "What have been the primary challenges or root causes that limited the effectiveness of your training programs? (e.g., content relevance, engagement, delivery method)",
      ongoingImportance: "How important do you consider ongoing training and development for maintaining a competitive advantage? (1 = Not important, 5 = Critical)",
      ongoingImportanceFollowUp: "Which training areas do you believe are most crucial for your organization? (e.g., technical skills, leadership, customer service)",
      currentMethodologies: "Which training methodologies do you currently use? (Select all that apply: In-person training, Online courses, Blended learning, Workshops, Mentoring, Webinars, Self-paced modules, Coaching, Other)",
      deliverySatisfaction: "How satisfied are you with the variety of training delivery methods currently offered? (1 = Not satisfied, 5 = Very satisfied)",
      needsIdentification: "How well do you think your organization identifies and addresses individual and team-specific training needs? (1 = Not well, 5 = Very well)",
      needsIdentificationFollowUp: "What challenges have you encountered in assessing and addressing training needs?",
      experimentedMethods: "Have you experimented with different training approaches or methods in the past? (Yes/No)",
      experimentedMethodsFollowUp: "If yes, what have been the most and least effective approaches, and what do you think were the key factors influencing their success or failure?"
    }
  };
  