/**
 * Productive.io API client with authentication and rate limiting
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from "axios";
import { API_URL } from "./constants.js";
import { RateLimiter } from "./utils/rate-limiter.js";
import { handleAxiosError, ProductiveAPIError } from "./utils/errors.js";
import type { JSONAPIResponse } from "./types.js";

export class ProductiveClient {
  private readonly axios: AxiosInstance;
  private readonly orgId: string;
  private readonly rateLimiter: RateLimiter;
  private currentPersonId: string | null = null;

  constructor(apiToken: string, orgId: string) {
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
   * Get organization ID
   */
  getOrgId(): string {
    return this.orgId;
  }

  /**
   * Resolve the person the API token belongs to.
   *
   * Productive has no `/people/me`, but `/organization_memberships` is scoped
   * to the authenticated token and returns exactly one record — its `person`
   * is the token owner. Cached for the lifetime of the client.
   */
  async getCurrentPersonId(): Promise<string> {
    if (this.currentPersonId) {
      return this.currentPersonId;
    }

    const response = await this.get<JSONAPIResponse>(
      "/organization_memberships",
      { include: "person", "page[size]": 1 },
    );

    const membership = Array.isArray(response.data)
      ? response.data[0]
      : response.data;
    const personRef = (
      membership as
        | { relationships?: { person?: { data?: { id?: string } } } }
        | undefined
    )?.relationships?.person?.data;

    // Fall back to the included person, since relationship linkage is only
    // present because of the explicit `include` above.
    const includedPerson = (response.included || []).find(
      (item): item is { type: string; id: string } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "people",
    );

    const personId = personRef?.id || includedPerson?.id;
    if (!personId) {
      throw new ProductiveAPIError(
        "Could not determine which person this API token belongs to. " +
          "Pass person_id explicitly.",
      );
    }

    this.currentPersonId = personId;
    return personId;
  }

  /**
   * Get rate limiter status
   */
  getRateLimitStatus(): { count: number; limit: number; remaining: number } {
    return this.rateLimiter.getStatus();
  }
}
