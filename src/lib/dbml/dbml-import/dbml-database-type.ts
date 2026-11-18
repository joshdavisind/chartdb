import { DatabaseType } from '@/lib/domain/database-type';

const databaseTypeAliases: Array<[RegExp, DatabaseType]> = [
    [/^(postgres|postgresql|pg)$/, DatabaseType.POSTGRESQL],
    [/^mysql$/, DatabaseType.MYSQL],
    [/^mariadb$/, DatabaseType.MARIADB],
    [/^(sqlserver|mssql|microsoftsqlserver)$/, DatabaseType.SQL_SERVER],
    [/^sqlite3?$/, DatabaseType.SQLITE],
    [/^oracle$/, DatabaseType.ORACLE],
    [/^clickhouse$/, DatabaseType.CLICKHOUSE],
    [/^(cockroach|cockroachdb)$/, DatabaseType.COCKROACHDB],
    [/^generic$/, DatabaseType.GENERIC],
];

/**
 * Reads `database_type` from a DBML `Project { ... }` block. Falls back to
 * `fallback` when the block or setting is missing or unrecognized.
 */
export const detectDatabaseTypeFromDBML = (
    content: string,
    fallback: DatabaseType = DatabaseType.POSTGRESQL
): DatabaseType => {
    const match = content.match(
        /Project\b[^{]*\{[\s\S]*?database_type\s*:\s*(['"])([^'"]+)\1/i
    );
    if (!match) return fallback;

    const normalized = match[2].toLowerCase().replace(/[\s_-]/g, '');
    return (
        databaseTypeAliases.find(([pattern]) =>
            pattern.test(normalized)
        )?.[1] ?? fallback
    );
};
