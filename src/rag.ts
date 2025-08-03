import type { Env, ChatMessage, RAGOptions } from './types';
import { getDocumentContext } from './vectorize';

// Free tier model for chat
const CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

// Maximum vectors for free tier (same as in vectorize.ts)
const MAX_VECTORS = 100;

export async function generateRAGResponse(
  question: string,
  history: ChatMessage[],
  env: Env,
  options: RAGOptions = {}
): Promise<ReadableStream> {
  const {
    maxTokens = 2048,
    temperature = 0.7,
    stream = true,
    model = CHAT_MODEL,
  } = options;

  try {
    // Get relevant document context (ensure topK doesn't exceed MAX_VECTORS)
    const safeTopK = Math.min(4, MAX_VECTORS);
    const context = await getDocumentContext(question, safeTopK, env);
    
    // Prepare messages with context
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are IPLC Notebook Assistant, an AI that helps users understand and analyze their documents. 
        
Your responses should:
- Be grounded in the provided context from user documents
- Include citations when referencing specific information
- Be clear, concise, and helpful
- Acknowledge when information is not available in the provided context

When citing sources, use the format [Source: document name, page X] where applicable.`,
      },
      ...history.slice(-6), // Keep last 6 messages for context
      {
        role: 'user',
        content: context.length > 0 
          ? `Context from your documents:\n\n${context}\n\n---\n\nQuestion: ${question}`
          : `Question: ${question}\n\n(No relevant documents found in your notebook)`,
      },
    ];

    // Generate response
    const response = await env.AI.run(model, {
      messages,
      stream,
      max_tokens: maxTokens,
      temperature,
    });

    if (!stream) {
      // Non-streaming response
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: response.response })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
    }

    // Streaming response
    return createSSEStream(response);
  } catch (error) {
    console.error('RAG generation error:', error);
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMessage })}\n\n`));
        controller.close();
      },
    });
  }
}

function createSSEStream(aiStream: ReadableStream): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  return new ReadableStream({
    async start(controller) {
      const reader = aiStream.getReader();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            break;
          }
          
          // Parse the chunk and format as SSE
          const chunk = decoder.decode(value);
          const sseMessage = `data: ${JSON.stringify({ response: chunk })}\n\n`;
          controller.enqueue(encoder.encode(sseMessage));
        }
      } catch (error) {
        console.error('Stream error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Stream processing error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMessage })}\n\n`));
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export async function generateOutline(
  documents: string[],
  env: Env
): Promise<string> {
  try {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are an expert at creating comprehensive outlines from documents. Create a structured outline that captures the main topics, key points, and relationships between ideas.',
      },
      {
        role: 'user',
        content: `Create a comprehensive outline from these documents:\n\n${documents.join('\n\n---\n\n')}`,
      },
    ];

    const response = await env.AI.run(CHAT_MODEL, {
      messages,
      stream: false,
      max_tokens: 2048,
      temperature: 0.5,
    });

    return response.response || 'Failed to generate outline';
  } catch (error) {
    console.error('Outline generation error:', error);
    throw error;
  }
}

export async function generateSummary(
  text: string,
  env: Env,
  maxLength: number = 200
): Promise<string> {
  try {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert at creating concise summaries. Summarize the following text in no more than ${maxLength} words.`,
      },
      {
        role: 'user',
        content: text,
      },
    ];

    const response = await env.AI.run(CHAT_MODEL, {
      messages,
      stream: false,
      max_tokens: Math.floor(maxLength * 1.5), // Allow some buffer
      temperature: 0.3,
    });

    return response.response || 'Failed to generate summary';
  } catch (error) {
    console.error('Summary generation error:', error);
    throw error;
  }
}