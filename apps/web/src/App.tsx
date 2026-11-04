import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { NewPostingPage } from "./pages/NewPostingPage";
import { PostingsPage } from "./pages/PostingsPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PostingsPage />} />
        <Route path="postings/new" element={<NewPostingPage />} />
        <Route path="profile" element={<ComingSoonPage titleKey="nav.profile" />} />
        <Route path="*" element={<PostingsPage />} />
      </Route>
    </Routes>
  );
}
