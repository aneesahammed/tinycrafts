import { describe, expect, it } from 'vitest';
import { formatSql } from './sql';

describe('formatSql', () => {
  it('formats common query clauses without running or changing the query', () => {
    expect(formatSql('select id,email from users where email = \'select from\' order by id;')).toBe("SELECT\n  id, email\nFROM users\nWHERE email = 'select from'\nORDER BY id;");
  });

  it('preserves quoted identifiers and comments verbatim', () => {
    expect(formatSql('select "from" -- from stays a comment\nfrom [users];')).toBe('SELECT\n  "from" -- from stays a comment\nFROM [users];');
  });
});
