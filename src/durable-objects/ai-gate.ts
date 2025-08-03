/**
 * AIGate Durable Object
 * 
 * Enforces concurrency limits for AI requests on free tier (2 concurrent GPU jobs).
 * Uses Cloudflare's blockConcurrencyWhile to serialize requests.
 */
export class AIGate {
  private state: DurableObjectState;
  private activeRequests: number = 0;
  private readonly MAX_CONCURRENT = 2; // Free tier limit

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/queue') {
      // Queue and execute the AI request
      return this.handleQueueRequest(request);
    }
    
    if (url.pathname === '/status') {
      // Return current queue status
      return new Response(JSON.stringify({
        activeRequests: this.activeRequests,
        maxConcurrent: this.MAX_CONCURRENT,
        available: this.activeRequests < this.MAX_CONCURRENT
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleQueueRequest(request: Request): Promise<Response> {
    try {
      // Parse the AI request details from the body
      const data = await request.json() as any;
      
      if (!data || typeof data !== 'object') {
        return new Response(JSON.stringify({
          error: 'Invalid request body'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const { model, params, env } = data;
      
      // Use blockConcurrencyWhile to enforce concurrency limit
      const result = await this.state.blockConcurrencyWhile(async () => {
        // Check if we're at capacity
        if (this.activeRequests >= this.MAX_CONCURRENT) {
          // Wait for a slot to become available
          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (this.activeRequests < this.MAX_CONCURRENT) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 100); // Check every 100ms
          });
        }

        // Increment active requests
        this.activeRequests++;
        
        try {
          // Execute the AI request
          // Note: We need to reconstruct the env object with the AI binding
          const aiResponse = await this.executeAIRequest(model, params, env);
          return aiResponse;
        } finally {
          // Always decrement active requests
          this.activeRequests--;
        }
      });

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('AIGate queue error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Queue processing failed';
      return new Response(JSON.stringify({
        error: errorMessage
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async executeAIRequest(model: string, params: any, envData: any): Promise<any> {
    // This would need to be implemented to actually call the AI service
    // For now, we'll throw an error indicating it needs implementation
    throw new Error('AI execution needs to be implemented with proper env.AI binding');
  }
}

// Export namespace for wrangler.toml
export interface Env {
  AI_GATE: DurableObjectNamespace;
}