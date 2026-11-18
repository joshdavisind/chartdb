import { describe, it, expect } from 'vitest';
import { detectDatabaseTypeFromDBML } from '../dbml-database-type';
import { DatabaseType } from '@/lib/domain/database-type';

describe('detectDatabaseTypeFromDBML', () => {
    it.each([
        ["'PostgreSQL'", DatabaseType.POSTGRESQL],
        ["'MySQL'", DatabaseType.MYSQL],
        ['"SQL Server"', DatabaseType.SQL_SERVER],
        ["'sqlite'", DatabaseType.SQLITE],
        ["'Oracle'", DatabaseType.ORACLE],
    ])('reads database_type %s from the Project block', (value, expected) => {
        const dbml = `Project shop {\n  database_type: ${value}\n  Note: 'x'\n}\nTable t {\n  id int\n}`;
        expect(detectDatabaseTypeFromDBML(dbml)).toBe(expected);
    });

    it('falls back when there is no Project block', () => {
        expect(detectDatabaseTypeFromDBML('Table t {\n  id int\n}')).toBe(
            DatabaseType.POSTGRESQL
        );
    });

    it('falls back on an unknown database type', () => {
        expect(
            detectDatabaseTypeFromDBML(
                "Project p {\n  database_type: 'Snowflake'\n}",
                DatabaseType.GENERIC
            )
        ).toBe(DatabaseType.GENERIC);
    });
});
