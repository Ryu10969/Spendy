import type { ProjectStatus, ProjectType, RoundingUnit } from "../types/project";
import { apiRequest } from "./client";

export type ProjectMemberResponse = {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
};

export type ProjectResponse = {
  publicToken: string;
  name: string;
  description: string | null;
  type: ProjectType;
  currency: "JPY";
  roundingUnit: RoundingUnit;
  status: ProjectStatus;
  members: ProjectMemberResponse[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type ProjectPageResponse = {
  items: ProjectResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type CreateProjectRequest = {
  name: string;
  description?: string;
  type: ProjectType;
  roundingUnit: RoundingUnit;
  members: Array<{ name: string }>;
};

export function createProject(request: CreateProjectRequest): Promise<ProjectResponse> {
  return apiRequest<ProjectResponse>("/api/projects", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getProject(publicToken: string): Promise<ProjectResponse> {
  return apiRequest<ProjectResponse>(`/api/projects/${encodeURIComponent(publicToken)}`);
}

export function addProjectMember(publicToken: string, name: string): Promise<ProjectMemberResponse> {
  return apiRequest<ProjectMemberResponse>(`/api/projects/${encodeURIComponent(publicToken)}/members`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function renameProjectMember(publicToken: string, memberId: string, name: string): Promise<ProjectMemberResponse> {
  return apiRequest<ProjectMemberResponse>(
    `/api/projects/${encodeURIComponent(publicToken)}/members/${encodeURIComponent(memberId)}`,
    { method: "PATCH", body: JSON.stringify({ name }) },
  );
}

export function getProjects(signal?: AbortSignal): Promise<ProjectResponse[]> {
  return apiRequest<ProjectResponse[]>("/api/projects", { signal });
}

export function getProjectPage(page: number, size: number, status?: ProjectStatus, query?: string): Promise<ProjectPageResponse> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (status) params.set("status", status);
  if (query) params.set("query", query);
  return apiRequest<ProjectPageResponse>(`/api/projects/page?${params}`);
}

export function archiveProject(publicToken: string): Promise<ProjectResponse> {
  return apiRequest<ProjectResponse>(
    `/api/projects/${encodeURIComponent(publicToken)}/archive`,
    {
      method: "POST",
      body: JSON.stringify({ confirmed: true }),
    },
  );
}

export function deleteProject(publicToken: string): Promise<void> {
  return apiRequest<void>(`/api/projects/${encodeURIComponent(publicToken)}`, {
    method: "DELETE",
  });
}
