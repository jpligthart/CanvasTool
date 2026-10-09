import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell, CourseLayout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { HomePage } from "./pages/HomePage";
import { StudentsPage } from "./pages/StudentsPage";
import { SectionsPage } from "./pages/SectionsPage";
import { GroupsPage } from "./pages/GroupsPage";
import { AssignmentsPage } from "./pages/AssignmentsPage";

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="cursus/:courseId" element={<CourseLayout />}>
              <Route index element={<Navigate to="studenten" replace />} />
              <Route path="studenten" element={<StudentsPage />} />
              <Route path="secties" element={<SectionsPage />} />
              <Route path="groepen" element={<GroupsPage />} />
              <Route path="opdrachten" element={<AssignmentsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
