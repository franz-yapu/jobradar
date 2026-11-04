import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { PostingsPage } from "./pages/PostingsPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PostingsPage />} />
        <Route path="postings/new" element={<ComingSoonPage titleKey="nav.add" />} />
        <Route path="profile" element={<ComingSoonPage titleKey="nav.profile" />} />
        <Route path="*" element={<PostingsPage />} />
      </Route>
    </Routes>
  );
}
