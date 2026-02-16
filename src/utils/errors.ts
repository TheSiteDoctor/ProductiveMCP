/**
 * Error handling utilities
 */

import { AxiosError } from 'axios';

export class ProductiveAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ProductiveAPIError';
  }
}

/**
 * Convert an Axios error to a user-friendly, actionable error message
 */
export function handleAxiosError(error: AxiosError): string {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data as unknown;

    // Log detailed error information to stderr for debugging
    console.error('[Productive API Error]', {
      status: status,
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url,
      data: JSON.stringify(data, null, 2),
    });

    switch (status) {
      case 400:
        return formatBadRequestError(data);
      case 401:
        return 'Error: Authentication failed. Please check your PRODUCTIVE_API_TOKEN environment variable.';
      case 403:
        return 'Error: Access forbidden. Please check your PRODUCTIVE_ORG_ID and API token permissions.';
      case 404:
        return formatNotFoundError(data);
      case 422:
        return formatValidationError(data);
      case 429:
        return 'Error: Rate limit exceeded (100 requests/10s). Please wait before retrying.';
      case 500:
      case 502:
      case 503:
        return 'Error: Productive.io server error. Please try again later.';
      default:
        return `Error: API request failed with status ${status}. ${extractErrorMessage(data)}`;
    }
  } else if (error.request) {
    console.error('[Productive API Error] No response received:', {
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url,
    });
    return 'Error: No response from Productive.io API. Please check your internet connection.';
  } else {
    console.error('[Productive API Error] Request setup failed:', error.message);
    return `Error: Request setup failed. ${error.message}`;
  }
}

function formatBadRequestError(data: unknown): string {
  const message = extractErrorMessage(data);
  return `Error: Bad request. ${message}`;
}

function formatNotFoundError(data: unknown): string {
  const message = extractErrorMessage(data);
  if (message.toLowerCase().includes('project')) {
    return `Error: Project not found. ${message} Use productive_list_projects to see available projects.`;
  } else if (message.toLowerCase().includes('task')) {
    return `Error: Task not found. ${message}`;
  }
  return `Error: Resource not found. ${message}`;
}

function formatValidationError(data: unknown): string {
  const message = extractErrorMessage(data);

  // Common validation errors with helpful hints
  if (message.toLowerCase().includes('title')) {
    return `Error: Invalid title. ${message} Task titles must be 1-200 characters.`;
  } else if (message.toLowerCase().includes('date')) {
    return `Error: Invalid date format. ${message} Use ISO 8601 format (e.g., "2025-11-20").`;
  } else if (message.toLowerCase().includes('project')) {
    return `Error: Invalid project. ${message} Use productive_list_projects to see available projects.`;
  }

  return `Error: Validation failed. ${message}`;
}

function extractErrorMessage(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  // JSON:API error format
  if (typeof data === 'object' && data !== null && 'errors' in data) {
    const dataObj = data as { errors?: unknown[] };
    if (Array.isArray(dataObj.errors) && dataObj.errors.length > 0) {
      const errorMessages = dataObj.errors
        .map((err: unknown) => {
          if (typeof err === 'object' && err !== null) {
            const errObj = err as Record<string, unknown>;
            if (typeof errObj.detail === 'string') return errObj.detail;
            if (typeof errObj.title === 'string') return errObj.title;
          }
          return JSON.stringify(err);
        })
        .join('; ');
      return errorMessages;
    }
  }

  if (typeof data === 'object' && data !== null) {
    const dataObj = data as Record<string, unknown>;
    if (typeof dataObj.message === 'string') {
      return dataObj.message;
    }
    if (typeof dataObj.error === 'string') {
      return dataObj.error;
    }
  }

  return 'Unknown error occurred.';
}

/**
 * Validate required environment variables
 */
export function validateEnvironment(): void {
  const required = ['PRODUCTIVE_API_TOKEN', 'PRODUCTIVE_ORG_ID'];
  const missing = required.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new ProductiveAPIError(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Please set these in your .env file or environment.'
    );
  }
}
