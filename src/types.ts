export interface Env {
  AI: any;
  DOC_INDEX: VectorizeIndex;
  DOC_METADATA: KVNamespace;
  SESSION_DO: DurableObjectNamespace;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface EmbedResponse {
  success: boolean;
  vectorIds?: string[];
  error?: string;
}

export interface QueryResult {
  id: string;
  score: number;
  metadata: {
    chunk: string;
    documentId?: string;
    documentName?: string;
    pageNumber?: number;
    timestamp?: string;
  };
}

export interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  chunksCount: number;
  metadata?: Record<string, any>;
}

export interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, any>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<void>;
  query(vector: number[], options?: { topK?: number }): Promise<VectorizeMatch[]>;
  deleteByIds(ids: string[]): Promise<void>;
}

export interface EmbedMetadata {
  documentId: string;
  documentName: string;
  documentType: string;
  pageNumber?: number;
  chunkIndex?: number;
  timestamp?: string;
}

export interface RAGOptions {
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  model?: string;
}