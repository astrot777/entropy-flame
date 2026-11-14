// Written with an LLM coding assistant (SI); reviewed by the team.
export const FIELDS = ['psiId','name','type','objectives','pillar','fuel','sample','oxygen','pressure','airflow','hardware','sensors'] as const;
export type FieldKey = typeof FIELDS[number];
export type CellStatus = 'stated' | 'not stated' | 'reviewed';
export interface Cell { value: string | null; quote: string | null; source: string; status: CellStatus }
export type Row = { [K in FieldKey]: Cell } & { unreviewed?: true };
