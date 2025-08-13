import { createContext, useContext, useState, useCallback } from "react";
import PropTypes from "prop-types";

const ProjectContext = createContext();

const defaultState = {
  courseOutline: "",
  modules: [],
  selectedModule: "",
  lessonContent: "",
  storyboard: "",
  assessment: "",
  learningObjectives: null,
  learningDesignDocument: "",
  draftContent: {},
  mediaAssets: [],
};

export const ProjectProvider = ({ children }) => {
  const [courseOutline, setCourseOutline] = useState(defaultState.courseOutline);
  const [modules, setModules] = useState(defaultState.modules);
  const [selectedModule, setSelectedModule] = useState(
    defaultState.selectedModule
  );
  const [lessonContent, setLessonContent] = useState(
    defaultState.lessonContent
  );
  const [storyboard, setStoryboard] = useState(defaultState.storyboard);
  const [assessment, setAssessment] = useState(defaultState.assessment);
  const [learningObjectives, setLearningObjectives] = useState(
    defaultState.learningObjectives
  );
  const [learningDesignDocument, setLearningDesignDocument] = useState(
    defaultState.learningDesignDocument
  );
  const [draftContent, setDraftContent] = useState(defaultState.draftContent);
  const [mediaAssets, setMediaAssets] = useState(defaultState.mediaAssets);

  const resetProject = useCallback(() => {
    setCourseOutline(defaultState.courseOutline);
    setModules(defaultState.modules);
    setSelectedModule(defaultState.selectedModule);
    setLessonContent(defaultState.lessonContent);
    setStoryboard(defaultState.storyboard);
    setAssessment(defaultState.assessment);
    setLearningObjectives(defaultState.learningObjectives);
    setLearningDesignDocument(defaultState.learningDesignDocument);
    setDraftContent(defaultState.draftContent);
    setMediaAssets(defaultState.mediaAssets);
  }, []);

  const value = {
    courseOutline,
    setCourseOutline,
    modules,
    setModules,
    selectedModule,
    setSelectedModule,
    lessonContent,
    setLessonContent,
    storyboard,
    setStoryboard,
    assessment,
    setAssessment,
    learningObjectives,
    setLearningObjectives,
    learningDesignDocument,
    setLearningDesignDocument,
    draftContent,
    setDraftContent,
    mediaAssets,
    setMediaAssets,
    resetProject,
  };

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
};

ProjectProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useProject = () => useContext(ProjectContext);
