import type { Area } from '@/lib/domain/area';
import type { DBTable } from '@/lib/domain/db-table';
import { getTableDimensions } from '@/lib/domain/db-table';
import { colorOptions } from '@/lib/colors';
import { generateId } from '@/lib/utils';

export interface DBMLTableGroupMember {
    schema?: string;
    name: string;
}

export interface DBMLTableGroup {
    name: string;
    color?: string;
    tables: DBMLTableGroupMember[];
}

// Matches a `TableGroup <name> [settings] {` header. The name may be bare,
// quoted, or schema-qualified.
const tableGroupHeaderPattern =
    /TableGroup\s+((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)\s*(\[[^\]]*\])?\s*\{/g;

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, '$1');

const findClosingBrace = (str: string, openIndex: number): number => {
    let depth = 0;
    let quote: string | null = null;
    for (let i = openIndex; i < str.length; i++) {
        const ch = str[i];
        if (quote) {
            if (ch === '\\') i++;
            else if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') quote = ch;
        else if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
};

const normalizeHexColor = (color: string): string | undefined => {
    const hex = color.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
        return `#${hex
            .split('')
            .map((c) => c + c)
            .join('')
            .toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
    return undefined;
};

const parseMember = (line: string): DBMLTableGroupMember | undefined => {
    const match = line.match(
        /^((?:"[^"]+"|[\w]+))(?:\.((?:"[^"]+"|[\w]+)))?\s*(?:\/\/.*)?$/
    );
    if (!match) return undefined;
    if (match[2]) return { schema: unquote(match[1]), name: unquote(match[2]) };
    return { name: unquote(match[1]) };
};

/**
 * Pulls `TableGroup` blocks out of DBML source. Returns the source with the
 * blocks removed (the import pipeline parses the rest) plus the groups found.
 */
export const extractTableGroups = (
    content: string
): { content: string; tableGroups: DBMLTableGroup[] } => {
    const tableGroups: DBMLTableGroup[] = [];
    const ranges: Array<[number, number]> = [];

    tableGroupHeaderPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = tableGroupHeaderPattern.exec(content)) !== null) {
        const openIndex = match.index + match[0].length - 1;
        const closeIndex = findClosingBrace(content, openIndex);
        if (closeIndex === -1) break;

        const settings = match[2] ?? '';
        const colorMatch = settings.match(/color\s*:\s*(#[0-9a-fA-F]{3,6})/);
        const body = content
            .slice(openIndex + 1, closeIndex)
            // Drop multi-line `Note { ... }` blocks and `Note: '...'` lines.
            .replace(/Note\s*\{[\s\S]*?\}/g, '')
            .replace(/Note\s*:\s*('''[\s\S]*?'''|'[^']*'|"[^"]*")/g, '');

        const tables = body
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith('//'))
            .map(parseMember)
            .filter((m): m is DBMLTableGroupMember => m !== undefined);

        tableGroups.push({
            name: unquote(match[1].split('.').pop() ?? match[1]),
            color: colorMatch ? normalizeHexColor(colorMatch[1]) : undefined,
            tables,
        });
        ranges.push([match.index, closeIndex + 1]);
        tableGroupHeaderPattern.lastIndex = closeIndex + 1;
    }

    let stripped = content;
    for (const [start, end] of [...ranges].reverse()) {
        stripped = stripped.slice(0, start) + stripped.slice(end);
    }

    return { content: stripped, tableGroups };
};

const AREA_PADDING = 40;
const AREA_HEADER = 40;
const TABLE_GAP = 60;
const AREA_GAP = 120;
const AREAS_PER_ROW = 3;

/**
 * Turns table groups into ChartDB areas: each group's tables are laid out in
 * a grid inside a colored area, groups flow left to right, and ungrouped
 * tables go in a grid below. Mutates table positions, colors and
 * parentAreaId; returns the areas.
 */
export const applyTableGroupsLayout = ({
    tables,
    tableGroups,
    defaultSchema,
}: {
    tables: DBTable[];
    tableGroups: DBMLTableGroup[];
    defaultSchema?: string;
}): Area[] => {
    if (tableGroups.length === 0) return [];

    const normalizeSchema = (schema?: string) =>
        !schema || schema === 'public' ? defaultSchema : schema;

    const assigned = new Set<string>();
    const groups = tableGroups
        .map((group) => {
            const members = group.tables
                .map((member) =>
                    tables.find(
                        (t) =>
                            !assigned.has(t.id) &&
                            t.name === member.name &&
                            (member.schema === undefined ||
                                normalizeSchema(t.schema ?? undefined) ===
                                    normalizeSchema(member.schema))
                    )
                )
                .filter((t): t is DBTable => t !== undefined);
            members.forEach((t) => assigned.add(t.id));
            return { group, members };
        })
        .filter(({ members }) => members.length > 0);

    if (groups.length === 0) return [];

    const areas: Area[] = [];
    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;

    groups.forEach(({ group, members }, groupIndex) => {
        if (groupIndex > 0 && groupIndex % AREAS_PER_ROW === 0) {
            cursorX = 0;
            cursorY += rowHeight + AREA_GAP;
            rowHeight = 0;
        }

        const cols = Math.min(members.length, members.length > 4 ? 3 : 2);
        const dims = members.map((t) => getTableDimensions(t));
        const colWidths = Array.from({ length: cols }, (_, c) =>
            Math.max(
                ...dims.filter((_, i) => i % cols === c).map((d) => d.width)
            )
        );
        const rowCount = Math.ceil(members.length / cols);
        const rowHeights = Array.from({ length: rowCount }, (_, r) =>
            Math.max(
                ...dims
                    .filter((_, i) => Math.floor(i / cols) === r)
                    .map((d) => d.height)
            )
        );

        const color =
            group.color ??
            colorOptions.at(groupIndex % colorOptions.length) ??
            colorOptions[0];
        const area: Area = {
            id: generateId(),
            name: group.name,
            x: cursorX,
            y: cursorY,
            width:
                colWidths.reduce((a, b) => a + b, 0) +
                TABLE_GAP * (cols - 1) +
                AREA_PADDING * 2,
            height:
                rowHeights.reduce((a, b) => a + b, 0) +
                TABLE_GAP * (rowCount - 1) +
                AREA_PADDING * 2 +
                AREA_HEADER,
            color,
            order: groupIndex,
        };

        members.forEach((table, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            table.x =
                area.x +
                AREA_PADDING +
                colWidths.slice(0, c).reduce((a, b) => a + b, 0) +
                TABLE_GAP * c;
            table.y =
                area.y +
                AREA_PADDING +
                AREA_HEADER +
                rowHeights.slice(0, r).reduce((a, b) => a + b, 0) +
                TABLE_GAP * r;
            table.color = color;
            table.parentAreaId = area.id;
        });

        areas.push(area);
        cursorX += area.width + AREA_GAP;
        rowHeight = Math.max(rowHeight, area.height);
    });

    // Ungrouped tables: a plain grid below the groups.
    const ungrouped = tables.filter((t) => !assigned.has(t.id));
    const startY = cursorY + rowHeight + AREA_GAP;
    ungrouped.forEach((table, i) => {
        table.x = (i % 4) * 300;
        table.y = startY + Math.floor(i / 4) * 300;
    });

    return areas;
};
