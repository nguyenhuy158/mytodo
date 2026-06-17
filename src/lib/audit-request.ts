import "server-only";

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { TaskHistoryMetadataValue } from "@/lib/tasks";

export type AuditRequestContext = Record<string, TaskHistoryMetadataValue>;

export function getAuditRequestContext(
  request: NextRequest,
): AuditRequestContext {
  return {
    requestId: getHeader(request, "x-request-id") ?? randomUUID(),
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search || null,
    ipAddress: getClientIp(request),
    userAgent: getHeader(request, "user-agent"),
    referer: getHeader(request, "referer"),
    origin: getHeader(request, "origin"),
    forwardedHost: getHeader(request, "x-forwarded-host"),
    forwardedProto: getHeader(request, "x-forwarded-proto"),
  };
}

function getClientIp(request: NextRequest) {
  const forwardedFor = getHeader(request, "x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  return (
    getHeader(request, "cf-connecting-ip") ??
    getHeader(request, "x-real-ip") ??
    null
  );
}

function getHeader(request: NextRequest, name: string) {
  return request.headers.get(name)?.trim() || null;
}
