import { useQuery } from "@tanstack/react-query";
import { getProjectPage } from "../../api/projectApi";

export function useQuickAddProjectPageQuery(search: string, page: number) {
  return useQuery({
    queryKey: ["projects", "list", "quick-add", search, page, 5],
    queryFn: () => getProjectPage(page, 5, "ACTIVE", search),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    placeholderData: undefined,
  });
}
