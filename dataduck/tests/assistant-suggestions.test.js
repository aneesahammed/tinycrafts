import { describe, expect, it } from 'vitest';
import { buildAssistantSuggestions, FALLBACK_SUGGESTIONS } from '../src/assistant/AssistantApp.jsx';

describe('assistant suggestions', () => {
  it('builds contextual prompts from the active table schema and summary', () => {
    const suggestions = buildAssistantSuggestions({
      activeTable: 'sales',
      files: new Map([
        [
          'sales',
          {
            profile: {
              schema: [
                { column_name: 'order_date', column_type: 'DATE' },
                { column_name: 'region', column_type: 'VARCHAR' },
                { column_name: 'total_amount', column_type: 'DOUBLE' },
                { column_name: 'discount_amount', column_type: 'DOUBLE' },
                { column_name: 'customer_email', column_type: 'VARCHAR' },
              ],
            },
            summary: new Map([
              ['customer_email', { nullCount: 12 }],
            ]),
          },
        ],
      ]),
    });

    expect(suggestions).toEqual([
      'Which region values have the highest average total_amount?',
      'How does total_amount change over order_date?',
      'Which columns have missing values, especially customer_email?',
    ]);
  });

  it('falls back to static prompts when schema context is unavailable', () => {
    expect(buildAssistantSuggestions({ activeTable: null, files: new Map() })).toEqual(FALLBACK_SUGGESTIONS);
    expect(buildAssistantSuggestions({ activeTable: 'empty', files: new Map([['empty', { profile: {} }]]) })).toEqual(
      FALLBACK_SUGGESTIONS,
    );
  });
});
