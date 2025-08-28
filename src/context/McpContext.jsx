import { createContext, useContext, useEffect, useMemo } from "react";
import PropTypes from "prop-types";
import { connect, runTool as runToolClient, listTools as listToolsClient } from "../mcp/client";
import { MCP_SERVER_URL } from "../mcp/config";

const McpContext = createContext();

export const McpProvider = ({ children }) => {
  useEffect(() => {
    if (MCP_SERVER_URL) {
      connect().catch((err) => {
        console.error("MCP connection failed", err);
      });
    }
  }, []);

  const value = useMemo(
    () => ({
      runTool: (toolName, args = {}, extraHeaders) =>
        runToolClient(undefined, toolName, args, extraHeaders),
      listTools: (extraHeaders) => listToolsClient(undefined, extraHeaders),
    }),
    []
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

