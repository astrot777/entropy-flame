// Written with Claude (Anthropic) as an SI coding assistant; reviewed by the team.
import type { FieldKey } from '../../src/shared/types';

export const LABELS: Record<FieldKey, string> = {
  psiId: 'PSI ID', name: 'Investigation', type: 'Type', objectives: 'Objectives', pillar: 'Pillar',
  fuel: 'Fuel / material', sample: 'Sample', oxygen: 'Oxygen', pressure: 'Pressure', airflow: 'Airflow',
  hardware: 'Hardware', sensors: 'Sensors',
};
