import { config } from '../config';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  temperature?: number;
  system?: string;
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeService {
  private static readonly API_URL = 'https://api.anthropic.com/v1/messages';
  private static readonly MODEL = 'claude-opus-4-20250514';
  
  /**
   * Send a message to Claude API
   */
  static async sendMessage(
    messages: ClaudeMessage[],
    system?: string,
    maxTokens: number = 1024,
    temperature: number = 0.7
  ): Promise<string> {
    try {
      const request: ClaudeRequest = {
        model: this.MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(system && { system }),
      };

      console.log('🤖 [Claude API] Sending request:', {
        model: this.MODEL,
        messageCount: messages.length,
        maxTokens,
        temperature,
        hasSystem: !!system,
        systemPreview: system?.substring(0, 100) + '...',
      });

      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.claude.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ [Claude API] Error response:', {
          status: response.status,
          error,
        });
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json() as ClaudeResponse;

      console.log('🤖 [Claude API] Response received:', {
        id: data.id,
        model: data.model,
        stopReason: data.stop_reason,
        usage: data.usage,
        contentLength: data.content?.[0]?.text?.length,
      });
      
      // Extract text from the response
      const text = data.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      
      return text;
    } catch (error) {
      console.error('Error calling Claude API:', error);
      throw error;
    }
  }

  /**
   * Generate content with a specific prompt
   */
  static async generateContent(
    prompt: string,
    system?: string,
    maxTokens: number = 1024,
    temperature: number = 0.7
  ): Promise<string> {
    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: prompt,
      },
    ];

    return this.sendMessage(messages, system, maxTokens, temperature);
  }

  /**
   * Parse JSON response from Claude
   */
  static async generateJSON<T>(
    prompt: string,
    system?: string,
    maxTokens: number = 1024,
    temperature: number = 0.7
  ): Promise<T> {
    // Add instruction to return valid JSON
    const jsonPrompt = `${prompt}\n\nPlease respond with valid JSON only, no markdown formatting or extra text.`;
    
    console.log('🤖 [Claude API] Requesting JSON response');
    
    const response = await this.generateContent(jsonPrompt, system, maxTokens, temperature);
    
    console.log('🤖 [Claude API] Raw response for JSON parsing:', {
      responseLength: response.length,
      responsePreview: response.substring(0, 200) + '...',
    });
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('🤖 [Claude API] Found JSON object in response, parsing...');
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('🤖 [Claude API] Successfully parsed JSON:', {
          keys: Object.keys(parsed),
        });
        return parsed;
      }
      
      // If no JSON object found, try parsing the whole response
      console.log('🤖 [Claude API] No JSON object found, attempting to parse entire response');
      const parsed = JSON.parse(response);
      console.log('🤖 [Claude API] Successfully parsed entire response as JSON');
      return parsed;
    } catch (error) {
      console.error('❌ [Claude API] Failed to parse response as JSON:', {
        error: error instanceof Error ? error.message : error,
        response: response.substring(0, 500),
      });
      throw new Error('Invalid JSON response from Claude');
    }
  }
}