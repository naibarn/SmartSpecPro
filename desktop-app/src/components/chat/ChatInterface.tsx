// Chat Interface Component
// Main chat UI with message list, input, and context panel

import { useState, useRef, useEffect } from 'react';
import { useChat, ChatMessage, formatTokenCount, getCategoryIcon, getCategoryColor } from '../../services/chatService';
import { MediaGenerationPanel } from './MediaGenerationPanel';

interface ChatInterfaceProps {
  className?: string;
}

export function ChatInterface({ className = '' }: ChatInterfaceProps) {
  const {
    currentSession,
    messages,
    sendMessage,
    isLoading,
    selectedModel,
    availableModels,
    setSelectedModel,
    pinnedMemory,
    retrievedContext,
    skills,
    activeSkill,
    setActiveSkill,
    createSession,
  } = useChat();

  const [inputValue, setInputValue] = useState('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;
    
    // Create session if needed
    if (!currentSession) {
      await createSession('New Chat');
    }
    
    const message = inputValue;
    setInputValue('');
    await sendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSkillCommand = (command: string) => {
    setInputValue(command + ' ');
    inputRef.current?.focus();
    setShowSkillSelector(false);
  };

  return (
    <div className={`flex flex-col h-full bg-gray-50 dark:bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {currentSession?.title || 'New Chat'}
          </h2>
          {activeSkill && (
            <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
              {activeSkill.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Model Selector */}
          <div className="relative">
            <button
              onClick={() => setShowModelSelector(!showModelSelector)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <span className="text-gray-700 dark:text-gray-300">{selectedModel?.name || 'Select Model'}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showModelSelector && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowModelSelector(false)} />
                <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto">
                  {availableModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => { setSelectedModel(model); setShowModelSelector(false); }}
                      className={`w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${selectedModel?.id === model.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{model.name}</div>
                      <div className="text-xs text-gray-500">{formatTokenCount(model.context_length)} context</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Context Panel (if context retrieved) */}
          {retrievedContext.length > 0 && (
            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{retrievedContext.length} relevant context items found</span>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 ? (
              <EmptyState onSkillSelect={handleSkillCommand} skills={skills} />
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))
            )}
            {isLoading && <LoadingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            {/* Skill Buttons */}
            <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-2">
              {skills.map((skill) => (
                <button
                  key={skill.command}
                  onClick={() => handleSkillCommand(skill.command)}
                  className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                    activeSkill?.name === skill.name
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {skill.command}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... or use /command"
                  rows={1}
                  className="w-full px-4 py-3 pr-12 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-500"
                />
              </div>
              <button
                onClick={() => setShowMediaPanel(true)}
                title="Generate Image, Video, or Audio"
                className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Media Generation Panel */}
        {showMediaPanel && (
          <MediaGenerationPanel
            onClose={() => setShowMediaPanel(false)}
            chatContext={inputValue}
          />
        )}

        {/* Sidebar - Pinned Memory */}
        {pinnedMemory.length > 0 && (
          <div className="w-64 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto hidden lg:block">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Pinned Context</h3>
              <div className="space-y-2">
                {pinnedMemory.map((item) => (
                  <div
                    key={item.id}
                    className="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{getCategoryIcon(item.category)}</span>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{item.title}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Message Bubble Component
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        {message.skill && !isUser && (
          <div className="mb-1 text-xs text-blue-600 dark:text-blue-400">
            Using {message.skill} skill
          </div>
        )}
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-blue-600 text-white rounded-br-md'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-bl-md'
          }`}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
        <div className={`mt-1 text-xs text-gray-500 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timestamp.toLocaleTimeString()}
          {message.tokens && ` · ${message.tokens} tokens`}
        </div>
      </div>
    </div>
  );
}

// Empty State Component
function EmptyState({ onSkillSelect, skills }: { onSkillSelect: (cmd: string) => void; skills: any[] }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Start a conversation</h3>
      <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
        Ask questions about your project, get help with specifications, or manage your knowledge base.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {skills.map((skill) => (
          <button
            key={skill.command}
            onClick={() => onSkillSelect(skill.command)}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <span className="font-medium">{skill.command}</span>
            <span className="ml-2 text-gray-500">{skill.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Loading Indicator
function LoadingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;
