import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getExpenses, type ExpenseResponse } from "../../api/expenseApi";
import { ApiError } from "../../api/client";
import {
  archiveProject,
  addProjectMember,
  createProject,
  deleteProject,
  getProject,
  getProjectPage,
  renameProjectMember,
  type CreateProjectRequest,
  type ProjectMemberResponse,
  type ProjectPageResponse,
  type ProjectResponse,
} from "../../api/projectApi";
import type { ProjectListItem, ProjectStatus } from "../../types/project";
import { settlementKeys } from "../settlements/settlementQueries";
import { invalidateProjectAnalytics } from "../analytics/analyticsQueries";

export const projectKeys = {
  list: ["projects", "list"] as const,
  analyticsCatalog: ["projects", "list", "analytics-catalog"] as const,
  page: (status: ProjectStatus | undefined, query: string, page: number, size: number) =>
    [...projectKeys.list, status ?? "ALL", query, page, size] as const,
  detail: (publicToken: string) => ["projects", "detail", publicToken] as const,
};

type HomeProjectPage = Omit<ProjectPageResponse, "items"> & { items: ProjectListItem[] };

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateProjectRequest) => createProject(request),
    onSuccess: (project) => {
      void invalidateProjectAnalytics(queryClient, project.publicToken);
      void queryClient.invalidateQueries({ queryKey: projectKeys.list });
    },
  });
}

export function useProjectPageQuery(
  status: ProjectStatus | undefined,
  query: string,
  page: number,
  size: number,
  enabled = true,
) {
  return useQuery({
    queryKey: projectKeys.page(status, query, page, size),
    queryFn: async () => {
      const result = await getProjectPage(page, size, status, query);
      return {
        ...result,
        items: await Promise.all(result.items.map(async (project) =>
          toHomeProject(project, (await getExpenses(project.publicToken)).items))),
      };
    },
    enabled,
  });
}

function toHomeProject(project: ProjectResponse, expenses: ExpenseResponse[]): ProjectListItem {
  const balances = new Map<string, bigint>();
  let totalExpenseYen = 0n;
  let updatedAt = project.updatedAt;
  for (const expense of expenses) {
    const amount = BigInt(expense.amount);
    totalExpenseYen += amount;
    balances.set(expense.payerMemberId, (balances.get(expense.payerMemberId) ?? 0n) + amount);
    for (const participant of expense.participants) {
      balances.set(participant.memberId,
        (balances.get(participant.memberId) ?? 0n) - BigInt(participant.allocatedShare));
    }
    if (expense.updatedAt > updatedAt) updatedAt = expense.updatedAt;
  }
  const balanceYen = [...balances.values()].reduce(
    (total, balance) => total + (balance > 0n ? balance : 0n), 0n);
  return {
    id: project.publicToken,
    publicToken: project.publicToken,
    name: project.name,
    icon: "",
    type: project.type,
    status: project.status,
    members: project.members.map((member) => ({
      id: member.id,
      name: member.name,
      displayName: member.name,
      avatarLabel: Array.from(member.name)[0] ?? "",
      active: member.active,
    })),
    summary: {
      description: project.description ?? "",
      totalExpenseYen,
      expenseCount: expenses.length,
      balanceYen,
      lastUpdatedLabel: new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" })
        .format(new Date(updatedAt)),
    },
  };
}

export function useProjectQuery(publicToken: string | undefined, enabled = true) {
  return useQuery({
    queryKey: projectKeys.detail(publicToken ?? ""),
    queryFn: () => getProject(publicToken!),
    enabled: Boolean(publicToken) && enabled,
  });
}

export function reconcileProjectMember(
  project: ProjectResponse | undefined,
  member: ProjectMemberResponse,
): ProjectResponse | undefined {
  if (!project) return project;
  return {
    ...project,
    members: [...project.members.filter((current) => current.id !== member.id), member]
      .sort((left, right) => left.displayOrder - right.displayOrder),
  };
}

export function useProjectMemberMutations(publicToken: string | undefined) {
  const queryClient = useQueryClient();
  const token = publicToken ?? "";
  const detailKey = projectKeys.detail(token);
  const reconcile = async (member: ProjectMemberResponse) => {
    void invalidateProjectAnalytics(queryClient, token);
    await queryClient.cancelQueries({ queryKey: detailKey, exact: true });
    queryClient.setQueryData<ProjectResponse>(detailKey,
      (project) => reconcileProjectMember(project, member));
    void queryClient.invalidateQueries({ queryKey: detailKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: projectKeys.list });
  };
  const reconcileRejectedState = (error: unknown) => {
    if (error instanceof ApiError && ["PROJECT_ARCHIVED", "PROJECT_NOT_FOUND", "MEMBER_INACTIVE", "MEMBER_NOT_FOUND"]
      .includes(error.code)) {
      void queryClient.invalidateQueries({ queryKey: detailKey, exact: true });
    }
  };
  const add = useMutation({
    mutationFn: (name: string) => addProjectMember(token, name),
    onSuccess: reconcile,
    onError: reconcileRejectedState,
  });
  const rename = useMutation({
    mutationFn: ({ memberId, name }: { memberId: string; name: string }) =>
      renameProjectMember(token, memberId, name),
    onSuccess: reconcile,
    onError: reconcileRejectedState,
  });
  return { add, rename };
}

export function useArchiveProjectMutation(publicToken: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => archiveProject(publicToken!),
    onSuccess: (archivedProject) => {
      const detailKey = projectKeys.detail(publicToken ?? "");
      queryClient.setQueryData(detailKey, archivedProject);
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({ queryKey: projectKeys.list });
      void queryClient.invalidateQueries({
        queryKey: settlementKeys.project(publicToken ?? ""),
      });
    },
  });
}

export function useDeleteProjectMutation() {
  const queryClient = useQueryClient();

  async function reconcile(project: ProjectListItem) {
    const publicToken = project.publicToken;
    const cancelLists = queryClient.cancelQueries({ queryKey: projectKeys.list });
    queryClient.setQueryData<ProjectResponse[]>(projectKeys.analyticsCatalog,
      (current) => current?.filter((item) => item.publicToken !== publicToken));
    void invalidateProjectAnalytics(queryClient, publicToken, { deleted: true });
    await cancelLists;
    await queryClient.cancelQueries({ queryKey: ["projects", publicToken] });
    for (const [queryKey, current] of queryClient.getQueriesData<HomeProjectPage>(
      { queryKey: projectKeys.list },
    )) {
      if (!current || queryKey.length !== 6) continue;
      const status = queryKey[2];
      const query = queryKey[3];
      if (status !== "ALL" && status !== project.status) continue;
      if (typeof query !== "string"
        || !project.name.toLowerCase().includes(query.trim().toLowerCase())) continue;
      const totalElements = Math.max(0, current.totalElements - 1);
      queryClient.setQueryData<HomeProjectPage>(queryKey, {
        ...current,
        items: current.items.filter((item) => item.publicToken !== publicToken),
        totalElements,
        totalPages: Math.ceil(totalElements / current.size),
      });
    }
    queryClient.removeQueries({ queryKey: projectKeys.detail(publicToken), exact: true });
    queryClient.removeQueries({ queryKey: ["projects", publicToken] });
    queryClient.removeQueries({ queryKey: ["expense-conflicts", publicToken] });
    queryClient.removeQueries({ queryKey: ["expense-not-found", publicToken] });
    void queryClient.invalidateQueries({ queryKey: projectKeys.list });
  }

  return useMutation({
    mutationFn: (project: ProjectListItem) => deleteProject(project.publicToken),
    retry: false,
    onSuccess: (_, project) => reconcile(project),
    onError: (error, project) => {
      if (error instanceof ApiError && error.code === "PROJECT_NOT_FOUND") {
        return reconcile(project);
      }
    },
  });
}
