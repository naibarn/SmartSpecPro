import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";

export interface ChatTab {
  id: string;
  name: string;
  branch: string;
  createdAt: number;
  updatedAt: number;
  workflowId?: string;
  conversationHistory: ConversationMessage[];
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  workflowName?: string;
  executionId?: string;
}

interface TabContextType {
  tabs: ChatTab[];
  activeTabId: string | null;
  activeTab: ChatTab | null;
  createTab: (name?: string, branch?: string) => string;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;
  addMessage: (tabId: string, message: Omit<ConversationMessage, "id" | "timestamp">) => void;
  clearTabHistory: (tabId: string) => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<ChatTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Initialize with one tab
  useEffect(() => {
    const savedTabs = localStorage.getItem("smartspec_tabs");
    const savedActiveId = localStorage.getItem("smartspec_active_tab");

    if (savedTabs) {
      try {
        const parsed = JSON.parse(savedTabs);
        setTabs(parsed);
        setActiveTabId(savedActiveId || parsed[0]?.id || null);
      } catch (e) {
        // Create default tab if parsing fails
        const defaultTab = createDefaultTab();
        setTabs([defaultTab]);
        setActiveTabId(defaultTab.id);
      }
    } else {
      // Create default tab
      const defaultTab = createDefaultTab();
      setTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
    }
  }, []);

  // Save to localStorage whenever tabs change
  useEffect(() => {
    if (tabs.length > 0) {
      localStorage.setItem("smartspec_tabs", JSON.stringify(tabs));
    }
  }, [tabs]);

  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem("smartspec_active_tab", activeTabId);
    }
  }, [activeTabId]);

  const createDefaultTab = (): ChatTab => {
    return {
      id: uuidv4(),
      name: "Main",
      branch: "main",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      conversationHistory: [],
    };
  };

  const createTab = (name?: string, branch?: string): string => {
    const newTab: ChatTab = {
      id: uuidv4(),
      name: name || `Chat ${tabs.length + 1}`,
      branch: branch || `smartspec/chat-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      conversationHistory: [],
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    return newTab.id;
  };

  const closeTab = (tabId: string) => {
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== tabId);
      
      // If closing active tab, switch to another
      if (tabId === activeTabId) {
        const index = prev.findIndex((t) => t.id === tabId);
        const newActiveTab = filtered[index] || filtered[index - 1] || filtered[0];
        setActiveTabId(newActiveTab?.id || null);
      }

      // Don't allow closing last tab
      if (filtered.length === 0) {
        const defaultTab = createDefaultTab();
        setActiveTabId(defaultTab.id);
        return [defaultTab];
      }

      return filtered;
    });
  };

  const switchTab = (tabId: string) => {
    setActiveTabId(tabId);
  };

  const renameTab = (tabId: string, name: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? { ...tab, name, updatedAt: Date.now() }
          : tab
      )
    );
  };

  const addMessage = (
    tabId: string,
    message: Omit<ConversationMessage, "id" | "timestamp">
  ) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              conversationHistory: [
                ...tab.conversationHistory,
                {
                  ...message,
                  id: uuidv4(),
                  timestamp: Date.now(),
                },
              ],
              updatedAt: Date.now(),
            }
          : tab
      )
    );
  };

  const clearTabHistory = (tabId: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? { ...tab, conversationHistory: [], updatedAt: Date.now() }
          : tab
      )
    );
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  return (
    <TabContext.Provider
      value={{
        tabs,
        activeTabId,
        activeTab,
        createTab,
        closeTab,
        switchTab,
        renameTab,
        addMessage,
        clearTabHistory,
      }}
    >
      {children}
    </TabContext.Provider>
  );
}

export function useTabs() {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error("useTabs must be used within TabProvider");
  }
  return context;
}
