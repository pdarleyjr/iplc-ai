// Request payload types for API endpoints

export interface EmbedRequest {
  texts: string[];
  metadata?: {
    documentId: string;
    documentName: string;
    documentType: string;
    pageNumber?: number;
    chunkIndex?: number;
    timestamp?: string;
    [key: string]: any;
  };
}

export interface RAGRequest {
  question: string;
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  sessionId?: string;
}

export interface QueryRequest {
  query: string;
  limit?: number;
}

export interface DeleteDocumentRequest {
  documentId: string;
}

// Type guards
export function isEmbedRequest(data: unknown): data is EmbedRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'texts' in data &&
    Array.isArray((data as any).texts) &&
    (data as any).texts.every((text: any) => typeof text === 'string')
  );
}

export function isRAGRequest(data: unknown): data is RAGRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'question' in data &&
    typeof (data as any).question === 'string'
  );
}

export function isQueryRequest(data: unknown): data is QueryRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'query' in data &&
    typeof (data as any).query === 'string'
  );
}

export function isDeleteDocumentRequest(data: unknown): data is DeleteDocumentRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'documentId' in data &&
    typeof (data as any).documentId === 'string'
  );
}