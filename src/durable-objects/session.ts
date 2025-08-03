import type { ChatMessage } from '../types';
import type { RAGRequest } from '../types/requests';

export class SessionDO {
  state: DurableObjectState;
  env: any;
  
  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle different session operations
    switch (url.pathname) {
      case '/rag':
        return this.handleRAGRequest(request);
      case '/history':
        return this.getHistory();
      case '/clear':
        return this.clearHistory();
      default:
        return new Response('Not found', { status: 404 });
    }
  }
  
  private async handleRAGRequest(request: Request): Promise<Response> {
    const data = await request.json();
    
    // Validate request data
    if (!data || typeof data !== 'object' || !('question' in data) || typeof data.question !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid request: question is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const requestData = data as RAGRequest;
    const { question, history = [] } = requestData;
    
    // Get session history
    const sessionHistory = (await this.state.storage.get<ChatMessage[]>('history')) || [];
    
    // Merge provided history with session history
    const fullHistory = [...sessionHistory, ...history];
    
    // Update session history with new question
    await this.state.storage.put('history', [
      ...fullHistory,
      { role: 'user', content: question },
    ]);
    
    // Forward to the main RAG handler
    const ragResponse = await fetch(new URL('/rag', request.url).toString(), {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({
        question,
        history: fullHistory,
      }),
    });
    
    // If successful, add assistant response to history
    if (ragResponse.ok) {
      const clonedResponse = ragResponse.clone();
      const reader = clonedResponse.body?.getReader();
      const decoder = new TextDecoder();
      let assistantResponse = '';
      
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.response) {
                      assistantResponse += parsed.response;
                    }
                  } catch (e) {
                    // Ignore parse errors
                  }
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
      
      // Save assistant response to history
      if (assistantResponse) {
        const updatedHistory = await this.state.storage.get<ChatMessage[]>('history') || [];
        updatedHistory.push({ role: 'assistant', content: assistantResponse });
        await this.state.storage.put('history', updatedHistory);
      }
    }
    
    return ragResponse;
  }
  
  private async getHistory(): Promise<Response> {
    const history = (await this.state.storage.get<ChatMessage[]>('history')) || [];
    return new Response(JSON.stringify({ history }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  private async clearHistory(): Promise<Response> {
    await this.state.storage.delete('history');
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}