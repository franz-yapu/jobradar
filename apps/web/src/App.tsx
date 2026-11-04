import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { NewPostingPage } from "./pages/NewPostingPage";
import { PostingsPage } from "./pages/PostingsPage";
import { ProfilePage } from "./pages/ProfilePage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PostingsPage />} />
        <Route path="postings/new" element={<NewPostingPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<PostingsPage />} />
      </Route>
    </Routes>
  );
}
