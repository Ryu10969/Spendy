import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { AnalyticsPage } from "../pages/AnalyticsPage/AnalyticsPage";
import { GlobalExpenseCreatePage } from "../pages/ExpenseCreatePage/GlobalExpenseCreatePage";
import { ProjectExpenseCreatePage } from "../pages/ExpenseCreatePage/ProjectExpenseCreatePage";
import { HomePage } from "../pages/HomePage/HomePage";
import { ArchivesPage } from "../pages/ArchivesPage/ArchivesPage";
import { ProjectCreatePage } from "../pages/ProjectCreatePage/ProjectCreatePage";
import { ProjectDetailPage } from "../pages/ProjectDetailPage/ProjectDetailPage";
import { ProjectEditPage } from "../pages/ProjectEditPage/ProjectEditPage";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/archives", element: <ArchivesPage /> },
      { path: "/analytics", element: <AnalyticsPage /> },
      {
        path: "/projects/new",
        element: <ProjectCreatePage />,
      },
      {
        path: "/p/:publicToken",
        element: <ProjectDetailPage />,
      },
      {
        path: "/p/:publicToken/expenses/new",
        element: <ProjectExpenseCreatePage />,
      },
      {
        path: "/expenses/new",
        element: <GlobalExpenseCreatePage />,
      },
      {
        path: "/p/:publicToken/edit",
        element: <ProjectEditPage />,
      },
    ],
  },
]);
