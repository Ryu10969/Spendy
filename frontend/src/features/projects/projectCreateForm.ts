import type { ProjectType } from "../../types/project";

export type RoundingUnit = 1 | 10 | 100 | 1000;

export type MemberInput = {
  id: string;
  name: string;
};

export type ProjectCreateFormValues = {
  projectType: ProjectType | "";
  projectName: string;
  description: string;
  roundingUnit: RoundingUnit | "";
  members: MemberInput[];
};

export type ProjectCreateValidationErrors = {
  projectType?: string;
  projectName?: string;
  roundingUnit?: string;
  members?: string;
};

export type ProjectTypeOption = {
  value: ProjectType;
  label: string;
  icon: string;
  description: string;
};

export type RoundingUnitOption = {
  value: RoundingUnit;
  label: string;
};

let memberInputCounter = 0;

export const projectTypeOptions: ProjectTypeOption[] = [
  {
    value: "CONTINUOUS",
    label: "継続",
    icon: "🏠",
    description: "ルームメイト・カップル・家族など継続的な費用を管理",
  },
  {
    value: "EVENT",
    label: "イベント",
    icon: "✈️",
    description: "旅行・パーティーなど一回限りのグループイベント",
  },
];

export const roundingUnitOptions: RoundingUnitOption[] = [
  { value: 1, label: "¥1" },
  { value: 10, label: "¥10" },
  { value: 100, label: "¥100" },
  { value: 1000, label: "¥1,000" },
];

export function createMemberInput(name = ""): MemberInput {
  memberInputCounter += 1;
  return {
    id: `project-member-input-${memberInputCounter}`,
    name,
  };
}

export function createInitialProjectCreateForm(): ProjectCreateFormValues {
  return {
    projectType: "CONTINUOUS",
    projectName: "",
    description: "",
    roundingUnit: 10,
    members: [createMemberInput()],
  };
}

export function getTrimmedMemberNames(values: ProjectCreateFormValues): string[] {
  return values.members.map((member) => member.name.trim()).filter(Boolean);
}

export function validateProjectCreateForm(
  values: ProjectCreateFormValues,
): ProjectCreateValidationErrors {
  const errors: ProjectCreateValidationErrors = {};

  if (!values.projectType) {
    errors.projectType = "プロジェクトタイプを選択してください。";
  }

  if (!values.projectName.trim()) {
    errors.projectName = "プロジェクト名を入力してください。";
  }

  if (!values.roundingUnit) {
    errors.roundingUnit = "端数処理単位を選択してください。";
  }

  if (getTrimmedMemberNames(values).length === 0) {
    errors.members = "メンバーを1人以上入力してください。";
  }

  return errors;
}

export function hasProjectCreateErrors(errors: ProjectCreateValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
