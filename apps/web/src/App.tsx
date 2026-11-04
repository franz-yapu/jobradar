import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { NewPostingPage } from "./pages/NewPostingPage";
import { PostingsPage } from "./pages/PostingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import { TokensPage } from "./pages/TokensPage";

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<PostingsPage />} />
          <Route path="postings/new" element={<NewPostingPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings/tokens" element={<TokensPage />} />
          <Route path="*" element={<PostingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
