import type { ExpenseListResponse } from "../../api/expenseApi";
import type { ProjectResponse } from "../../api/projectApi";
import type { SettlementResponse } from "../../api/settlementApi";

export function sameSettlementFingerprint(
  first: SettlementResponse,
  ...others: SettlementResponse[]
): boolean {
  return Boolean(first.sourceStateFingerprint)
    && others.every((response) =>
      response.sourceStateFingerprint === first.sourceStateFingerprint);
}

function sourceState(project: ProjectResponse, expenses: ExpenseListResponse): string {
  return JSON.stringify([
    project.publicToken,
    project.type,
    project.status,
    project.roundingUnit,
    [...project.members]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((member) => [member.id, member.name, member.displayOrder, member.active]),
    [...expenses.items]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((expense) => [
        expense.id,
        expense.version,
        expense.payerMemberId,
        expense.amount,
        [...expense.participants]
          .sort((left, right) => left.allocationOrder - right.allocationOrder
            || left.memberId.localeCompare(right.memberId))
          .map((participant) => [
            participant.memberId,
            participant.allocatedShare,
            participant.allocationOrder,
          ]),
      ]),
  ]);
}

export function sameSettlementSource(
  firstProject: ProjectResponse,
  firstExpenses: ExpenseListResponse,
  latestProject: ProjectResponse,
  latestExpenses: ExpenseListResponse,
): boolean {
  return sourceState(firstProject, firstExpenses) === sourceState(latestProject, latestExpenses);
}
