export type NavigationItem = {
  label: string;
  to: string;
  shortLabel?: string;
  isPrimary?: boolean;
};

export const primaryNavigationItems: NavigationItem[] = [
  { label: "ホーム", to: "/" },
  { label: "新規プロジェクト", to: "/projects/new" },
  { label: "アナリティクス", to: "/analytics" },
];

export const mobileNavigationItems: NavigationItem[] = [
  { label: "ホーム", to: "/", shortLabel: "Home" },
  { label: "プロジェクト", to: "/p/demo-project", shortLabel: "Project" },
  { label: "支出追加", to: "/expenses/new", shortLabel: "Add", isPrimary: true },
  { label: "精算", to: "/p/demo-project", shortLabel: "Settle" },
  { label: "分析", to: "/analytics", shortLabel: "Analytics" },
];
