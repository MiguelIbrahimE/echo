import { createBrowserRouter } from "react-router-dom";
import App from "./App";
import LinkGithubRepo from "./SignedUp/LinkGithubRepo";
import DocumentPage from "./SignedUp/DocumentPage";
import MyDocuments from "./SignedUp/MyDocuments";
import MyErrorBoundary from "./MyErrorBoundary";

const router = createBrowserRouter([
    {
        path: "/",
        element: <App />,
        errorElement: <MyErrorBoundary />,
    },
    {
        path: "/link-github",
        element: <LinkGithubRepo />,
    },
    {
        // The user’s main doc editor page
        path: "/document-page",
        element: <DocumentPage />,
    },
    {
        // The “My Documents” page that shows previously saved docs
        path: "/documents",
        element: <MyDocuments />,
    },
]);

export default router;
