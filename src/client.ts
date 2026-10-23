/**
 * Productive.io API client with authentication and rate limiting
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from "axios";
import { API_URL } from "./constants.js";
import { RateLimiter } from "./utils/rate-limiter.js";
import { handleAxiosError, ProductiveAPIError } from "./utils/errors.js";
import type { JSONAPIResponse } from "./types.js";

/**
 * Host that serves attachment files. The API token is only ever sent here.
 */
const FILES_HOST = "files.productive.io";

export class ProductiveClient {
  private readonly axios: AxiosInstance;
  private readonly apiToken: string;
  private readonly orgId: string;
  private readonly rateLimiter: RateLimiter;

  constructor(apiToken: string, orgId: string) {
    this.apiToken = apiToken;
    this.orgId = orgId;
    this.rateLimiter = new RateLimiter();

    this.axios = axios.create({
      baseURL: API_URL,
      headers: {
        "X-Auth-Token": apiToken,
        "X-Organization-Id": orgId,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
    });
  }

  /**
   * Make an API request with automatic rate limiting
   */
  async request<T = JSONAPIResponse>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    endpoint: string,
    data?: unknown,
    params?: Record<string, unknown>,
  ): Promise<T> {
    // Wait if we're approaching rate limit
    await this.rateLimiter.waitForRateLimit();

    try {
      const config: AxiosRequestConfig = {
        method,
        url: endpoint,
        params,
      };

      if (data) {
        config.data = data;
      }

      // Log outgoing request (safe logging to avoid EPIPE crashes)
      try {
        console.error("[Productive API Request]", {
          method,
          endpoint,
          params: params ? JSON.stringify(params) : undefined,
          hasData: !!data,
        });
      } catch {
        // Ignore logging errors
      }

      const response = await this.axios.request<T>(config);

      // Record successful request
      this.rateLimiter.recordRequest();

      // Log successful response (safe logging to avoid EPIPE crashes)
      try {
        console.error("[Productive API Response]", {
          method,
          endpoint,
          status: response.status,
          dataSize: JSON.stringify(response.data).length,
        });
      } catch {
        // Ignore logging errors
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = handleAxiosError(error as AxiosError);
        throw new ProductiveAPIError(
          errorMessage,
          error.response?.status,
          error,
        );
      }
      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T = JSONAPIResponse>(
    endpoint: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>("GET", endpoint, undefined, params);
  }

  /**
   * POST request
   */
  async post<T = JSONAPIResponse>(
    endpoint: string,
    data: unknown,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>("POST", endpoint, data, params);
  }

  /**
   * PATCH request
   */
  async patch<T = JSONAPIResponse>(
    endpoint: string,
    data: unknown,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return this.request<T>("PATCH", endpoint, data, params);
  }

  /**
   * DELETE request
   */
  async delete<T = JSONAPIResponse>(endpoint: string): Promise<T> {
    return this.request<T>("DELETE", endpoint);
  }

  /**
   * Download an attachment file from files.productive.io.
   *
   * Attachment URLs need a logged-in session: auth headers get a 302 to the
   * login page and the S3 temp_url returns 403. Passing the API token as a
   * `token` query parameter returns the file (undocumented, confirmed live).
   * The token is never logged and only sent to FILES_HOST.
   */
  async downloadFile(
    fileUrl: string,
    maxBytes: number,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const url = new URL(fileUrl);
    if (url.protocol !== "https:" || url.hostname !== FILES_HOST) {
      throw new Error(
        `Refusing to download from ${url.host}: only https://${FILES_HOST} URLs are supported`,
      );
    }
    url.searchParams.set("token", this.apiToken);

    await this.rateLimiter.waitForRateLimit();

    try {
      console.error("[Productive File Download]", { path: url.pathname });
    } catch {
      // Ignore logging errors
    }

    let response;
    try {
      response = await axios.get<ArrayBuffer>(url.toString(), {
        responseType: "arraybuffer",
        maxRedirects: 0,
        maxContentLength: maxBytes,
        timeout: 30000,
        validateStatus: (status) => status === 200,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Never surface the request URL: it carries the token
        const status = error.response?.status;
        const reason =
          status === 302
            ? "redirected to the login page (token rejected)"
            : status
              ? `HTTP ${status}`
              : /maxContentLength/.test(error.message)
                ? `file is larger than ${maxBytes} bytes`
                : error.code || "request failed";
        throw new ProductiveAPIError(`File download failed: ${reason}`, status);
      }
      throw error;
    } finally {
      this.rateLimiter.recordRequest();
    }

    const contentType = String(
      response.headers["content-type"] || "application/octet-stream",
    );
    if (contentType.startsWith("text/html")) {
      throw new ProductiveAPIError(
        "File download failed: got an HTML page instead of the file (token rejected?)",
      );
    }

    return { buffer: Buffer.from(response.data), contentType };
  }

  /**
   * Get organization ID
   */
  getOrgId(): string {
    return this.orgId;
  }

  /**
   * Get rate limiter status
   */
  getRateLimitStatus(): { count: number; limit: number; remaining: number } {
    return this.rateLimiter.getStatus();
  }
}
