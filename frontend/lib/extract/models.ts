export type DeadlineType =
  | "exam"
  | "midterm"
  | "final"
  | "quiz"
  | "assignment"
  | "lab"
  | "project"
  | "reading"
  | "other";

export interface Evidence {
  snippet: string;         
  context: string;        
  indexStart: number;      
  indexEnd: number;
  matchedDateText: string; 
  matchedKeywords: string[];
}

export interface DeadlineCandidate {
  id: string;
  title: string;
  type: DeadlineType;
  dateISO: string;         // "YYYY-MM-DD"
  time24h?: string;        
  confidence: number;      // 0..100
  evidence: Evidence;
  flags: string[];
}

export interface ExtractionResult {
  candidates: DeadlineCandidate[];
  stats: {
    totalDatesFound: number;
    candidatesEmitted: number;
    lowConfidence: number;
  };
}
