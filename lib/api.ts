import { NextResponse } from "next/server";

export function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function apiError(status: number, code: string, message: string, id: string, retryable = false) {
  return NextResponse.json(
    { error: { code, message, retryable, requestId: id } },
    { status, headers: { "x-request-id": id } },
  );
}

export function apiJson(data: Record<string, unknown>, id: string, status = 200) {
  return NextResponse.json({ ...data, requestId: id }, { status, headers: { "x-request-id": id } });
}

