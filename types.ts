
export interface Anomaly {
  id: string;
  timestamp: Date;
  offsetSeconds?: number;
  durationSeconds: number;
  intensity: number; // Stosunek wyniku do progu
  severity: 'Low' | 'Medium' | 'High';
  description: string;
  audioUrl?: string; 
  type: 'Mechanical' | 'Electrical' | 'Airflow' | 'Other';
  verificationStatus?: 'Pending' | 'Verified' | 'FalsePositive';
  spectralData?: number[][];
}

export interface AudioChartData {
  time: string;
  amplitude: number;
  anomalyLevel: number;
  second?: number;
}

export interface DetectionResult {
  isAnomaly: boolean;
  confidence: number;
  description: string;
  type: string;
}
