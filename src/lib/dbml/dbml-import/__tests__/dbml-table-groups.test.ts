import { describe, it, expect } from 'vitest';
import { importDBMLToDiagram } from '../dbml-import';
import { extractTableGroups } from '../dbml-table-groups';
import { DatabaseType } from '@/lib/domain/database-type';
import { getTableDimensions } from '@/lib/domain/db-table';

const dbml = `
Table users {
  id int [pk]
}
Table customers {
  id int [pk]
  user_id int [ref: - users.id]
}
Table orders {
  id int [pk]
  customer_id int [ref: > customers.id]
}
Table payments {
  id int [pk]
  order_id int [ref: > orders.id]
}
Table audit_log {
  id int [pk]
}

TableGroup identity [color: #5B8DEF, note: 'People and accounts'] {
  users
  customers
  Note: 'Who is who'
}

TableGroup "sales" {
  public.orders // main fact table
  "payments"
}
`;

describe('DBML TableGroup import', () => {
    it('extracts groups with names, colors and members', () => {
        const { content, tableGroups } = extractTableGroups(dbml);

        expect(content).not.toContain('TableGroup');
        expect(tableGroups).toEqual([
            {
                name: 'identity',
                color: '#5b8def',
                tables: [{ name: 'users' }, { name: 'customers' }],
            },
            {
                name: 'sales',
                color: undefined,
                tables: [
                    { schema: 'public', name: 'orders' },
                    { name: 'payments' },
                ],
            },
        ]);
    });

    it('expands 3-digit hex colors', () => {
        const { tableGroups } = extractTableGroups(
            'TableGroup g [color: #abc] {\n  t\n}'
        );
        expect(tableGroups[0].color).toBe('#aabbcc');
    });

    it('creates one area per group and places member tables inside it', async () => {
        const diagram = await importDBMLToDiagram(dbml, {
            databaseType: DatabaseType.POSTGRESQL,
        });

        expect(diagram.tables).toHaveLength(5);
        expect(diagram.relationships).toHaveLength(3);
        expect(diagram.areas?.map((a) => a.name)).toEqual([
            'identity',
            'sales',
        ]);

        const [identity, sales] = diagram.areas!;
        expect(identity.color).toBe('#5b8def');
        expect(sales.color).toMatch(/^#[0-9a-f]{6}$/);

        const byName = (name: string) =>
            diagram.tables!.find((t) => t.name === name)!;

        for (const [area, names] of [
            [identity, ['users', 'customers']],
            [sales, ['orders', 'payments']],
        ] as const) {
            for (const name of names) {
                const table = byName(name);
                const { width, height } = getTableDimensions(table);
                expect(table.parentAreaId).toBe(area.id);
                expect(table.color).toBe(area.color);
                expect(table.x).toBeGreaterThanOrEqual(area.x);
                expect(table.y).toBeGreaterThanOrEqual(area.y);
                expect(table.x + width).toBeLessThanOrEqual(
                    area.x + area.width
                );
                expect(table.y + height).toBeLessThanOrEqual(
                    area.y + area.height
                );
            }
        }

        // Areas don't overlap
        expect(identity.x + identity.width).toBeLessThan(sales.x);

        // Ungrouped tables sit below every area
        const audit = byName('audit_log');
        expect(audit.parentAreaId).toBeUndefined();
        expect(audit.y).toBeGreaterThan(
            Math.max(...diagram.areas!.map((a) => a.y + a.height))
        );
    });

    it('returns no areas when the DBML has no groups', async () => {
        const diagram = await importDBMLToDiagram('Table t {\n  id int\n}', {
            databaseType: DatabaseType.POSTGRESQL,
        });
        expect(diagram.areas).toBeUndefined();
    });

    it('ignores group members that are not tables', async () => {
        const diagram = await importDBMLToDiagram(
            'Table t {\n  id int\n}\nTableGroup g {\n  t\n  missing\n}',
            { databaseType: DatabaseType.POSTGRESQL }
        );
        expect(diagram.areas).toHaveLength(1);
        expect(diagram.tables![0].parentAreaId).toBe(diagram.areas![0].id);
    });
});
