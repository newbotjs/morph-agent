import { CapabilityStrategy, Json } from '../types';

/**
 * Parameters for the CallApi capability
 */
export interface CallApiParams {
  /**
   * URL to call
   */
  url: string;
  
  /**
   * HTTP method to use (default: GET)
   */
  method?: string;
  
  /**
   * Optional request body
   */
  body?: Json;
  
  /**
   * Optional request headers
   */
  headers?: Record<string, string>;

  /**
   * Allow additional properties to satisfy Json constraint
   */
  [k: string]: Json | undefined;
}

/**
 * Response from the CallApi capability
 */
export interface CallApiResult {
  /**
   * HTTP status code
   */
  status: number;
  
  /**
   * Parsed JSON response body
   */
  json: Json;
  
  /**
   * Allow additional properties to satisfy Json constraint
   */
  [k: string]: Json | number;
}

/**
 * Strategy for making API calls
 * 
 * This strategy provides a capability to make HTTP requests to external APIs
 * in an edge-compatible way, using the provided fetch implementation.
 */
export const CallApiStrategy: CapabilityStrategy<CallApiParams, CallApiResult> = {
  kind: 'callApi',
  
  async run({ url, method = 'GET', body, headers = {} }, env) {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    
    // Add body if present
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    // Make the request
    const response = await env.fetch(url, options);
    
    // Parse JSON response
    let json: Json;
    try {
      json = await response.json() as Json;
    } catch (err) {
      json = null;
    }
    
    return {
      status: response.status,
      json,
    };
  },
}; 