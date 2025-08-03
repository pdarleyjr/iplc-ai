import type { Env, EmbedResponse, QueryResult, VectorizeVector, EmbedMetadata } from './types';

// Free tier model for embeddings
const EMBED_MODEL = '@cf/baai/bge-small-en-v1.5';

// Cloudflare Vectorize free tier limit
const MAX_VECTORS = 100;

// KV key for tracking vector count
const VECTOR_COUNT_KEY = '__vector_count__';

// Vector quota tracking functions
export async function getVectorCount(env: Env): Promise<number> {
  const count = await env.DOC_METADATA.get(VECTOR_COUNT_KEY, 'text');
  return count ? parseInt(count, 10) : 0;
}

export async function updateVectorCount(env: Env, delta: number): Promise<number> {
  const currentCount = await getVectorCount(env);
  const newCount = Math.max(0, currentCount + delta);
  await env.DOC_METADATA.put(VECTOR_COUNT_KEY, newCount.toString());
  return newCount;
}

export async function checkVectorQuota(env: Env, requiredVectors: number): Promise<{ allowed: boolean; currentCount: number; availableQuota: number }> {
  const currentCount = await getVectorCount(env);
  const availableQuota = MAX_VECTORS - currentCount;
  const allowed = requiredVectors <= availableQuota;
  
  return {
    allowed,
    currentCount,
    availableQuota
  };
}

// Emit structured metrics for quota monitoring
export function emitQuotaMetric(
  env: Env,
  metrics: {
    count: number;
    delta?: number;
    reason: string;
  }
): void {
  const logEntry = {
    type: 'vector_quota',
    timestamp: new Date().toISOString(),
    count: metrics.count,
    delta: metrics.delta,
    reason: metrics.reason,
    percentUsed: (metrics.count / MAX_VECTORS) * 100
  };
  
  console.log('[METRIC]', JSON.stringify(logEntry));
}

// Chunk text into smaller pieces for embedding
export function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  let currentChunk = '';
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += ' ' + sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

export async function embedAndStore(
  texts: string[],
  metadata: EmbedMetadata,
  env: Env
): Promise<EmbedResponse> {
  try {
    // Chunk texts if they're too large
    const allChunks: string[] = [];
    const chunkMetadata: Array<any> = [];
    
    texts.forEach((text, textIndex) => {
      const chunks = chunkText(text);
      chunks.forEach((chunk, chunkIndex) => {
        allChunks.push(chunk);
        chunkMetadata.push({
          ...metadata,
          chunkIndex,
          textIndex,
          chunk: chunk.slice(0, 200), // Store first 200 chars for preview
          fullChunk: chunk,
          timestamp: new Date().toISOString(),
        });
      });
    });

    // Check vector quota before proceeding
    const quotaCheck = await checkVectorQuota(env, allChunks.length);
    if (!quotaCheck.allowed) {
      // Emit metric for quota denial
      emitQuotaMetric(env, {
        count: quotaCheck.currentCount,
        delta: 0,
        reason: `quota_denied_requested_${allChunks.length}`
      });
      
      return {
        success: false,
        error: `Vector limit exceeded. Current count: ${quotaCheck.currentCount}/${MAX_VECTORS}. Requested: ${allChunks.length}. Available quota: ${quotaCheck.availableQuota}`
      };
    }

    // Generate embeddings using Workers AI
    const embedResponse = await env.AI.run(EMBED_MODEL, {
      text: allChunks,
    });

    if (!embedResponse || !embedResponse.data || !Array.isArray(embedResponse.data)) {
      throw new Error('Invalid embedding response');
    }

    // Prepare vectors for insertion
    const vectors: VectorizeVector[] = embedResponse.data.map((embedding: number[], idx: number) => ({
      id: `${metadata.documentId}-${Date.now()}-${idx}`,
      values: embedding,
      metadata: chunkMetadata[idx],
    }));

    // Insert vectors into Vectorize
    await env.DOC_INDEX.upsert(vectors);

    // Update vector count after successful insertion
    const newCount = await updateVectorCount(env, vectors.length);
    
    // Emit metric for successful upsert
    emitQuotaMetric(env, {
      count: newCount,
      delta: vectors.length,
      reason: `upsert_document_${metadata.documentId}`
    });

    // Store document metadata in KV
    const docMetadata = {
      name: metadata.documentName,
      type: metadata.documentType,
      chunksCount: vectors.length,
      uploadedAt: new Date().toISOString(),
      vectorIds: vectors.map(v => v.id),
    };
    
    await env.DOC_METADATA.put(metadata.documentId, JSON.stringify(docMetadata));

    return {
      success: true,
      vectorIds: vectors.map(v => v.id),
    };
  } catch (error) {
    console.error('Embed and store error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to embed and store documents',
    };
  }
}

export async function queryDocuments(
  query: string,
  limit: number,
  env: Env
): Promise<QueryResult[]> {
  try {
    // Validate topK parameter to ensure it doesn't exceed MAX_VECTORS
    const safeLimit = Math.min(limit, MAX_VECTORS);
    // Generate embedding for the query
    const queryEmbedding = await env.AI.run(EMBED_MODEL, {
      text: [query],
    });

    if (!queryEmbedding || !queryEmbedding.data || !Array.isArray(queryEmbedding.data[0])) {
      throw new Error('Invalid query embedding response');
    }

    // Query the vector index with safe limit
    const results = await env.DOC_INDEX.query(queryEmbedding.data[0], {
      topK: safeLimit,
    });

    // Map results to QueryResult format
    return results.map(match => ({
      id: match.id,
      score: match.score,
      metadata: {
        chunk: match.metadata?.chunk || '',
        documentId: match.metadata?.documentId,
        documentName: match.metadata?.documentName,
        pageNumber: match.metadata?.pageNumber,
        timestamp: match.metadata?.timestamp,
        // Include fullChunk if it exists in the metadata
        ...(match.metadata?.fullChunk ? { fullChunk: match.metadata.fullChunk } : {})
      },
    })) as QueryResult[];
  } catch (error) {
    console.error('Query documents error:', error);
    return [];
  }
}

export async function getDocumentContext(
  query: string,
  topK: number = 4,
  env: Env
): Promise<string> {
  // Ensure topK doesn't exceed MAX_VECTORS
  const safeTopK = Math.min(topK, MAX_VECTORS);
  const results = await queryDocuments(query, safeTopK, env);
  
  if (results.length === 0) {
    return '';
  }
  
  // Extract the full chunks from results
  const contextChunks = results
    .map(result => {
      // Check for fullChunk in the metadata (added during storage)
      const metadata = result.metadata as any;
      return metadata.fullChunk || metadata.chunk || '';
    })
    .filter(chunk => chunk.length > 0);
  
  return contextChunks.join('\n\n---\n\n');
}

// Export utility function for getting vector usage status
export async function getVectorUsageStatus(env: Env): Promise<{
  currentCount: number;
  maxCount: number;
  availableQuota: number;
  percentageUsed: number;
}> {
  const currentCount = await getVectorCount(env);
  const availableQuota = MAX_VECTORS - currentCount;
  const percentageUsed = (currentCount / MAX_VECTORS) * 100;

  return {
    currentCount,
    maxCount: MAX_VECTORS,
    availableQuota,
    percentageUsed: Math.round(percentageUsed * 100) / 100 // Round to 2 decimal places
  };
}

// Export function to delete document vectors with count update
export async function deleteDocumentVectors(
  documentId: string,
  env: Env
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  try {
    // Get document metadata
    const metadata = await env.DOC_METADATA.get(documentId, 'json') as any;
    
    if (!metadata || !metadata.vectorIds) {
      return { success: true, deletedCount: 0 };
    }

    const vectorIds = metadata.vectorIds;
    
    // Delete vectors from index
    await env.DOC_INDEX.deleteByIds(vectorIds);
    
    // Update vector count
    const newCount = await updateVectorCount(env, -vectorIds.length);
    
    // Emit metric for successful deletion
    emitQuotaMetric(env, {
      count: newCount,
      delta: -vectorIds.length,
      reason: `delete_document_${documentId}`
    });
    
    // Delete document metadata
    await env.DOC_METADATA.delete(documentId);
    
    return {
      success: true,
      deletedCount: vectorIds.length
    };
  } catch (error) {
    console.error('Error deleting document vectors:', error);
    return {
      success: false,
      deletedCount: 0,
      error: error instanceof Error ? error.message : 'Failed to delete document vectors'
    };
  }
}