import { createContext, useContext, useState } from "react";
import PropTypes from "prop-types";

const ProjectContext = createContext();

export const ProjectProvider = ({ children }) => {
  const [courseOutline, setCourseOutline] = useState("");
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [storyboard, setStoryboard] = useState("");
  const [assessment, setAssessment] = useState("");
  const [learningObjectives, setLearningObjectives] = useState(null);

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
  };

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
};

ProjectProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useProject = () => useContext(ProjectContext);
