import { createContext, useContext, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { connect, runTool as runToolClient, listTools as listToolsClient } from "../mcp/client";

const McpContext = createContext();

export const McpProvider = ({ children }) => {
  const serverUrl = import.meta.env.VITE_MCP_URL;

  useEffect(() => {
    if (serverUrl) {
      connect(serverUrl).catch((err) => {
        console.error("MCP connection failed", err);
      });
    }
  }, [serverUrl]);

  const value = useMemo(
    () => ({
      serverUrl,
      runTool: (toolName, args = {}, extraHeaders) =>
        runToolClient(serverUrl, toolName, args, extraHeaders),
      listTools: (extraHeaders) => listToolsClient(serverUrl, extraHeaders),
    }),
    [serverUrl]
  );

  return <McpContext.Provider value={value}>{children}</McpContext.Provider>;
};

McpProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useMcp = () => {
  const context = useContext(McpContext);
  if (!context) {
    throw new Error("useMcp must be used within a McpProvider");
  }
  return context;
};

