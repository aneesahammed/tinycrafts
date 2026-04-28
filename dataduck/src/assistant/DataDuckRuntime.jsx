import React, { useMemo } from 'react';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { answerDataQuestion } from '../ai/analyst.js';

export function DataDuckRuntimeProvider({ children, store, settings, queryFn }) {
  const adapter = useMemo(() => ({
    async run({ messages, abortSignal }) {
      const latestUser = [...messages].reverse().find((message) => message.role === 'user');
      const question = extractText(latestUser?.content);
      const answer = await answerDataQuestion({
        question,
        storeState: store.state,
        getStoreState: () => store.state,
        settings,
        queryFn,
        abortSignal,
      });
      return { content: answer.content };
    },
  }), [store, settings, queryFn]);

  const runtime = useLocalRuntime(adapter);
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part?.type === 'text')
    .map((part) => part.text || '')
    .join('\n')
    .trim();
}
