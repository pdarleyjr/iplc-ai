/**
 * Cleanup functionality for removing old vectors and logs
 * This module handles periodic maintenance of the Vectorize index and KV storage
 */

import type { VectorizeIndex, KVNamespace } from '@cloudflare/workers-types';
import { updateVectorCount } from './vectorize';

interface CleanupEnv {
  DOC_INDEX: VectorizeIndex;
  DOC_METADATA: KVNamespace;
  DOCUMENT_METADATA: KVNamespace;
  CHAT_HISTORY: KVNamespace;
}

/**
 * Remove vectors older than the specified age
 * @param env Worker environment bindings
 * @param maxAgeInDays Maximum age of vectors to keep
 */
export async function cleanupOldVectors(
  env: CleanupEnv,
  maxAgeInDays: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeInDays);
  const cutoffTimestamp = cutoffDate.getTime();
  
  let deletedCount = 0;
  
  try {
    // List all documents from KV metadata
    const documents = await env.DOCUMENT_METADATA.list();
    
    for (const key of documents.keys) {
      const metadata = await env.DOCUMENT_METADATA.get(key.name, 'json') as any;
      
      if (metadata && metadata.uploadedAt) {
        const uploadTimestamp = new Date(metadata.uploadedAt).getTime();
        
        if (uploadTimestamp < cutoffTimestamp) {
          // Delete vectors for this document
          const vectorIds = metadata.chunks?.map((chunk: any) => chunk.id) || [];
          
          if (vectorIds.length > 0) {
            try {
              await env.DOC_INDEX.deleteByIds(vectorIds);
              deletedCount += vectorIds.length;
              
              // Update vector count after successful deletion
              await updateVectorCount(env as any, -vectorIds.length);
            } catch (error) {
              console.error(`Error deleting vectors for document ${key.name}:`, error);
            }
          }
          
          // Delete the metadata
          await env.DOCUMENT_METADATA.delete(key.name);
        }
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Error during vector cleanup:', error);
    return deletedCount;
  }
}


/**
 * Main cleanup handler for scheduled execution
 * @param env Worker environment bindings
 * @returns Cleanup statistics
 */
export async function handleScheduledCleanup(env: CleanupEnv): Promise<{
  vectorsDeleted: number;
  executionTime: number;
}> {
  const startTime = Date.now();
  
  // Run cleanup task
  const vectorsDeleted = await cleanupOldVectors(env, 30); // Keep vectors for 30 days
  
  const executionTime = Date.now() - startTime;
  
  // Log cleanup results
  console.log(`Cleanup completed:
    - Vectors deleted: ${vectorsDeleted}
    - Execution time: ${executionTime}ms
  `);
  
  return {
    vectorsDeleted,
    executionTime
  };
}